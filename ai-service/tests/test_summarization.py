import json
import os
import unittest
from unittest.mock import Mock, patch

from pydantic import ValidationError

from app.schemas import LlamaSummary, SummarizationSegment
from app.summarization import PROMPT_VERSION, build_prompt, chunk_segments, summarize_transcript


def ollama_response(content):
    response = Mock()
    response.raise_for_status.return_value = None
    response.json.return_value = {"message": {"content": json.dumps(content)}}
    return response


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

    def test_chunks_preserve_global_indexes_and_overlap_three_segments(self):
        segments = [SummarizationSegment(index=index, text="aaaa") for index in range(6)]

        chunks = chunk_segments(segments, token_budget=4)

        self.assertEqual([[segment.index for segment in chunk] for chunk in chunks], [
            [0, 1, 2, 3],
            [1, 2, 3, 4],
            [2, 3, 4, 5],
        ])

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

    @patch("app.summarization.httpx.post")
    def test_long_transcript_extracts_late_sprint_discussion_before_reduction(self, post):
        first_chunk = {
            "key_discussions": [
                {"topic": "Earlier discussion", "detail": "Earlier detail.", "evidence": [1]}
            ],
            "decisions": [],
            "action_items": [],
        }
        sprint_chunk = {
            "key_discussions": [
                {
                    "topic": "NASA sprint",
                    "detail": "The team discussed the NASA sprint.",
                    "evidence": [19],
                }
            ],
            "decisions": [],
            "action_items": [],
        }
        final_summary = {
            "summary": "The team discussed the NASA sprint.",
            "key_discussions": [
                {
                    "topic": "NASA sprint",
                    "detail": "The team discussed the NASA sprint.",
                    "evidence": [19, 19, 99],
                }
            ],
            "decisions": [],
            "action_items": [],
        }
        post.side_effect = [
            ollama_response(first_chunk),
            ollama_response(sprint_chunk),
            ollama_response(final_summary),
        ]
        segments = [
            SummarizationSegment(index=index, text="a" * 1000)
            for index in range(19)
        ] + [SummarizationSegment(index=19, text=("a" * 980) + " NASA sprint")]

        with patch.dict(
            os.environ,
            {"OLLAMA_NUM_CTX": "8192", "OLLAMA_NUM_PREDICT": "2048"},
            clear=False,
        ):
            result = summarize_transcript(segments, "en")

        prompts = [call.kwargs["json"]["messages"][0]["content"] for call in post.call_args_list]
        self.assertEqual(post.call_count, 3)
        self.assertIn("NASA sprint", prompts[1])
        self.assertIn("NASA sprint", prompts[2])
        self.assertEqual(result.summary, "The team discussed the NASA sprint.")
        self.assertEqual(result.key_discussions[0].evidence, [19])

    @patch("app.summarization.httpx.post")
    def test_reduces_chunk_findings_in_batches_when_they_exceed_the_context_budget(self, post):
        findings = {
            "key_discussions": [
                {
                    "topic": f"Topic {index}",
                    "detail": "x" * 400,
                    "evidence": [index],
                }
                for index in range(6)
            ],
            "decisions": [],
            "action_items": [],
        }
        final_summary = {
            "summary": "Condensed meeting summary.",
            "key_discussions": [
                {"topic": "Topic 0", "detail": "x", "evidence": [0]}
            ],
            "decisions": [],
            "action_items": [],
        }

        def respond(*_args, **kwargs):
            schema = kwargs["json"]["format"]
            content = final_summary if "summary" in schema["properties"] else findings
            return ollama_response(content)

        post.side_effect = respond
        segments = [
            SummarizationSegment(index=index, text="a" * 12000)
            for index in range(10)
        ]

        with patch.dict(
            os.environ,
            {"OLLAMA_NUM_CTX": "6000", "OLLAMA_NUM_PREDICT": "2048"},
            clear=False,
        ):
            summarize_transcript(segments, "en")

        prompts = [call.kwargs["json"]["messages"][0]["content"] for call in post.call_args_list]
        self.assertGreater(post.call_count, len(segments) + 1)
        self.assertGreater(sum("smaller set of distinct" in prompt for prompt in prompts), 0)

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
