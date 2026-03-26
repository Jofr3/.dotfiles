---
name: nix
description: >
  Query NixOS packages, options, Home Manager, nix-darwin, flakes,
  FlakeHub, Noogle functions, NixOS Wiki, nix.dev docs, NixHub versions,
  binary cache status, and local flake inputs via the mcp-nixos MCP server.
  Use this skill whenever the user works with Nix, NixOS, Home Manager,
  nix-darwin, flakes, or any Nix ecosystem tooling — whether they're
  searching for packages, looking up configuration options, checking package
  versions, reading wiki articles, finding Nix built-in functions, or debugging
  Nix expressions. Trigger proactively when the context involves .nix files,
  flake.nix, NixOS rebuilds, Home Manager config, or any Nix package/option
  references. Even if the user doesn't say "look up", if the task involves the
  Nix ecosystem, use this skill.
user_invocable: true
---

# Nix MCP Skill

Query real-time Nix ecosystem data via the mcp-nixos MCP server instead of
relying on training data. The Nix ecosystem changes rapidly — package versions,
options, and flake APIs shift across channels and releases. Always prefer
querying over guessing.

## Tools

Two MCP tools are available:

### `mcp__nix__nix` — Unified Query Tool

```
mcp__nix__nix(action, query, source, type, channel, limit)
```

| Parameter | Required | Default      | Values |
|-----------|----------|--------------|--------|
| `action`  | yes      | —            | `search`, `info`, `stats`, `options`, `channels`, `flake-inputs`, `cache` |
| `query`   | no       | `""`         | Search term, package/option name, or prefix |
| `source`  | no       | `nixos`      | `nixos`, `home-manager`, `darwin`, `flakes`, `flakehub`, `noogle`, `wiki`, `nix-dev`, `nixhub` |
| `type`    | no       | `packages`   | `packages`, `options`, `programs` (for nixos source); `list`, `ls`, `read` (for flake-inputs action) |
| `channel` | no       | `unstable`   | `unstable`, `stable`, or specific like `25.05` |
| `limit`   | no       | `20`         | 1–100 |

### `mcp__nix__nix_versions` — Package Version History

```
mcp__nix__nix_versions(package, version, limit)
```

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `package` | yes      | —       | Package name (e.g. `python`, `nodejs`) |
| `version` | no       | `""`    | Specific version to find (e.g. `20.0.0`) |
| `limit`   | no       | `10`    | 1–50 |

Returns version history with nixpkgs commit hashes, platform availability,
license, homepage, and attribute paths for reproducible builds.

## Sources Reference

