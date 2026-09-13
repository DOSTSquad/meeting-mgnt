import unittest


try:
    from app.worker import _fixture_analysis, _fixture_transcription, _parse_due_date, _resolve_assignee
except ModuleNotFoundError as error:  # pragma: no cover - host tests may omit AI dependencies
    _IMPORT_ERROR = error
else:
    _IMPORT_ERROR = None


@unittest.skipIf(_IMPORT_ERROR is not None, f"AI worker dependencies unavailable: {_IMPORT_ERROR}")
class WorkerHelperTests(unittest.TestCase):
    def test_fixture_transcription_is_stable(self):
        result = _fixture_transcription(None)

        self.assertEqual(result["provider"], "fixture")
        self.assertEqual(len(result["segments"]), 3)
        self.assertEqual(result["durationSeconds"], 60)

    def test_fixture_analysis_clamps_evidence_to_transcript(self):
        result = _fixture_analysis(1)

        self.assertEqual(result["keyDiscussions"][1]["evidence"], [0])
        self.assertEqual(result["decisions"][0]["evidence"], [0])

    def test_resolves_only_an_unambiguous_participant_name(self):
        participants = [{"id": "user-1", "name": "Alex Chen"}]

        self.assertEqual(_resolve_assignee("alex chen", participants), "user-1")
        self.assertIsNone(_resolve_assignee("unknown", participants))

    def test_accepts_only_iso_due_dates(self):
        self.assertEqual(_parse_due_date("2026-09-13"), "2026-09-13")
        self.assertIsNone(_parse_due_date("next Friday"))
