"""Tests for the Nous-VIGIL-3/4 non-agentic warning detector.

Prior to this check, the warning fired on any model whose name contained
``"vigil"`` anywhere (case-insensitive). That false-positived on unrelated
local Modelfiles such as ``vigil-brain:qwen3-14b-ctx16k`` — a tool-capable
Qwen3 wrapper that happens to live under the "vigil" tag namespace.

``is_nous_vigil_non_agentic`` should only match the actual Nous Research
VIGIL-3 / VIGIL-4 chat family.
"""

from __future__ import annotations

import pytest

from vigil_cli.model_switch import (
    _VIGIL_MODEL_WARNING,
    _check_vigil_model_warning,
    is_nous_vigil_non_agentic,
)


@pytest.mark.parametrize(
    "model_name",
    [
        "NousResearch/VIGIL-3-Llama-3.1-70B",
        "NousResearch/VIGIL-3-Llama-3.1-405B",
        "vigil-3",
        "VIGIL-3",
        "vigil-4",
        "vigil-4-405b",
        "vigil_4_70b",
        "openrouter/vigil-3:70b",
        "openrouter/nousresearch/vigil-4-405b",
        "NousResearch/VIGIL3",
        "vigil-3.1",
    ],
)
def test_matches_real_nous_vigil_chat_models(model_name: str) -> None:
    assert is_nous_vigil_non_agentic(model_name), (
        f"expected {model_name!r} to be flagged as Nous VIGIL 3/4"
    )
    assert _check_vigil_model_warning(model_name) == _VIGIL_MODEL_WARNING


@pytest.mark.parametrize(
    "model_name",
    [
        # Kyle's local Modelfile — qwen3:14b under a custom tag
        "vigil-brain:qwen3-14b-ctx16k",
        "vigil-brain:qwen3-14b-ctx32k",
        "vigil-honcho:qwen3-8b-ctx8k",
        # Plain unrelated models
        "qwen3:14b",
        "qwen3-coder:30b",
        "qwen2.5:14b",
        "claude-opus-4-6",
        "anthropic/claude-sonnet-4.5",
        "gpt-5",
        "openai/gpt-4o",
        "google/gemini-2.5-flash",
        "deepseek-chat",
        # Non-chat VIGIL models we don't warn about
        "vigil-llm-2",
        "vigil2-pro",
        "nous-vigil-2-mistral",
        # Edge cases
        "",
        "vigil",  # bare "vigil" isn't the 3/4 family
        "vigil-brain",
        "brain-vigil-3-impostor",  # "3" not preceded by /: boundary
    ],
)
def test_does_not_match_unrelated_models(model_name: str) -> None:
    assert not is_nous_vigil_non_agentic(model_name), (
        f"expected {model_name!r} NOT to be flagged as Nous VIGIL 3/4"
    )
    assert _check_vigil_model_warning(model_name) == ""


def test_none_like_inputs_are_safe() -> None:
    assert is_nous_vigil_non_agentic("") is False
    # Defensive: the helper shouldn't crash on None-ish falsy input either.
    assert _check_vigil_model_warning("") == ""
