import json
import logging
import os
import signal
import tempfile
import time
import uuid
from datetime import date
from pathlib import Path
from typing import Any

from minio.error import S3Error

from app.schemas import SummarizationSegment
from app.storage import download_object, object_exists, read_json, write_json
from app.streams import (
    ANALYSIS_GROUP,
    ANALYSIS_STREAM,
    RETRY_LIMIT,
    RESULT_STREAM,
    TRANSCRIPTION_GROUP,
    TRANSCRIPTION_STREAM,
    acknowledge,
    acquire_job_lock,
    claim_pending,
    connection,
    ensure_group,
    publish,
    read_one,
    release_job_lock,
    release_retries,
    schedule_retry,
)
from app.summarization import summarize_transcript
from app.transcription import transcribe_audio

RESULT_BUCKET = os.getenv("MINIO_BUCKET_AI_RESULTS", "meeting-ai-results")
STOP = False
logger = logging.getLogger(__name__)


def _stop(*_args: Any) -> None:
    global STOP
    STOP = True


def _job_payload(message: Any) -> dict[str, Any]:
    return {
        "recordingId": message.payload.get("recordingId"),
        "transcriptId": message.payload.get("transcriptId"),
        "analysisRunId": message.payload.get("analysisRunId"),
    }


def _fixture_transcription(audio_path: Path) -> dict[str, Any]:
    texts = [
        "Thanks for joining. Let us start with the status update.",
        "The recording workflow processed this meeting with the fixture transcription adapter.",
        "We agreed to follow up on the open items before the next meeting.",
    ]
    segments = [
        {
            "startSeconds": index * 20,
            "endSeconds": (index + 1) * 20,
            "speaker": f"Speaker {index + 1}",
            "text": text,
        }
        for index, text in enumerate(texts)
    ]
    return {
        "text": " ".join(texts),
        "segments": segments,
        "durationSeconds": len(segments) * 20,
        "provider": "fixture",
        "model": "fixture-transcription-v1",
    }


def _transcribe(payload: dict[str, Any]) -> dict[str, Any]:
    recording = payload["recording"]
    with tempfile.TemporaryDirectory(prefix="meeting-ai-") as directory:
        audio_path = Path(directory) / Path(recording.get("fileName") or "recording.audio").name
        download_object(recording["bucketName"], recording["objectKey"], audio_path)

        provider = os.getenv("AI_TRANSCRIPTION_PROVIDER")
        if not provider:
            raise RuntimeError("AI_TRANSCRIPTION_PROVIDER is not configured")

        if provider == "fixture":
            return _fixture_transcription(audio_path)

        if provider != "whisper":
            raise RuntimeError(f"Unknown transcription provider: {provider}")

        result = transcribe_audio(str(audio_path), os.getenv("AI_TRANSCRIPTION_LANGUAGE", "en"))
        segments = [
            {
                "startSeconds": segment["start"],
                "endSeconds": segment["end"],
                "speaker": None,
                "text": segment["text"],
            }
            for segment in result["segments"]
        ]
        duration = result.get("duration_seconds")
        return {
            "text": result["text"],
            "segments": segments,
            "durationSeconds": int(duration + 0.999999) if duration is not None else None,
            "provider": "whisper",
            "model": result["model"],
        }


def _resolve_assignee(owner: str | None, participants: list[dict[str, Any]]) -> str | None:
    if not owner:
        return None

    matches = [
        participant["id"]
        for participant in participants
        if participant.get("name", "").strip().casefold() == owner.strip().casefold()
    ]
    return matches[0] if len(matches) == 1 else None


def _parse_due_date(value: str | None) -> str | None:
    if not value:
        return None

    try:
        return date.fromisoformat(value).isoformat()
    except ValueError:
        return None


