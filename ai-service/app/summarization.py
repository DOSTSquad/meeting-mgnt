import json
import math
import os

import httpx
from pydantic import BaseModel

from app.languages import LANGUAGE_NAMES, normalize_language

PROMPT_VERSION = "2026-09-16"
from app.schemas import ChunkFindings, LlamaSummary, SummarizationResponse, SummarizationSegment

PROMPT_TOKEN_RESERVE = 2000
MIN_INPUT_TOKEN_BUDGET = 512
CHUNK_OVERLAP_SEGMENTS = 3


class SummarizationProviderError(RuntimeError):
    pass


def _numbered_segments(segments: list[SummarizationSegment]) -> str:
    return "\n".join(f"[{segment.index}] {segment.text.strip()}" for segment in segments)


def build_prompt(segments: list[SummarizationSegment], language: str) -> str:
    output_language = LANGUAGE_NAMES[language]
    schema = json.dumps(LlamaSummary.model_json_schema(), ensure_ascii=False)
    numbered = _numbered_segments(segments)
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


def build_extraction_prompt(segments: list[SummarizationSegment], language: str) -> str:
    output_language = LANGUAGE_NAMES[language]
    schema = json.dumps(ChunkFindings.model_json_schema(), ensure_ascii=False)
    numbered = _numbered_segments(segments)
    first = segments[0].index
    last = segments[-1].index

    return f"""Extract evidence-backed meeting facts from this transcript excerpt.

The excerpt keeps its original segment numbers. Every discussion, decision, and action
item must cite supporting segments in its "evidence" array. Valid numbers are {first} to
{last}; never invent a number or a fact. Do not write a general meeting summary.

Write every output field in {output_language}. Keep technical terms, measurements, and
names as close to the transcript as possible. If an owner or due date is not stated, use
null. Return JSON matching this schema exactly:
{schema}

Transcript excerpt:
{numbered}
"""


def build_reduction_prompt(
    findings: list[ChunkFindings], language: str, final: bool
) -> str:
    output_language = LANGUAGE_NAMES[language]
    output_type = LlamaSummary if final else ChunkFindings
    schema = json.dumps(output_type.model_json_schema(), ensure_ascii=False)
    candidates = json.dumps([finding.model_dump() for finding in findings], ensure_ascii=False)
    instruction = (
        "Create the final meeting minutes. Write a concise summary and retain the most "
        "important distinct discussions, decisions, and action items."
        if final
        else "Merge these candidates into a smaller set of distinct evidence-backed findings."
    )

    return f"""{instruction}

Candidate findings were extracted from transcript chunks. Merge duplicate candidates only
when they describe the same fact, but retain details that occurred in different chunks.
Evidence numbers are original transcript segment indexes: use only those numbers, preserve
the strongest supporting references, and never invent a fact, owner, date, or decision.
Write every output field in {output_language}. Return JSON matching this schema exactly:
{schema}

Candidate findings:
{candidates}
"""


def estimate_tokens(text: str) -> int:
    """Conservatively estimate tokens without adding a model-specific tokenizer dependency."""
    ascii_characters = sum(character.isascii() for character in text)
    non_ascii_characters = len(text) - ascii_characters
    return max(1, math.ceil(ascii_characters / 4) + non_ascii_characters)


def input_token_budget() -> int:
    context_tokens = int(os.getenv("OLLAMA_NUM_CTX", "8192"))
    max_tokens = int(os.getenv("OLLAMA_NUM_PREDICT", "2048"))
    return max(MIN_INPUT_TOKEN_BUDGET, context_tokens - max_tokens - PROMPT_TOKEN_RESERVE)


def chunk_segments(
    segments: list[SummarizationSegment],
    token_budget: int,
    overlap_segments: int = CHUNK_OVERLAP_SEGMENTS,
) -> list[list[SummarizationSegment]]:
    if not segments:
        return []

    chunks = []
    current = []
    current_tokens = 0

    for segment in segments:
        segment_tokens = estimate_tokens(segment.text)

        if current and current_tokens + segment_tokens > token_budget:
            chunks.append(current)
            overlap = current[-overlap_segments:] if overlap_segments else []

            if sum(estimate_tokens(item.text) for item in overlap) + segment_tokens > token_budget:
                overlap = []

            current = overlap
            current_tokens = sum(estimate_tokens(item.text) for item in current)

        current.append(segment)
        current_tokens += segment_tokens

    chunks.append(current)
    return chunks


def _findings_token_count(findings: list[ChunkFindings]) -> int:
    return estimate_tokens(json.dumps([finding.model_dump() for finding in findings]))


def _batch_findings(
    findings: list[ChunkFindings], token_budget: int
) -> list[list[ChunkFindings]]:
    batches = []
    current = []

    for finding in findings:
        if current and _findings_token_count([*current, finding]) > token_budget:
            batches.append(current)
            current = []

        current.append(finding)

    if current:
        batches.append(current)

    return batches


def _request_structured(
    prompt: str,
    output_type: type[BaseModel],
    model: str,
    base_url: str,
    timeout_seconds: float,
    context_tokens: int,
    max_tokens: int,
) -> BaseModel:
    try:
        response = httpx.post(
            f"{base_url}/api/chat",
            json={
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "stream": False,
                "format": output_type.model_json_schema(),
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
        return output_type.model_validate_json(content)
    except (httpx.HTTPError, KeyError, TypeError, ValueError) as error:
        raise SummarizationProviderError(f"Llama 3 summarization failed: {error}") from error


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
    chunks = chunk_segments(segments, input_token_budget())

    if len(chunks) == 1:
        summary = _request_structured(
            build_prompt(segments, normalized_language),
            LlamaSummary,
            model,
            base_url,
            timeout_seconds,
            context_tokens,
            max_tokens,
        )
    else:
        findings = [
            _request_structured(
                build_extraction_prompt(chunk, normalized_language),
                ChunkFindings,
                model,
                base_url,
                timeout_seconds,
                context_tokens,
                max_tokens,
            )
            for chunk in chunks
        ]

        while _findings_token_count(findings) > input_token_budget():
            batches = _batch_findings(findings, input_token_budget())

            if len(batches) == len(findings):
                break

            findings = [
                _request_structured(
                    build_reduction_prompt(batch, normalized_language, final=False),
                    ChunkFindings,
                    model,
                    base_url,
                    timeout_seconds,
                    context_tokens,
                    max_tokens,
                )
                for batch in batches
            ]

        summary = _request_structured(
            build_reduction_prompt(findings, normalized_language, final=True),
            LlamaSummary,
            model,
            base_url,
            timeout_seconds,
            context_tokens,
            max_tokens,
        )

    return SummarizationResponse(
        **drop_unusable_evidence(summary, {segment.index for segment in segments}).model_dump(),
        language=normalized_language,
        model=model,
        prompt_version=PROMPT_VERSION,
    )
