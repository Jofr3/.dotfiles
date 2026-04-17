"""Shim for anthropic SDK that shells out to `claude -p`.

Lets scripts that import `anthropic` run without an API key by routing
every messages.create() call through the Claude Code CLI subprocess.
Provides only the surface area that improve_description.py uses:

    anthropic.Anthropic()               -> client
    client.messages.create(...)         -> response
    response.content                    -> [Block, ...]
    block.type                          -> "text"  (thinking blocks omitted)
    block.text                          -> str
"""
import os
import subprocess
import sys
import types


class _Block:
    def __init__(self, text: str):
        self.type = "text"
        self.text = text
        self.thinking = ""


class _Response:
    def __init__(self, text: str):
        self.content = [_Block(text)]


class _Messages:
    def __init__(self, parent):
        self._parent = parent

    def create(self, *, model=None, max_tokens=None, thinking=None, messages, **_):
        # Collapse the message history into a single prompt. The improver
        # only ever sends one user turn or at most user->assistant->user for
        # the shorten retry, so this flattening is fine.
        parts = []
        for m in messages:
            role = m.get("role", "user").upper()
            content = m.get("content", "")
            parts.append(f"<{role}>\n{content}\n</{role}>")
        prompt = "\n\n".join(parts)

        cmd = ["claude", "-p", prompt]
        if model:
            cmd.extend(["--model", model])

        env = {k: v for k, v in os.environ.items() if k != "CLAUDECODE"}
        proc = subprocess.run(
            cmd,
            input="",
            capture_output=True,
            text=True,
            env=env,
            timeout=600,
        )
        if proc.returncode != 0:
            raise RuntimeError(f"claude -p failed: {proc.stderr[:500]}")
        return _Response(proc.stdout)


class Anthropic:
    def __init__(self, *_, **__):
        self.messages = _Messages(self)


def install():
    """Install this shim as the `anthropic` module in sys.modules."""
    module = types.ModuleType("anthropic")
    module.Anthropic = Anthropic
    sys.modules["anthropic"] = module
