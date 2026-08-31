# Language handling lives here rather than in transcription.py so that resolving a
# language code does not pull in torch and whisper. Both the transcription and
# summarization paths, and their tests, import from this module.

SUPPORTED_LANGUAGE_ALIASES = {
    "en": "en",
    "english": "en",
    "fil": "tl",
    "filipino": "tl",
    "tagalog": "tl",
    "tl": "tl",
}

LANGUAGE_NAMES = {
    "en": "English",
    "tl": "Filipino (Tagalog)",
}


def normalize_language(language: str | None = "en") -> str:
    normalized = (language or "en").strip().lower()

    try:
        return SUPPORTED_LANGUAGE_ALIASES[normalized]
    except KeyError as error:
        raise ValueError("language must be English (en) or Filipino/Tagalog (tl)") from error
