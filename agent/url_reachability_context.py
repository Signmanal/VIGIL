from __future__ import annotations

import asyncio
import ipaddress
import json
import re
from dataclasses import dataclass, field
from typing import Any


_URL_PATTERN = re.compile(r"https?://[^\s<>'\"`]+", re.IGNORECASE)
_HOST_ASSIGNMENT_PATTERN = re.compile(
    r"\b[A-Z][A-Z0-9_]*(?:HOST|IP|ADDR|ADDRESS|ENDPOINT|BASE_URL|URL)\s*=\s*"
    r"(?!https?://)([A-Za-z0-9.-]+)(?::(\d{1,5}))?",
    re.IGNORECASE,
)
_PRIVATE_IPV4_PATTERN = re.compile(
    r"(?<![A-Za-z0-9./-])("
    r"10(?:\.\d{1,3}){3}|"
    r"127(?:\.\d{1,3}){3}|"
    r"192\.168(?:\.\d{1,3}){2}|"
    r"172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}|"
    r"100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])(?:\.\d{1,3}){2}"
    r")(?::(\d{1,5}))?(?![A-Za-z0-9])"
)
_TRAILING_URL_PUNCTUATION = ".,;:!?)]}，。；：！？、"
_MAX_PRECHECK_URLS = 3
_MAX_CONTENT_CHARS_PER_URL = 2200
_COMMON_WEB_PORTS = (443, 80, 8443, 8080)
_TCP_PROBE_TIMEOUT_SECONDS = 0.75


@dataclass
class UrlReachabilityContextResult:
    message: str
    original_message: str
    checked_urls: list[str] = field(default_factory=list)
    injected: bool = False


@dataclass(frozen=True)
class _HostCandidate:
    host: str
    port: int | None = None


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


def _parse_port(value: str | None) -> int | None:
    if not value:
        return None
    try:
        port = int(value)
    except (TypeError, ValueError):
        return None
    if 1 <= port <= 65535:
        return port
    return None


def _private_ip_host(host: str) -> str | None:
    candidate = host.strip().strip("[]").rstrip(_TRAILING_URL_PUNCTUATION)
    if not candidate:
        return None
    try:
        ip = ipaddress.ip_address(candidate)
    except ValueError:
        return None

    if (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip in ipaddress.ip_network("100.64.0.0/10")
    ):
        try:
            from tools.url_safety import is_always_blocked_url

            if is_always_blocked_url(f"http://{candidate}/"):
                return None
        except Exception:
            pass
        return candidate
    return None


def _extract_private_host_candidates(message: str) -> list[_HostCandidate]:
    if not message:
        return []

    candidates: list[_HostCandidate] = []
    seen: set[tuple[str, int | None]] = set()

    def add(host: str, port_text: str | None = None) -> None:
        private_host = _private_ip_host(host)
        if not private_host:
            return
        port = _parse_port(port_text)
        key = (private_host, port)
        if key in seen:
            return
        seen.add(key)
        candidates.append(_HostCandidate(private_host, port))

    for match in _HOST_ASSIGNMENT_PATTERN.finditer(message):
        add(match.group(1), match.group(2))
        if len(candidates) >= _MAX_PRECHECK_URLS:
            return candidates

    for match in _PRIVATE_IPV4_PATTERN.finditer(message):
        add(match.group(1), match.group(2))
        if len(candidates) >= _MAX_PRECHECK_URLS:
            break

    return candidates


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


async def _probe_tcp(host: str, port: int) -> bool:
    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(host, port),
            timeout=_TCP_PROBE_TIMEOUT_SECONDS,
        )
        writer.close()
        await writer.wait_closed()
        # The reader object keeps the connection alive until the writer closes.
        del reader
        return True
    except Exception:
        return False


async def _probe_private_hosts(
    candidates: list[_HostCandidate],
) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for candidate in candidates:
        ports = (candidate.port,) if candidate.port else _COMMON_WEB_PORTS
        reachable_port: int | None = None
        for port in ports:
            if await _probe_tcp(candidate.host, port):
                reachable_port = port
                break
        results.append(
            {
                "host": candidate.host,
                "port": reachable_port,
                "reachable": reachable_port is not None,
                "probed_ports": list(ports),
                "suggested_url": (
                    f"{'https' if reachable_port == 443 else 'http'}://{candidate.host}"
                    if reachable_port
                    else None
                ),
            }
        )
    return results


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


def _format_host_context(results: list[dict[str, Any]]) -> str:
    if not results:
        return ""

    lines = [
        "[XCLAW local host check]",
        "The following private/internal host values were detected in the user's message and checked from this macOS machine before answering. This desktop gateway runs on the user's local network, so do not assume these hosts are unreachable just because they use private IP space.",
    ]
    for item in results[:_MAX_PRECHECK_URLS]:
        host = str(item.get("host") or "")
        if not host:
            continue
        lines.append(f"- Host: {host}")
        if item.get("reachable"):
            lines.append(f"  TCP status: reachable from this machine on port {item.get('port')}")
            suggested_url = item.get("suggested_url")
            if suggested_url:
                lines.append(f"  Suggested base URL: {suggested_url}")
        else:
            probed = ", ".join(str(port) for port in item.get("probed_ports") or [])
            lines.append(
                f"  TCP status: no response on default web ports from this machine ({probed})"
            )
            lines.append(
                "  Note: this does not prove the host is unreachable; ask for the exact scheme, port, and path instead of claiming that private/internal IPs are blocked."
            )
    return "\n".join(lines).strip()


async def build_url_reachability_context_async(
    message: str,
) -> UrlReachabilityContextResult:
    original = message
    urls = _extract_http_urls(message)
    local_urls = await _local_network_urls(urls)
    host_candidates = _extract_private_host_candidates(message)
    host_results = await _probe_private_hosts(host_candidates) if host_candidates else []
    if not local_urls and not host_results:
        return UrlReachabilityContextResult(message=message, original_message=original)

    contexts: list[str] = []
    try:
        from tools.web_tools import web_extract_tool

        if local_urls:
            raw = await web_extract_tool(
                local_urls,
                format="markdown",
                use_llm_processing=False,
            )
            payload = json.loads(raw)
            contexts.append(_format_url_context(payload))
    except Exception as exc:
        payload = {"error": str(exc), "results": []}
        contexts.append(_format_url_context(payload))

    host_context = _format_host_context(host_results)
    if host_context:
        contexts.append(host_context)
    context = "\n\n".join(part for part in contexts if part).strip()
    if not context:
        return UrlReachabilityContextResult(message=message, original_message=original)

    enriched = (
        f"{message}\n\n"
        f"{context}\n\n"
        "Answer the user's request using the local URL/host check above. Do not say that a private/internal URL is unreachable, and do not say that a private/internal host is unreachable, unless the local check status says it failed."
    )
    return UrlReachabilityContextResult(
        message=enriched,
        original_message=original,
        checked_urls=local_urls + [item.host for item in host_candidates],
        injected=True,
    )


def build_url_reachability_context(message: str) -> UrlReachabilityContextResult:
    return _run_async(build_url_reachability_context_async(message))
