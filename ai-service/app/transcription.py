import os
from functools import lru_cache

import torch
import whisper

SUPPORTED_LANGUAGE_ALIASES = {
    "en": "en",
    "english": "en",
    "fil": "tl",
    "filipino": "tl",
    "tagalog": "tl",
    "tl": "tl",
}


def normalize_language(language: str | None = "en") -> str:
    normalized = (language or "en").strip().lower()

    try:
        return SUPPORTED_LANGUAGE_ALIASES[normalized]
    except KeyError as error:
        raise ValueError("language must be English (en) or Filipino/Tagalog (tl)") from error


def get_device() -> str:
    configured_device = os.getenv("WHISPER_DEVICE")
    if configured_device:
        return configured_device

    return "cuda" if torch.cuda.is_available() else "cpu"


@lru_cache(maxsize=1)
def get_model():
    model_name = os.getenv("WHISPER_MODEL", "small")
    return whisper.load_model(model_name, device=get_device())


def transcribe_audio(file_path: str, language: str | None = "en") -> dict:
    model_name = os.getenv("WHISPER_MODEL", "small")
    device = get_device()
    whisper_language = normalize_language(language)
    result = get_model().transcribe(
        file_path,
        language=whisper_language,
        task="transcribe",
        fp16=device == "cuda",
    )

    segments = [
        {
            "id": segment["id"],
            "start": segment["start"],
            "end": segment["end"],
            "text": segment["text"].strip(),
        }
        for segment in result.get("segments", [])
    ]
    duration_seconds = max((segment["end"] for segment in segments), default=None)

    return {
        "text": result.get("text", "").strip(),
        "language": result.get("language"),
        "duration_seconds": duration_seconds,
        "segments": segments,
        "model": model_name,
    }
