import unittest

from app.languages import normalize_language


class NormalizeLanguageTest(unittest.TestCase):
    def test_normalizes_english_aliases(self):
        self.assertEqual(normalize_language("en"), "en")
        self.assertEqual(normalize_language("English"), "en")

    def test_normalizes_filipino_aliases_to_tagalog(self):
        for language in ("fil", "filipino", "tagalog", "tl"):
            with self.subTest(language=language):
                self.assertEqual(normalize_language(language), "tl")

    def test_defaults_to_english(self):
        self.assertEqual(normalize_language(), "en")
        self.assertEqual(normalize_language(None), "en")

    def test_rejects_unsupported_languages(self):
        with self.assertRaisesRegex(ValueError, "English.*Filipino"):
            normalize_language("th")


if __name__ == "__main__":
    unittest.main()