def _fixture_analysis(segment_count: int) -> dict[str, Any]:
    clamp = lambda index: min(index, max(segment_count - 1, 0))
    return {
        "summary": "The team reviewed status, confirmed the recording workflow processed this meeting, and agreed to follow up on open items.",
        "keyDiscussions": [
            {
                "topic": "Status update",
                "detail": "The meeting opened with a round of status updates.",
                "evidence": [clamp(0)],
            },
            {
                "topic": "Recording workflow",
                "detail": "The recording was transcribed by the configured provider.",
                "evidence": [clamp(1)],
            },
        ],
        "decisions": [
            {
                "decision": "Follow up on the open items before the next meeting.",
                "rationale": "Agreed at the end of the discussion.",
                "evidence": [clamp(2)],
            }
        ],
        "suggestions": [
            {
                "title": "Circulate the status update notes",
                "description": "Share the status summary with everyone who could not attend.",
                "assigneeId": None,
                "dueDate": None,
                "priority": "medium",
                "evidence": [clamp(0)],
            },
            {
                "title": "Close out the open items",
                "description": "Confirm each open item is resolved before the next meeting.",
                "assigneeId": None,
                "dueDate": None,
                "priority": "high",
                "evidence": [clamp(2)],
            },
        ],
        "provider": "fixture",
        "model": "fixture-analysis-v1",
        "promptVersion": "2026-08-27",
    }


def _analyse(payload: dict[str, Any]) -> dict[str, Any]:
    transcript = read_json(
        payload["transcriptResultRef"]["bucket"],
        payload["transcriptResultRef"]["key"],
    )
    segments = transcript.get("segments", [])
    participants = payload.get("participants", [])

    if not segments:
        raise ValueError("Analysis requires a transcript with at least one segment")

    provider = os.getenv("AI_ANALYSIS_PROVIDER")
    if not provider:
        raise RuntimeError("AI_ANALYSIS_PROVIDER is not configured")

    if provider == "fixture":
        return _fixture_analysis(len(segments))

    if provider != "llm":
        raise RuntimeError(f"Unknown analysis provider: {provider}")

    request_segments = [
        SummarizationSegment(index=index, text=segment.get("text", ""))
        for index, segment in enumerate(segments)
    ]
    summary = summarize_transcript(request_segments, os.getenv("AI_ANALYSIS_LANGUAGE", "en"))
    body = summary.model_dump()

    return {
        "summary": body["summary"],
        "keyDiscussions": [
            {
                "topic": item["topic"],
                "detail": item["detail"],
                "evidence": item["evidence"],
            }
            for item in body["key_discussions"]
        ],
        "decisions": [
            {
                "decision": item["decision"],
                "rationale": item.get("rationale", ""),
                "evidence": item["evidence"],
            }
            for item in body["decisions"]
        ],
        "suggestions": [
            {
                "title": item["task"],
                "description": None,
                "assigneeId": _resolve_assignee(item.get("owner"), participants),
                "dueDate": _parse_due_date(item.get("due_date")),
                "priority": item["priority"],
                "evidence": item["evidence"],
            }
            for item in body["action_items"]
        ],
        "provider": "llm",
        "model": body["model"],
        "promptVersion": body["prompt_version"],
    }


def _write_result(kind: str, identifier: str, result: dict[str, Any]) -> dict[str, str]:
    key = f"ai-results/{kind}/{identifier}.json"
    write_json(RESULT_BUCKET, key, result)
    return {"bucket": RESULT_BUCKET, "key": key}


def _result_ref(kind: str, identifier: str) -> dict[str, str]:
    return {"bucket": RESULT_BUCKET, "key": f"ai-results/{kind}/{identifier}.json"}


def _publish_started(client: Any, message: Any) -> None:
    payload = _job_payload(message)
    event_type = "transcription.started" if message.event_type.startswith("transcription") else "analysis.started"
    publish(client, RESULT_STREAM, event_type, message.job_id, payload, str(uuid.uuid4()))


def _process(client: Any, stream: str, group: str, message: Any) -> None:
    if message.event_type == "transcription.requested":
        result_ref = _result_ref("transcriptions", message.payload["transcriptId"])
        if object_exists(result_ref["bucket"], result_ref["key"]):
            publish(
                client,
                RESULT_STREAM,
                "transcription.completed",
                message.job_id,
                {**_job_payload(message), "resultRef": result_ref},
                str(uuid.uuid4()),
            )
            return

    if message.event_type == "analysis.requested":
        result_ref = _result_ref("analysis", message.payload["analysisRunId"])
        if object_exists(result_ref["bucket"], result_ref["key"]):
            publish(
                client,
                RESULT_STREAM,
                "analysis.completed",
                message.job_id,
                {**_job_payload(message), "resultRef": result_ref},
                str(uuid.uuid4()),
            )
            return

    _publish_started(client, message)

    if message.event_type == "transcription.requested":
        result = _transcribe(message.payload)
        result_ref = _write_result("transcriptions", message.payload["transcriptId"], result)
        payload = {**_job_payload(message), "resultRef": result_ref}
        publish(client, RESULT_STREAM, "transcription.completed", message.job_id, payload, str(uuid.uuid4()))
        return

    if message.event_type == "analysis.requested":
        result = _analyse(message.payload)
        result_ref = _write_result("analysis", message.payload["analysisRunId"], result)
        payload = {**_job_payload(message), "resultRef": result_ref}
        publish(client, RESULT_STREAM, "analysis.completed", message.job_id, payload, str(uuid.uuid4()))
        return

    raise ValueError(f"Unsupported AI job event type: {message.event_type}")


