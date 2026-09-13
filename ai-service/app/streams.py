import json
import os
import time
from dataclasses import dataclass
from typing import Any

import redis


TRANSCRIPTION_STREAM = os.getenv("AI_TRANSCRIPTION_STREAM", "ai.transcription.jobs")
ANALYSIS_STREAM = os.getenv("AI_ANALYSIS_STREAM", "ai.analysis.jobs")
RESULT_STREAM = os.getenv("AI_RESULT_STREAM", "ai.results")
RESULT_GROUP = os.getenv("AI_RESULT_CONSUMER_GROUP", "server-result-consumers")
TRANSCRIPTION_GROUP = os.getenv("AI_TRANSCRIPTION_CONSUMER_GROUP", "whisper-workers")
ANALYSIS_GROUP = os.getenv("AI_ANALYSIS_CONSUMER_GROUP", "analysis-workers")
MAXLEN = int(os.getenv("AI_STREAM_MAXLEN", "10000"))
BLOCK_MS = int(os.getenv("AI_STREAM_READ_BLOCK_MS", "1000"))
CLAIM_IDLE_MS = int(os.getenv("AI_STREAM_CLAIM_IDLE_MS", "60000"))
RETRY_LIMIT = int(os.getenv("AI_JOB_MAX_ATTEMPTS", "3"))
RETRY_BASE_SECONDS = int(os.getenv("AI_JOB_RETRY_DELAY_SECONDS", "5"))
JOB_LOCK_TTL_SECONDS = int(os.getenv("AI_JOB_LOCK_TTL_SECONDS", "3600"))


@dataclass(frozen=True)
class JobMessage:
    message_id: str
    event_id: str
    event_type: str
    job_id: str
    payload: dict[str, Any]


def connection() -> redis.Redis:
    return redis.Redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379"), decode_responses=True)


def ensure_group(client: redis.Redis, stream: str, group: str) -> None:
    try:
        client.xgroup_create(stream, group, id="0-0", mkstream=True)
    except redis.ResponseError as error:
        if "BUSYGROUP" not in str(error):
            raise


def _parse_message(message: tuple[str, dict[str, str]]) -> JobMessage:
    message_id, fields = message
    return JobMessage(
        message_id=message_id,
        event_id=fields["eventId"],
        event_type=fields["eventType"],
        job_id=fields["jobId"],
        payload=json.loads(fields.get("payload", "{}")),
    )


def read_one(
    client: redis.Redis,
    stream: str,
    group: str,
    consumer: str,
) -> list[JobMessage]:
    result = client.xreadgroup(
        group,
        consumer,
        {stream: ">"},
        count=1,
        block=BLOCK_MS,
    )
    return [_parse_message(message) for _, messages in result for message in messages]


def claim_pending(
    client: redis.Redis,
    stream: str,
    group: str,
    consumer: str,
) -> list[JobMessage]:
    _, messages, _ = client.xautoclaim(
        stream,
        group,
        consumer,
        min_idle_time=CLAIM_IDLE_MS,
        start_id="0-0",
        count=10,
    )
    return [_parse_message(message) for message in messages]


def publish(
    client: redis.Redis,
    stream: str,
    event_type: str,
    job_id: str,
    payload: dict[str, Any],
    event_id: str,
) -> str:
    return client.xadd(
        stream,
        {
            "eventId": event_id,
            "eventType": event_type,
            "jobId": job_id,
            "payload": json.dumps(payload, ensure_ascii=False),
        },
        maxlen=MAXLEN,
        approximate=True,
    )


def acknowledge(client: redis.Redis, stream: str, group: str, message_id: str) -> None:
    client.xack(stream, group, message_id)


def acquire_job_lock(client: redis.Redis, message: JobMessage) -> tuple[str, str] | None:
    key = f"ai:job-lock:{message.job_id}"
    token = f"{message.event_id}:{message.message_id}"
    if client.set(key, token, nx=True, ex=JOB_LOCK_TTL_SECONDS):
        return key, token
    return None


def release_job_lock(client: redis.Redis, lock: tuple[str, str] | None) -> None:
    if not lock:
        return

    key, token = lock
    client.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        1,
        key,
        token,
    )


def _retry_key(stream: str) -> str:
    return f"{stream}:retry"


def schedule_retry(client: redis.Redis, stream: str, message: JobMessage, attempt: int) -> None:
    delay = RETRY_BASE_SECONDS * (2 ** max(attempt - 1, 0))
    envelope = json.dumps(
        {
            "eventId": message.event_id,
            "eventType": message.event_type,
            "jobId": message.job_id,
            "payload": {**message.payload, "attempt": attempt},
        },
        ensure_ascii=False,
        sort_keys=True,
    )
    client.zadd(_retry_key(stream), {envelope: time.time() + delay})


def release_retries(client: redis.Redis, stream: str) -> int:
    key = _retry_key(stream)
    due = client.zrangebyscore(key, 0, time.time(), start=0, num=20)
    for raw in due:
        envelope = json.loads(raw)
        publish(
            client,
            stream,
            envelope["eventType"],
            envelope["jobId"],
            envelope["payload"],
            envelope["eventId"],
        )
        client.zrem(key, raw)

    return len(due)