### nixos — NixOS Packages & Options
130K+ packages and 23K+ options from [search.nixos.org](https://search.nixos.org).

```python
# Search packages
mcp__nix__nix(action="search", query="firefox", source="nixos", type="packages")

# Search by program binary name
mcp__nix__nix(action="search", query="rg", source="nixos", type="programs")

# Get package details
mcp__nix__nix(action="info", query="firefox", source="nixos", type="package")

# Search NixOS options
mcp__nix__nix(action="search", query="networking.firewall", source="nixos", type="options")

# Get option details
mcp__nix__nix(action="info", query="services.nginx.enable", source="nixos", type="options")

# Get channel statistics
mcp__nix__nix(action="stats", source="nixos", channel="stable")

# List available channels
mcp__nix__nix(action="channels")
```

### home-manager — Home Manager Options
5K+ options for user-level configuration via Home Manager.

```python
# Search options
mcp__nix__nix(action="search", query="git", source="home-manager")

# Get option details
mcp__nix__nix(action="info", query="programs.git.enable", source="home-manager")

# Browse by prefix
mcp__nix__nix(action="options", source="home-manager", query="programs.fish")
```

### darwin — nix-darwin Options
1K+ macOS configuration options via nix-darwin.

```python
# Search options
mcp__nix__nix(action="search", query="dock", source="darwin")

# Browse by prefix
mcp__nix__nix(action="options", source="darwin", query="system.defaults")

# Get option details
mcp__nix__nix(action="info", query="system.defaults.dock.autohide", source="darwin")
```

### flakes — Community Flakes
Search community flakes from [search.nixos.org](https://search.nixos.org).

```python
mcp__nix__nix(action="search", query="devenv", source="flakes")
```

### flakehub — FlakeHub Registry
600+ flakes from [FlakeHub.com](https://flakehub.com) by Determinate Systems.

```python
# Search flakes
mcp__nix__nix(action="search", query="nixpkgs", source="flakehub")

# Get flake details
mcp__nix__nix(action="info", query="NixOS/nixpkgs", source="flakehub")
```

### noogle — Nix Function Search
2K+ Nix built-in and lib functions with type signatures from [noogle.dev](https://noogle.dev).

```python
# Search functions
mcp__nix__nix(action="search", query="mapAttrs", source="noogle")

# Get function details (type signature, examples, description)
mcp__nix__nix(action="info", query="lib.attrsets.mapAttrs", source="noogle")

# Browse function categories
mcp__nix__nix(action="options", source="noogle", query="lib.strings")
```

### wiki — NixOS Wiki
Community documentation and guides from [wiki.nixos.org](https://wiki.nixos.org).

```python
# Search articles
mcp__nix__nix(action="search", query="nvidia", source="wiki")

# Get article content
mcp__nix__nix(action="info", query="Flakes", source="wiki")
```

### nix-dev — Official Nix Documentation
Tutorials and guides from [nix.dev](https://nix.dev).

```python
mcp__nix__nix(action="search", query="packaging tutorial", source="nix-dev")
```

### nixhub — NixHub Package Metadata
Package metadata, store paths, and version history from [NixHub.io](https://www.nixhub.io)
by [Jetify](https://www.jetify.com) (creators of Devbox). Covers 400K+ granular versions.

```python
# Search packages
mcp__nix__nix(action="search", query="nodejs", source="nixhub")

# Get detailed info (license, homepage, store paths)
mcp__nix__nix(action="info", query="python", source="nixhub")
```

## Special Actions

### cache — Binary Cache Status
Check if a package is cached on cache.nixos.org with download sizes.

```python
# Basic cache check
mcp__nix__nix(action="cache", query="hello")

# Specific version
mcp__nix__nix(action="cache", query="python", version="3.12.0")

# Specific system
mcp__nix__nix(action="cache", query="firefox", system="x86_64-linux")
```

### flake-inputs — Local Flake Inputs
Explore pinned flake dependencies from the Nix store (requires Nix installed).

```python
# List all flake inputs
mcp__nix__nix(action="flake-inputs", type="list")

# Browse files in a flake input
mcp__nix__nix(action="flake-inputs", type="ls", query="nixpkgs:pkgs/by-name")

# Read a file from a flake input
mcp__nix__nix(action="flake-inputs", type="read", query="nixpkgs:flake.nix")
```

## Workflow

### When the user asks about a package
1. Search for it: `action="search", query="<name>", source="nixos"`
2. Get details: `action="info", query="<attr-path>", source="nixos"`
3. If they need a specific version: `mcp__nix__nix_versions(package="<name>")`

### When the user asks about a configuration option
1. Determine the source: `nixos` for system options, `home-manager` for user
   config, `darwin` for macOS
2. Search: `action="search", query="<term>", source="<source>"`
3. Get details: `action="info", query="<option.path>", source="<source>"`
4. Browse related: `action="options", source="<source>", query="<prefix>"`

### When the user asks about a Nix function
1. Search noogle: `action="search", query="<name>", source="noogle"`
2. Get signature and docs: `action="info", query="<full.path>", source="noogle"`

### When the user asks about Nix concepts or troubleshooting
1. Check the wiki: `action="search", query="<topic>", source="wiki"`
2. Check nix.dev: `action="search", query="<topic>", source="nix-dev"`

### When the user needs version pinning
1. Get version history: `mcp__nix__nix_versions(package="<name>")`
2. Find specific version: `mcp__nix__nix_versions(package="<name>", version="<ver>")`
3. Use the returned nixpkgs commit hash for pinning

## When $ARGUMENTS is provided

If the user invokes this skill with arguments (e.g. `/nix firefox`), treat the
argument as a search query. Search across the most relevant sources (typically
`nixos` for packages, then `home-manager` for options) and present a summary of
what was found.

## Tips

- Use `type="programs"` to find which package provides a specific binary
- Use `action="options"` with a prefix to browse option trees hierarchically
- The `channel` parameter matters — `stable` and `unstable` have different packages
- When debugging build issues, check `cache` to see if the package is pre-built
- For reproducible environments, use `nix_versions` to get exact commit hashes
- Combine `wiki` and `nix-dev` searches for comprehensive documentation coverage
- Noogle is invaluable when writing Nix expressions — search for function
  signatures instead of guessing
