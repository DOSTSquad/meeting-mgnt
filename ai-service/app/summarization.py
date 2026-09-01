import json
import os

import httpx

from app.languages import LANGUAGE_NAMES, normalize_language
from app.schemas import LlamaSummary, SummarizationResponse


class SummarizationProviderError(RuntimeError):
    pass


def build_prompt(transcript: str, language: str) -> str:
    output_language = LANGUAGE_NAMES[language]
    schema = json.dumps(LlamaSummary.model_json_schema(), ensure_ascii=False)

    return f"""You create accurate meeting minutes from a speech transcript.

Write every output field in {output_language}.
Use only facts present in the transcript.
Do not invent names, owners, dates, decisions, or action items.
If an action item's owner or due date is not stated, use null.
Keep technical terms, measurements, and names as close to the transcript as possible.
Return JSON matching this schema exactly:
{schema}

Transcript:
{transcript.strip()}
"""


def summarize_transcript(
    transcript: str,
    language: str | None = "en",
) -> SummarizationResponse:
    normalized_language = normalize_language(language)
    model = os.getenv("OLLAMA_MODEL", "llama3")
    base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
    timeout_seconds = float(os.getenv("OLLAMA_TIMEOUT_SECONDS", "300"))
    output_schema = LlamaSummary.model_json_schema()

    try:
        response = httpx.post(
            f"{base_url}/api/chat",
            json={
                "model": model,
                "messages": [
                    {
                        "role": "user",
                        "content": build_prompt(transcript, normalized_language),
                    }
                ],
                "stream": False,
                "format": output_schema,
                "options": {"temperature": 0},
            },
            timeout=timeout_seconds,
        )
        response.raise_for_status()
        content = response.json()["message"]["content"]
        summary = LlamaSummary.model_validate_json(content)
    except (httpx.HTTPError, KeyError, TypeError, ValueError) as error:
        raise SummarizationProviderError(f"Llama 3 summarization failed: {error}") from error

    return SummarizationResponse(
        **summary.model_dump(),
        language=normalized_language,
        model=model,
    )
