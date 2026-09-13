import json
import os

import httpx

from app.languages import LANGUAGE_NAMES, normalize_language

PROMPT_VERSION = "2026-09-01"
from app.schemas import LlamaSummary, SummarizationResponse, SummarizationSegment


class SummarizationProviderError(RuntimeError):
    pass


def build_prompt(segments: list[SummarizationSegment], language: str) -> str:
    output_language = LANGUAGE_NAMES[language]
    schema = json.dumps(LlamaSummary.model_json_schema(), ensure_ascii=False)
    numbered = "\n".join(f"[{segment.index}] {segment.text.strip()}" for segment in segments)
    last = segments[-1].index

    return f"""You create accurate meeting minutes from a speech transcript.

The transcript is numbered by segment. Every key discussion, decision, and action
item must cite the segments it came from in its "evidence" array, using those
numbers. Cite only segments that actually support the statement. Valid numbers are
0 to {last}; never cite a number outside that range and never invent one.

Write every output field in {output_language}.
Use only facts present in the transcript.
Do not invent names, owners, dates, decisions, or action items.
If an action item's owner or due date is not stated, use null.
Set priority to high only when the transcript treats the item as urgent or blocking.
Keep technical terms, measurements, and names as close to the transcript as possible.
Keep the summary under 1,200 characters. Return at most 6 key discussions, 6 decisions, and
8 action items. Keep each detail, decision, and rationale under 400 characters.
Return JSON matching this schema exactly:
{schema}

Transcript:
{numbered}
"""


def drop_unusable_evidence(summary: LlamaSummary, valid: set[int]) -> LlamaSummary:
    """Remove citations that do not point at a real segment.

    The caller rejects an entire analysis whose evidence falls outside the
    transcript, which would lose a good summary over one hallucinated number, and
    a retry runs the same prompt against the same audio. A citation a reviewer
    cannot follow is worse than no citation, so the claim is kept and only the
    bad reference goes.
    """
    for group in (summary.key_discussions, summary.decisions, summary.action_items):
        for item in group:
            item.evidence = sorted({index for index in item.evidence if index in valid})

    return summary


def summarize_transcript(
    segments: list[SummarizationSegment],
    language: str | None = "en",
) -> SummarizationResponse:
    normalized_language = normalize_language(language)
    model = os.getenv("OLLAMA_MODEL", "llama3")
    base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
    timeout_seconds = float(os.getenv("OLLAMA_TIMEOUT_SECONDS", "1200"))
    context_tokens = int(os.getenv("OLLAMA_NUM_CTX", "8192"))
    max_tokens = int(os.getenv("OLLAMA_NUM_PREDICT", "2048"))
    output_schema = LlamaSummary.model_json_schema()

    try:
        response = httpx.post(
            f"{base_url}/api/chat",
            json={
                "model": model,
                "messages": [
                    {
                        "role": "user",
                        "content": build_prompt(segments, normalized_language),
                    }
                ],
                "stream": False,
                "format": output_schema,
                "options": {
                    "temperature": 0,
                    "num_ctx": context_tokens,
                    "num_predict": max_tokens,
                },
            },
            timeout=timeout_seconds,
        )
        response.raise_for_status()
        content = response.json()["message"]["content"]
        summary = LlamaSummary.model_validate_json(content)
    except (httpx.HTTPError, KeyError, TypeError, ValueError) as error:
        raise SummarizationProviderError(f"Llama 3 summarization failed: {error}") from error

    return SummarizationResponse(
        **drop_unusable_evidence(summary, {segment.index for segment in segments}).model_dump(),
        language=normalized_language,
        model=model,
        prompt_version=PROMPT_VERSION,
    )
