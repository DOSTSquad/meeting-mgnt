import os
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Query, UploadFile, status
from starlette.concurrency import run_in_threadpool

from app.schemas import TranscriptionResponse
from app.transcription import transcribe_audio

app = FastAPI(
    title="Meeting AI Service",
    description="Internal speech-to-text and meeting summarisation service.",
    version="0.1.0",
)

ALLOWED_AUDIO_SUFFIXES = {".mp3", ".wav", ".m4a", ".mp4", ".mpeg", ".mpga", ".webm"}
MAX_AUDIO_BYTES = 500 * 1024 * 1024


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post(
    "/v1/transcribe",
    response_model=TranscriptionResponse,
    status_code=status.HTTP_200_OK,
)
async def transcribe(
    file: UploadFile = File(...),
    language: str | None = Query(default="th", min_length=2, max_length=10),
) -> TranscriptionResponse:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_AUDIO_SUFFIXES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Unsupported audio type. Upload MP3, WAV, M4A, MP4, MPEG, MPGA, or WEBM.",
        )

    temp_path: str | None = None
    total_bytes = 0

    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp_file:
            temp_path = temp_file.name

            while chunk := await file.read(1024 * 1024):
                total_bytes += len(chunk)
                if total_bytes > MAX_AUDIO_BYTES:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail="Audio file exceeds the 500 MB limit.",
                    )
                temp_file.write(chunk)

        if total_bytes == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Audio file is empty.",
            )

        result = await run_in_threadpool(transcribe_audio, temp_path, language)
        return TranscriptionResponse.model_validate(result)
    finally:
        await file.close()
        if temp_path:
            try:
                os.remove(temp_path)
            except FileNotFoundError:
                pass
