import json
import os
import unittest
from unittest.mock import Mock, patch

from pydantic import ValidationError

from app.schemas import LlamaSummary, SummarizationSegment
from app.summarization import PROMPT_VERSION, build_prompt, summarize_transcript


class SummarizationTest(unittest.TestCase):
    def test_prompt_uses_requested_output_language(self):
        prompt = build_prompt([SummarizationSegment(index=0, text="Meeting transcript")], "tl")

        self.assertIn("Filipino (Tagalog)", prompt)
        self.assertIn("Meeting transcript", prompt)

    def test_prompt_numbers_segments_and_bounds_the_citations(self):
        prompt = build_prompt(
            [
                SummarizationSegment(index=0, text="Voltage drops at peak."),
                SummarizationSegment(index=1, text="Ken will run the model."),
            ],
            "en",
        )

        self.assertIn("[0] Voltage drops at peak.", prompt)
        self.assertIn("[1] Ken will run the model.", prompt)
        self.assertIn("0 to 1", prompt)

    @patch("app.summarization.httpx.post")
    def test_returns_structured_llama_summary(self, post):
        ollama_response = Mock()
        ollama_response.raise_for_status.return_value = None
        ollama_response.json.return_value = {
            "message": {
                "content": json.dumps(
                    {
                        "summary": "The team reviewed feeder voltage.",
                        "key_discussions": [
                            {
                                "topic": "Feeder voltage",
                                "detail": "Voltage falls during peak demand.",
                                "evidence": [0],
                            }
                        ],
                        "decisions": [
                            {
                                "decision": "Test a switched capacitor.",
                                "rationale": "Cheapest option to trial.",
                                "evidence": [1],
                            }
                        ],
                        "action_items": [
                            {
                                "task": "Run the load-flow model.",
                                "owner": "Priya",
                                "due_date": None,
                                "priority": "high",
                                # Outside the transcript: the model invented it.
                                "evidence": [1, 7],
                            }
                        ],
                    }
                )
            }
        }
        post.return_value = ollama_response

        with patch.dict(os.environ, {"OLLAMA_MODEL": "llama3"}, clear=False):
            result = summarize_transcript(
                [
                    SummarizationSegment(index=0, text="Voltage falls at peak."),
                    SummarizationSegment(index=1, text="We will test a capacitor."),
                ],
                "english",
            )

        self.assertEqual(result.language, "en")
        self.assertEqual(result.model, "llama3")
        self.assertEqual(result.prompt_version, PROMPT_VERSION)
        self.assertEqual(result.action_items[0].owner, "Priya")
        self.assertEqual(result.action_items[0].priority, "high")
        self.assertEqual(result.key_discussions[0].evidence, [0])
        # 7 is not a segment in this transcript, so it is dropped rather than
        # handed on as a citation nobody can check.
        self.assertEqual(result.action_items[0].evidence, [1])
        request_body = post.call_args.kwargs["json"]
        self.assertFalse(request_body["stream"])
        self.assertEqual(request_body["options"]["temperature"], 0)
        self.assertEqual(request_body["options"]["num_ctx"], 8192)
        self.assertEqual(request_body["options"]["num_predict"], 2048)
        self.assertEqual(request_body["format"]["type"], "object")

    def test_rejects_unbounded_summary_output(self):
        with self.assertRaises(ValidationError):
            LlamaSummary.model_validate(
                {
                    "summary": "x" * 1201,
                    "key_discussions": [],
                    "decisions": [],
                    "action_items": [],
                }
            )


if __name__ == "__main__":
    unittest.main()
