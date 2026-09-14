# GPU Benchmark Runbook

This runbook measures the optional GPU AI profile on a Windows x86_64 desktop
with an RTX 4070 Super (12 GiB VRAM). It is a benchmark procedure, not a
production deployment guide. The existing CPU result for a 26-minute recording
is the comparison baseline: approximately 12 minutes for Whisper and 6 minutes
for Llama 3 analysis. The profile uses CUDA 12.6-compatible PyTorch 2.7.1.

Run every command from an Ubuntu WSL2 terminal in a Linux filesystem clone of
this repository. The audio file may be read from `/mnt/c/...`, but keeping the
repository and Docker volumes in the WSL filesystem avoids slow bind mounts.

## Prerequisites

1. Install a current NVIDIA Windows driver that supports CUDA in WSL2.
2. Install Docker Desktop with the WSL2 backend and enable integration for the
   Ubuntu distribution.
3. Confirm Docker Desktop is configured to expose the NVIDIA GPU to containers.
4. Copy `.env.example` to `.env` and set these values:

```env
AI_PIPELINE_ENABLED=true
AI_TRANSCRIPTION_PROVIDER=whisper
AI_ANALYSIS_PROVIDER=llm
AI_COMPUTE_PROFILE=gpu
WHISPER_DEVICE=cuda
```

5. Use the existing non-placeholder database, Redis, MinIO, JWT, and email
   settings required for a local workflow run.

## Start The GPU Profile

Verify that WSL can see the GPU before starting the stack:

```sh
nvidia-smi
```

Start the base dependencies, then apply the GPU Compose overlay:

```sh
docker compose up -d postgres redis minio minio-init
docker compose -f docker-compose.yml -f docker-compose.gpu.yml --profile ai up -d --build ai-service ai-worker ollama
docker compose -f docker-compose.yml -f docker-compose.gpu.yml exec ollama ollama pull llama3
```

Confirm the GPU image has CUDA access. This check must print `True` and identify
the NVIDIA GPU:

```sh
docker compose -f docker-compose.yml -f docker-compose.gpu.yml run --rm ai-worker \
  python -c "import torch; assert torch.cuda.is_available(); print(torch.cuda.get_device_name(0))"
```

Check that the worker started with `profile=gpu device=cuda`:

```sh
docker compose -f docker-compose.yml -f docker-compose.gpu.yml logs ai-worker
```

Warm and verify Ollama separately. After the command completes, `ollama ps`
must report that the loaded model uses the GPU rather than CPU:

```sh
docker compose -f docker-compose.yml -f docker-compose.gpu.yml exec ollama ollama run llama3 "Reply with OK only."
docker compose -f docker-compose.yml -f docker-compose.gpu.yml exec ollama ollama ps
```

Stop here if either Whisper or Ollama falls back to CPU. Do not record a GPU
benchmark from a fallback run.

## Run The Workflow Benchmark

In a second WSL terminal, monitor GPU use during the entire run:

```sh
nvidia-smi -l 1
```

From the repository root, run the existing end-to-end smoke script against the
26-minute source file. It uploads the file, drives Redis Streams, waits for
Whisper and Ollama, asserts `ready_for_review`, removes its temporary database
records, and writes a local result artifact.

```sh
SMOKE_TIMEOUT_MS=1800000 npm run check:whisper --workspace=server -- \
  /mnt/c/Users/<Windows-user>/Desktop/<recording>.m4a
```

Do not commit the generated `artefacts/*-ai-workflow-result.json`: it can include
local paths and transcript-derived data.

## Record Results

Record these values in the benchmark report:

| Measurement                                            | Source                                                          |
| ------------------------------------------------------ | --------------------------------------------------------------- |
| GPU model, driver, WSL version, Docker Desktop version | `nvidia-smi`, `wsl --version`, Docker Desktop                   |
| CUDA visibility and PyTorch device                     | CUDA validation command and `ai-worker` logs                    |
| Ollama GPU status                                      | `ollama ps` after warm-up                                       |
| Whisper elapsed time                                   | `AI job completed eventType=transcription.requested` worker log |
| Analysis elapsed time                                  | `AI job completed eventType=analysis.requested` worker log      |
| End-to-end elapsed time                                | smoke script result artifact/output                             |
| Peak VRAM and utilization                              | `nvidia-smi -l 1` observation                                   |
| Workflow result                                        | smoke script `PASS` and `ready_for_review`                      |

The 4070 Super has 12 GiB VRAM. Use one AI worker for the first benchmark. If
Llama 3 at 8K context causes out-of-memory failures, retain the logs and lower
the context only in a separate controlled experiment; do not silently change
the CPU baseline configuration.

## Cleanup

Stop only the benchmark AI services when finished:

```sh
docker compose -f docker-compose.yml -f docker-compose.gpu.yml --profile ai stop ai-service ai-worker ollama
```

Keep persistent model/cache volumes only when repeat benchmarks are planned.
