import os
import unittest
from unittest.mock import patch


try:
    from app.transcription import validate_compute_profile
except ModuleNotFoundError as error:  # pragma: no cover - host tests may omit AI dependencies
    _IMPORT_ERROR = error
else:
    _IMPORT_ERROR = None


@unittest.skipIf(_IMPORT_ERROR is not None, f"AI worker dependencies unavailable: {_IMPORT_ERROR}")
class ComputeProfileTests(unittest.TestCase):
    def test_cpu_profile_requires_the_cpu_device(self):
        with patch.dict(
            os.environ,
            {"AI_COMPUTE_PROFILE": "cpu", "WHISPER_DEVICE": "cpu"},
            clear=False,
        ):
            self.assertEqual(validate_compute_profile(), ("cpu", "cpu"))

    def test_gpu_profile_rejects_a_cpu_device(self):
        with patch.dict(
            os.environ,
            {"AI_COMPUTE_PROFILE": "gpu", "WHISPER_DEVICE": "cpu"},
            clear=False,
        ):
            with self.assertRaisesRegex(RuntimeError, "WHISPER_DEVICE=cuda"):
                validate_compute_profile()

    @patch("app.transcription.torch.cuda.is_available", return_value=False)
    def test_gpu_profile_rejects_a_runtime_without_cuda(self, _is_available):
        with patch.dict(
            os.environ,
            {"AI_COMPUTE_PROFILE": "gpu", "WHISPER_DEVICE": "cuda"},
            clear=False,
        ):
            with self.assertRaisesRegex(RuntimeError, "CUDA-enabled"):
                validate_compute_profile()

    def test_rejects_unknown_compute_profile(self):
        with patch.dict(
            os.environ,
            {"AI_COMPUTE_PROFILE": "accelerator", "WHISPER_DEVICE": "cpu"},
            clear=False,
        ):
            with self.assertRaisesRegex(RuntimeError, "must be cpu or gpu"):
                validate_compute_profile()
