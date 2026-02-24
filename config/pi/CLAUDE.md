# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is the runtime configuration and data directory for the `pi` agent CLI tool (Anthropic's Claude agent). It is **not a source code repository** — there is no application code, build system, or tests.

## Directory Structure

- `agent/auth.json` — OAuth credentials (refresh/access tokens) for Anthropic API authentication. **Sensitive — never commit to version control.**
- `agent/settings.json` — Agent settings (e.g., last seen changelog version).
- `agent/sessions/` — Per-project session data, organized by encoded project path (e.g., `--home-jofre-projects-chronos--/`).

## Source Code

The pi agent source code lives in `~/projects/pi-mono`. When extending or modifying the pi agent, reference that repository for implementation details, architecture, and build instructions.

Pi is an extensible agent by design — many features are intended to be built by the user or community rather than shipped out of the box.

## Extensions

See [EXTENSIONS.md](./EXTENSIONS.md) for the complete extension authoring guide — events, tool interception, commands, UI, tool registration, providers, and examples.

- Extensions live in `agent/extensions/` (auto-discovered, no config needed)
- Extensions are plain TypeScript loaded via jiti — no build step
- Import from `@mariozechner/pi-coding-agent`, `@mariozechner/pi-tui`, `@sinclair/typebox`, and Node.js built-ins
- Key pattern: `export default function (pi: ExtensionAPI) { ... }`

### Local Extensions

- `agent/extensions/safeguard.ts` — Configurable policy engine that intercepts tool calls against rules in `agent/safeguard.json` (block, confirm, or allow based on regex matching). Commands: `/safeguard`, `/safeguard-add`, `/safeguard-remove`.

## Important Notes

- This directory contains **sensitive credentials** in `agent/auth.json`. Ensure it is excluded from any version control or backup that could expose tokens.
- There are no build, lint, or test commands — this is purely a data/config directory.
