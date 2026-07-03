#!/usr/bin/env python3

import unittest
from unittest.mock import patch

from tools.skills_hub import DasClawSource


class _MockResponse:
    def __init__(self, status_code=200, json_data=None):
        self.status_code = status_code
        self._json_data = json_data

    def json(self):
        return self._json_data


class TestDasClawSource(unittest.TestCase):
    def setUp(self):
        self.src = DasClawSource()

    @patch("tools.skills_hub.httpx.get")
    def test_search_maps_public_plaza_rows(self, mock_get):
        mock_get.return_value = _MockResponse(
            json_data={
                "skills": [
                    {
                        "id": 780,
                        "title": "incident-response",
                        "display_name": "安全事件应急响应",
                        "display_description": "自动化处置安全事件。",
                        "tags": ["应急响应"],
                        "downloads": 12,
                        "rating": 5,
                        "version": "1.0.0",
                    }
                ]
            }
        )

        results = self.src.search("incident", limit=5)

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].source, "dasclaw")
        self.assertEqual(results[0].identifier, "dasclaw/780")
        self.assertEqual(results[0].name, "安全事件应急响应")
        self.assertIn("安全事件", results[0].description)
        self.assertEqual(results[0].trust_level, "community")
        self.assertIn("应急响应", results[0].tags)
        self.assertEqual(results[0].extra["version"], "1.0.0")

        args, kwargs = mock_get.call_args
        self.assertTrue(args[0].endswith("/api/skills/plaza"))
        self.assertEqual(kwargs["params"]["q"], "incident")

    @patch("tools.skills_hub.httpx.get")
    def test_fetch_builds_bundle_from_public_detail(self, mock_get):
        mock_get.return_value = _MockResponse(
            json_data={
                "id": 780,
                "title": "incident-response",
                "display_name": "安全事件应急响应",
                "display_description": "自动化处置安全事件。",
                "skill_md_content": "---\nname: incident-response\n---\n# Incident Response\n",
                "skill_json_content": '{"name":"incident-response"}',
                "version": "1.0.0",
            }
        )

        bundle = self.src.fetch("dasclaw/780")

        self.assertIsNotNone(bundle)
        assert bundle is not None
        self.assertEqual(bundle.name, "incident-response")
        self.assertEqual(bundle.source, "dasclaw")
        self.assertEqual(bundle.identifier, "dasclaw/780")
        self.assertEqual(bundle.trust_level, "community")
        self.assertIn("SKILL.md", bundle.files)
        self.assertIn("skill.json", bundle.files)

    @patch("tools.skills_hub.httpx.get")
    def test_fetch_falls_back_to_generated_skill_md(self, mock_get):
        mock_get.return_value = _MockResponse(
            json_data={
                "id": 679,
                "title": "csv-column-deduplicate-and-sum",
                "display_name": "CSV列去重求和",
                "display_description": "对CSV文件中指定列去重并求和。",
            }
        )

        bundle = self.src.fetch("dasclaw/679")

        self.assertIsNotNone(bundle)
        assert bundle is not None
        self.assertIn("SKILL.md", bundle.files)
        self.assertIn("CSV列去重求和", str(bundle.files["SKILL.md"]))


if __name__ == "__main__":
    unittest.main()
