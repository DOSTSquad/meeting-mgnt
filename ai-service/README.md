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

The default Compose configuration is CPU-only and is the currently validated
deployment path. The optional GPU benchmark profile uses the same worker code
with a CUDA 12.6 / PyTorch 2.7.1 image:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml --profile ai up -d --build
```

It requires Docker GPU support and fails the worker at startup unless PyTorch
can access CUDA. See the [GPU Benchmark Runbook](../docs/gpu-benchmark-runbook.md)
before using it; it is not a production performance claim.

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
