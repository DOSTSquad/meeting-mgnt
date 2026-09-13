# Meeting AI service

FastAPI health/API wrapper plus a Redis Streams worker for Whisper transcription and
Llama 3 summarization. The workflow worker reads `ai.transcription.jobs` and
`ai.analysis.jobs`, writes result artifacts to MinIO, and publishes `ai.results`.
The direct endpoints remain useful for service checks. `GET /health` answers before
the Whisper model is loaded, so a passing health check does not mean the first
transcription will be fast.

Run it with Compose from the repository root:

```bash
docker compose --profile ai up -d --build ai-service ai-worker ollama
docker compose exec ollama ollama pull llama3
```

## Tests

The unit tests need neither torch nor a running model, so they run on the host:

```bash
cd ai-service
python -m unittest discover -s tests -t .
```

They are not copied into the image (the Dockerfile takes `app/` only), so
`docker compose exec ai-worker python -m unittest` will not find them.

`test-fixtures/` holds short real meeting recordings with the transcription and
summary output they produced, for manual comparison when changing models or
prompts. Nothing asserts against them automatically.
