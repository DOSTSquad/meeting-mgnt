import json
import os
import unittest
from unittest.mock import Mock, patch

from app.summarization import build_prompt, summarize_transcript


class SummarizationTest(unittest.TestCase):
    def test_prompt_uses_requested_output_language(self):
        prompt = build_prompt("Meeting transcript", "tl")

        self.assertIn("Filipino (Tagalog)", prompt)
        self.assertIn("Meeting transcript", prompt)

    @patch("app.summarization.httpx.post")
    def test_returns_structured_llama_summary(self, post):
        ollama_response = Mock()
        ollama_response.raise_for_status.return_value = None
        ollama_response.json.return_value = {
            "message": {
                "content": json.dumps(
                    {
                        "summary": "The team reviewed feeder voltage.",
                        "key_points": ["Voltage falls during peak demand."],
                        "decisions": ["Test a switched capacitor."],
                        "action_items": [
                            {
                                "task": "Run the load-flow model.",
                                "owner": "Priya",
                                "due_date": None,
                            }
                        ],
                    }
                )
            }
        }
        post.return_value = ollama_response

        with patch.dict(os.environ, {"OLLAMA_MODEL": "llama3"}, clear=False):
            result = summarize_transcript("Transcript", "english")

        self.assertEqual(result.language, "en")
        self.assertEqual(result.model, "llama3")
        self.assertEqual(result.action_items[0].owner, "Priya")
        request_body = post.call_args.kwargs["json"]
        self.assertFalse(request_body["stream"])
        self.assertEqual(request_body["options"]["temperature"], 0)
        self.assertEqual(request_body["format"]["type"], "object")


if __name__ == "__main__":
    unittest.main()
