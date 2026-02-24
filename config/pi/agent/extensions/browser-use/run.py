#!/usr/bin/env python3
"""
browser-use runner for pi agent extension.

Accepts a JSON config on stdin, runs a browser-use Agent, and prints JSON results to stdout.
All logging/progress goes to stderr so stdout stays clean for the JSON result.

Expected input JSON:
{
  "task": "string — the task to perform",
  "llm_provider": "openai" | "anthropic" | "google" | "browseruse",
  "llm_model": "model name",
  "headless": true | false,
  "use_vision": true | false,
  "max_steps": 25,
  "allowed_domains": ["*.example.com"] | null,
  "sensitive_data": {"key": "value"} | null,
  "use_cloud": false,
  "cdp_url": null,
  "save_recording_dir": null
}

Output JSON:
{
  "success": true | false,
  "final_result": "string or null",
  "urls": ["..."],
  "actions": ["..."],
  "extracted_content": ["..."],
  "errors": ["..."],
  "steps": int,
  "duration_seconds": float,
  "error": "string if failed"
}
"""

import asyncio
import json
import os
import sys
from pathlib import Path


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def build_llm(provider: str, model: str):
    """Construct the appropriate LLM client."""
    provider = provider.lower()

    if provider == "browseruse":
        from browser_use import ChatBrowserUse
        return ChatBrowserUse()
    elif provider == "openai":
        from browser_use import ChatOpenAI
        return ChatOpenAI(model=model)
    elif provider == "anthropic":
        from browser_use import ChatAnthropic
        return ChatAnthropic(model=model)
    elif provider == "google":
        from browser_use import ChatGoogle
        return ChatGoogle(model=model)
    else:
        raise ValueError(f"Unsupported LLM provider: {provider}")


async def run_agent(cfg: dict) -> dict:
    from browser_use import Agent, Browser, BrowserProfile

    # --- LLM ---
    llm_provider = cfg.get("llm_provider", "openai")
    llm_model = cfg.get("llm_model", "gpt-4o")
    llm = build_llm(llm_provider, llm_model)
    log(f"[browser-use] LLM: {llm_provider}/{llm_model}")

    # --- Browser ---
    browser_kwargs: dict = {}
    if cfg.get("headless") is not None:
        browser_kwargs["headless"] = cfg["headless"]
    if cfg.get("cdp_url"):
        browser_kwargs["cdp_url"] = cfg["cdp_url"]
    if cfg.get("use_cloud"):
        browser_kwargs["use_cloud"] = True
    if cfg.get("save_recording_dir"):
        browser_kwargs["record_video_dir"] = Path(cfg["save_recording_dir"])

    browser = Browser(**browser_kwargs) if browser_kwargs else None

    # --- Browser profile ---
    browser_profile = None
    if cfg.get("allowed_domains"):
        browser_profile = BrowserProfile(allowed_domains=cfg["allowed_domains"])

    # --- Agent ---
    agent_kwargs: dict = {
        "task": cfg["task"],
        "llm": llm,
    }
    if browser:
        agent_kwargs["browser"] = browser
    if browser_profile:
        agent_kwargs["browser_profile"] = browser_profile
    if cfg.get("use_vision") is not None:
        agent_kwargs["use_vision"] = cfg["use_vision"]
    if cfg.get("max_steps"):
        agent_kwargs["max_steps"] = cfg["max_steps"]
    if cfg.get("sensitive_data"):
        agent_kwargs["sensitive_data"] = cfg["sensitive_data"]

    agent = Agent(**agent_kwargs)
    log(f"[browser-use] Running task: {cfg['task'][:120]}")

    try:
        history = await agent.run()

        return {
            "success": bool(history.is_done()),
            "final_result": history.final_result(),
            "urls": history.urls() or [],
            "actions": history.action_names() or [],
            "extracted_content": history.extracted_content() or [],
            "errors": [str(e) for e in (history.errors() or []) if e is not None],
            "steps": history.number_of_steps(),
            "duration_seconds": round(history.total_duration_seconds(), 2),
        }
    finally:
        if browser:
            try:
                await browser.kill()
            except Exception:
                pass


def main() -> None:
    # Accept JSON config as CLI argument or from a file path (prefixed with @)
    if len(sys.argv) < 2:
        json.dump({"success": False, "error": "Usage: run.py <json-config | @filepath>"}, sys.stdout)
        sys.exit(1)

    raw = sys.argv[1]
    if raw.startswith("@"):
        try:
            with open(raw[1:], "r") as f:
                raw = f.read()
        except OSError as e:
            json.dump({"success": False, "error": f"Cannot read config file: {e}"}, sys.stdout)
            sys.exit(1)

    try:
        cfg = json.loads(raw)
    except json.JSONDecodeError as e:
        json.dump({"success": False, "error": f"Invalid JSON input: {e}"}, sys.stdout)
        sys.exit(1)

    if not cfg.get("task"):
        json.dump({"success": False, "error": "Missing required field: task"}, sys.stdout)
        sys.exit(1)

    # Disable telemetry by default
    os.environ.setdefault("ANONYMIZED_TELEMETRY", "false")

    # NixOS: ensure playwright can find browsers in writable cache
    os.environ.setdefault(
        "PLAYWRIGHT_BROWSERS_PATH",
        os.path.join(os.path.expanduser("~"), ".cache", "playwright-browsers"),
    )
    os.environ.setdefault("PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS", "1")

    try:
        result = asyncio.run(run_agent(cfg))
        json.dump(result, sys.stdout)
    except Exception as e:
        json.dump({"success": False, "error": f"{type(e).__name__}: {e}"}, sys.stdout)
        sys.exit(1)


if __name__ == "__main__":
    main()