def _process_with_retry(client: Any, stream: str, group: str, message: Any) -> None:
    attempt = int(message.payload.get("attempt", 1))
    lock = acquire_job_lock(client, message)
    if not lock:
        acknowledge(client, stream, group, message.message_id)
        return

    started_at = time.monotonic()
    try:
        _process(client, stream, group, message)
        logger.info(
            "AI job completed eventType=%s jobId=%s attempt=%s elapsedMs=%s",
            message.event_type,
            message.job_id,
            attempt,
            round((time.monotonic() - started_at) * 1000),
        )
    except Exception as error:
        permanent = isinstance(error, ValueError) or (
            isinstance(error, S3Error) and error.code in {"NoSuchKey", "NoSuchObject", "NoSuchBucket"}
        )

        if not permanent and attempt < RETRY_LIMIT:
            logger.warning(
                "AI job retrying eventType=%s jobId=%s attempt=%s elapsedMs=%s errorType=%s",
                message.event_type,
                message.job_id,
                attempt,
                round((time.monotonic() - started_at) * 1000),
                type(error).__name__,
            )
            schedule_retry(client, stream, message, attempt + 1)
            return

        failed_type = "transcription.failed" if message.event_type.startswith("transcription") else "analysis.failed"
        payload = {
            **_job_payload(message),
            "errorMessage": str(error),
            "retryable": False,
        }
        publish(client, RESULT_STREAM, failed_type, message.job_id, payload, str(uuid.uuid4()))
        logger.warning(
            "AI job failed eventType=%s jobId=%s attempt=%s elapsedMs=%s errorType=%s",
            message.event_type,
            message.job_id,
            attempt,
            round((time.monotonic() - started_at) * 1000),
            type(error).__name__,
        )
    finally:
        release_job_lock(client, lock)
        acknowledge(client, stream, group, message.message_id)


def run() -> None:
    logging.basicConfig(level=os.getenv("AI_WORKER_LOG_LEVEL", "INFO"))
    provider_config = {
        "AI_TRANSCRIPTION_PROVIDER": os.getenv("AI_TRANSCRIPTION_PROVIDER"),
        "AI_ANALYSIS_PROVIDER": os.getenv("AI_ANALYSIS_PROVIDER"),
    }
    missing = [name for name, value in provider_config.items() if not value]
    if missing:
        raise RuntimeError(f"AI worker missing provider configuration: {', '.join(missing)}")

    if os.getenv("NODE_ENV") == "production":
        fixture_providers = [
            name
            for name, value in provider_config.items()
            if value == "fixture"
        ]
        if fixture_providers and os.getenv("ALLOW_UNSAFE_FIXTURE_PROVIDERS") != "true":
            raise RuntimeError(
                "Fixture providers require ALLOW_UNSAFE_FIXTURE_PROVIDERS=true: "
                + ", ".join(fixture_providers)
            )

    client = connection()
    consumer = os.getenv("AI_WORKER_CONSUMER_NAME", f"ai-worker-{os.getpid()}-{uuid.uuid4()}")
    ensure_group(client, TRANSCRIPTION_STREAM, TRANSCRIPTION_GROUP)
    ensure_group(client, ANALYSIS_STREAM, ANALYSIS_GROUP)

    while not STOP:
        release_retries(client, TRANSCRIPTION_STREAM)
        release_retries(client, ANALYSIS_STREAM)

        for stream, group in (
            (TRANSCRIPTION_STREAM, TRANSCRIPTION_GROUP),
            (ANALYSIS_STREAM, ANALYSIS_GROUP),
        ):
            for message in claim_pending(client, stream, group, consumer):
                _process_with_retry(client, stream, group, message)

            for message in read_one(client, stream, group, consumer):
                _process_with_retry(client, stream, group, message)

    client.close()


if __name__ == "__main__":
    signal.signal(signal.SIGINT, _stop)
    signal.signal(signal.SIGTERM, _stop)
    run()
