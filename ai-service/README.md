# Meeting AI service

FastAPI wrapper around Whisper transcription (`POST /v1/transcribe`) and Llama 3
summarization (`POST /v1/summarize`, via the `ollama` container). `GET /health`
answers before the Whisper model is loaded, so a passing health check does not
mean the first transcription will be fast.

Run it with Compose from the repository root:

```bash
docker compose --profile ai up -d --build ai-service ollama
docker compose exec ollama ollama pull llama3
```

## Tests

The unit tests need neither torch nor a running model, so they run on the host:

```bash
cd ai-service
python -m unittest discover -s tests -t .
```

They are not copied into the image (the Dockerfile takes `app/` only), so
`docker compose exec ai-service python -m unittest` will not find them.

`test-fixtures/` holds short real meeting recordings with the transcription and
summary output they produced, for manual comparison when changing models or
prompts. Nothing asserts against them automatically.
