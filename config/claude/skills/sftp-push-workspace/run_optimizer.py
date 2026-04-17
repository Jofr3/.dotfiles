#!/usr/bin/env python3
"""Entry point that installs the anthropic shim then invokes run_loop.main()."""
import sys
from pathlib import Path

# Install shim BEFORE importing anything from skill-creator
sys.path.insert(0, str(Path(__file__).parent))
import anthropic_shim
anthropic_shim.install()

# Now make skill-creator's scripts package importable
SC = "/home/jofre/.claude/plugins/cache/anthropic-agent-skills/document-skills/7029232b9212/skills/skill-creator"
sys.path.insert(0, SC)

from scripts.run_loop import main as run_loop_main

if __name__ == "__main__":
    run_loop_main()
