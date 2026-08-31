import os
import threading
from functools import lru_cache

import torch
import whisper

from app.languages import normalize_language


class UnusableAudioError(ValueError):
    """The upload cannot be decoded into audio. Retrying will not help."""



def get_device() -> str:
    configured_device = os.getenv("WHISPER_DEVICE")
    if configured_device:
        return configured_device

    return "cuda" if torch.cuda.is_available() else "cpu"


@lru_cache(maxsize=1)
def get_model():
    model_name = os.getenv("WHISPER_MODEL", "small")
    return whisper.load_model(model_name, device=get_device())


# One Whisper model is shared by every request, and decoding installs a kv_cache
# on the model's own modules. Two transcriptions running in different threadpool
# threads therefore corrupt each other, surfacing as
# "cannot reshape tensor of 0 elements". Serialise decoding: CPU inference already
# saturates the cores, so overlapping requests bought nothing anyway.
_decode_lock = threading.Lock()


def transcribe_audio(file_path: str, language: str | None = "en") -> dict:
    model_name = os.getenv("WHISPER_MODEL", "small")
    device = get_device()
    whisper_language = normalize_language(language)
    model = get_model()

    # Decode here rather than letting transcribe() do it, so a file ffmpeg cannot
    # read is reported as a permanent client error instead of reaching the model
    # and failing deep inside attention with an unrecognisable tensor error.
    try:
        audio = whisper.load_audio(file_path)
    except RuntimeError as error:
        raise UnusableAudioError("Audio could not be decoded.") from error

    if audio.size == 0:
        raise UnusableAudioError("Audio contains no decodable sound.")

    with _decode_lock:
        result = model.transcribe(
            audio,
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
