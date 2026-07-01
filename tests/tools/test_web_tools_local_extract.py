import json
from unittest.mock import AsyncMock, patch

import pytest


@pytest.mark.asyncio
async def test_private_url_extract_uses_local_fetch_without_provider():
    from tools import web_tools

    local_result = {
        "url": "https://10.50.2.44/threatConvergence",
        "title": "AiLPHA",
        "content": "internal portal",
        "raw_content": "internal portal",
    }

    with patch("tools.web_tools.async_is_safe_url", new=AsyncMock(return_value=True)), \
         patch("tools.web_tools._should_extract_locally", new=AsyncMock(return_value=True)), \
         patch("tools.web_tools._local_extract_url", new=AsyncMock(return_value=local_result)), \
         patch("tools.web_tools._ensure_web_plugins_loaded") as load_plugins:
        payload = await web_tools.web_extract_tool(
            ["https://10.50.2.44/threatConvergence"],
            use_llm_processing=False,
        )

    data = json.loads(payload)
    assert data["results"][0]["title"] == "AiLPHA"
    assert data["results"][0]["content"] == "internal portal"
    load_plugins.assert_not_called()


def test_web_extract_available_when_private_urls_allowed():
    from tools import web_tools

    with patch("tools.web_tools.check_web_api_key", return_value=False), \
         patch("tools.web_tools._global_allow_private_urls", return_value=True):
        assert web_tools.check_web_extract_available() is True
