from __future__ import annotations

import asyncio
import json
import re
from dataclasses import dataclass, field
from typing import Any


_URL_PATTERN = re.compile(r"https?://[^\s<>'\"`]+", re.IGNORECASE)
_TRAILING_URL_PUNCTUATION = ".,;:!?)]}，。；：！？、"
_MAX_PRECHECK_URLS = 3
_MAX_CONTENT_CHARS_PER_URL = 2200


@dataclass
class UrlReachabilityContextResult:
    message: str
    original_message: str
    checked_urls: list[str] = field(default_factory=list)
    injected: bool = False


def _run_async(coro):
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
    if loop and loop.is_running():
        import concurrent.futures

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            return pool.submit(asyncio.run, coro).result()
    return asyncio.run(coro)


def _extract_http_urls(message: str) -> list[str]:
    if not message:
        return []

    urls: list[str] = []
    seen: set[str] = set()
    for match in _URL_PATTERN.finditer(message):
        raw = match.group(0).rstrip(_TRAILING_URL_PUNCTUATION)
        if not raw:
            continue
        try:
            from tools.url_safety import normalize_url_for_request

            url = normalize_url_for_request(raw)
        except Exception:
            url = raw
        if url in seen:
            continue
        seen.add(url)
        urls.append(url)
        if len(urls) >= _MAX_PRECHECK_URLS:
            break
    return urls


async def _local_network_urls(urls: list[str]) -> list[str]:
    if not urls:
        return []

    from tools.url_safety import is_always_blocked_url, url_targets_private_network

    candidates: list[str] = []
    for url in urls:
        if is_always_blocked_url(url):
            continue
        try:
            if await asyncio.to_thread(url_targets_private_network, url):
                candidates.append(url)
        except Exception:
            continue
    return candidates


def _trim_text(value: Any, limit: int = _MAX_CONTENT_CHARS_PER_URL) -> str:
    text = str(value or "").strip()
    if len(text) <= limit:
        return text
    return f"{text[:limit].rstrip()}\n...[truncated]"


def _format_url_context(payload: dict[str, Any]) -> str:
    results = payload.get("results")
    if not isinstance(results, list) or not results:
        error = payload.get("error") or "No extraction result was returned."
        return f"- Local URL check failed: {error}"

    lines = [
        "[XCLAW local URL check]",
        "The following URL check was performed from this machine on the user's local network before answering. Use these results instead of guessing whether private/internal URLs are reachable.",
    ]
    for item in results[:_MAX_PRECHECK_URLS]:
        if not isinstance(item, dict):
            continue
        url = str(item.get("url") or "")
        title = str(item.get("title") or "").strip()
        error = item.get("error")
        content = _trim_text(item.get("content") or "")
        lines.append(f"- URL: {url}")
        if error:
            lines.append(f"  Status: failed from this machine ({error})")
            continue
        lines.append("  Status: reachable from this machine")
        if title:
            lines.append(f"  Title: {title}")
        if content:
            lines.append("  Extracted content preview:")
            lines.append(content)
    return "\n".join(lines).strip()


async def build_url_reachability_context_async(
    message: str,
) -> UrlReachabilityContextResult:
    original = message
    urls = _extract_http_urls(message)
    local_urls = await _local_network_urls(urls)
    if not local_urls:
        return UrlReachabilityContextResult(message=message, original_message=original)

    try:
        from tools.web_tools import web_extract_tool

        raw = await web_extract_tool(
            local_urls,
            format="markdown",
            use_llm_processing=False,
        )
        payload = json.loads(raw)
    except Exception as exc:
        payload = {"error": str(exc), "results": []}

    context = _format_url_context(payload)
    if not context:
        return UrlReachabilityContextResult(message=message, original_message=original)

    enriched = (
        f"{message}\n\n"
        f"{context}\n\n"
        "Answer the user's request using the local URL check above. Do not say that a private/internal URL is unreachable unless the local check status says it failed."
    )
    return UrlReachabilityContextResult(
        message=enriched,
        original_message=original,
        checked_urls=local_urls,
        injected=True,
    )


def build_url_reachability_context(message: str) -> UrlReachabilityContextResult:
    return _run_async(build_url_reachability_context_async(message))
