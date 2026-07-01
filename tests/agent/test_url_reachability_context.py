import json

import pytest


@pytest.mark.asyncio
async def test_private_url_reachability_context_injects_local_result(monkeypatch):
    from agent import url_reachability_context as ctx
    from tools import web_tools

    async def fake_local_network_urls(urls):
        return ["https://10.50.2.44/threatConvergence"]

    async def fake_extract(urls, format=None, use_llm_processing=True):
        assert urls == ["https://10.50.2.44/threatConvergence"]
        assert format == "markdown"
        assert use_llm_processing is False
        return json.dumps(
            {
                "results": [
                    {
                        "url": urls[0],
                        "title": "AiLPHA智能安全运营平台",
                        "content": "AI-Driven SecOps portal",
                        "error": None,
                    }
                ]
            },
            ensure_ascii=False,
        )

    monkeypatch.setattr(ctx, "_local_network_urls", fake_local_network_urls)
    monkeypatch.setattr(web_tools, "web_extract_tool", fake_extract)

    result = await ctx.build_url_reachability_context_async(
        "你可以访问这个网站吗？ https://10.50.2.44/threatConvergence"
    )

    assert result.injected is True
    assert result.original_message == "你可以访问这个网站吗？ https://10.50.2.44/threatConvergence"
    assert "XCLAW local URL check" in result.message
    assert "Status: reachable from this machine" in result.message
    assert "AiLPHA智能安全运营平台" in result.message
    assert "Do not say that a private/internal URL is unreachable" in result.message


@pytest.mark.asyncio
async def test_url_reachability_context_ignores_non_local_urls(monkeypatch):
    from agent import url_reachability_context as ctx

    async def fake_local_network_urls(urls):
        assert urls == ["https://example.com/path"]
        return []

    monkeypatch.setattr(ctx, "_local_network_urls", fake_local_network_urls)

    result = await ctx.build_url_reachability_context_async(
        "请总结 https://example.com/path"
    )

    assert result.injected is False
    assert result.message == "请总结 https://example.com/path"
    assert result.checked_urls == []


def test_extract_http_urls_strips_common_cjk_trailing_punctuation():
    from agent.url_reachability_context import _extract_http_urls

    assert _extract_http_urls("访问 https://10.50.2.44/threatConvergence。") == [
        "https://10.50.2.44/threatConvergence"
    ]


@pytest.mark.asyncio
async def test_bare_private_host_assignment_injects_local_probe_result(monkeypatch):
    from agent import url_reachability_context as ctx

    async def fake_probe_private_hosts(candidates):
        assert [candidate.host for candidate in candidates] == ["192.168.30.39"]
        return [
            {
                "host": "192.168.30.39",
                "port": 443,
                "reachable": True,
                "probed_ports": [443, 80, 8443, 8080],
                "suggested_url": "https://192.168.30.39",
            }
        ]

    monkeypatch.setattr(ctx, "_probe_private_hosts", fake_probe_private_hosts)

    result = await ctx.build_url_reachability_context_async(
        "UEBA_HOST=192.168.30.39 为内网 IP，本地可以访问"
    )

    assert result.injected is True
    assert "XCLAW local host check" in result.message
    assert "Host: 192.168.30.39" in result.message
    assert "reachable from this machine on port 443" in result.message
    assert "do not say that a private/internal host is unreachable" in result.message


def test_extract_private_host_candidates_handles_assignment_and_dedupes():
    from agent.url_reachability_context import _extract_private_host_candidates

    candidates = _extract_private_host_candidates(
        "UEBA_HOST=192.168.30.39，另外 192.168.30.39 也可以访问"
    )

    assert [(candidate.host, candidate.port) for candidate in candidates] == [
        ("192.168.30.39", None)
    ]
