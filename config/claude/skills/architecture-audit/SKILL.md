---
description: Architectural and structural codebase audit producing prioritized recommendations on module boundaries, directory organization, coupling, dependency graphs, dead code, and file-level structural issues. Four phases (explore, structural analysis, file-level review, prioritized report). Use when user asks to audit, review, or assess a codebase's architecture, structure, organization, or module layout.
user_invocable: true
---

You are performing a comprehensive codebase audit. Your goal is to produce actionable, prioritized recommendations at two levels: (1) architectural/structural, and (2) file-level details.

## Phase 1 — Exploration & Mapping

Before making any suggestions:

1. Read the root directory listing and key config files (package.json, tsconfig.json, nx.json, turbo.json, flake.nix, or equivalents).
2. Identify the project type, tech stack, monorepo vs. single-package, and build system.
3. List all top-level directories and infer each one's responsibility.
4. Find entry points (main files, index exports, server bootstraps).
5. Sample 3–5 files from each major area to calibrate the existing code style and conventions.

Do NOT start writing suggestions until this phase is complete.

---

## Phase 2 — Structural & Organizational Analysis

Evaluate the project at the macro level:

- **Module boundaries**: Are concerns cleanly separated? Is there unwanted coupling between layers (e.g., UI importing DB logic directly)?
- **Directory naming & grouping**: Are folders named by feature, by type, or mixed? Is it consistent? Would a different strategy (feature-first vs. layer-first) be more appropriate?
- **Barrel files / index exports**: Are public APIs well-defined? Are there any accidental re-exports leaking internals?
- **Dependency graph**: Are there circular dependencies? Can you identify any?
- **Shared code**: Is shared logic properly extracted into shared packages/modules, or is it duplicated?
- **Configuration sprawl**: Are config files duplicated across packages or centralised?
- **Dead code / unused files**: Flag any directories or files that appear orphaned.

For each finding: state the problem, explain the impact, and suggest a concrete fix.

---

## Phase 3 — File-Level Review

For each major file or module area, check:

- **Naming conventions**: Are files, functions, variables, and types named consistently and clearly?
- **Function length & complexity**: Flag functions that do too much and suggest how to split them.
- **Type safety**: Missing types, overly broad `any`, or missing error type narrowing.
- **Error handling**: Are errors caught and handled at the right level? Are there uncaught promise rejections or empty catch blocks?
- **Imports**: Unused imports, overly deep relative paths that could use aliases, import ordering.
- **Comments & documentation**: Missing JSDoc on public APIs, stale/misleading comments, or over-commented obvious code.
- **Magic values**: Hard-coded strings or numbers that should be constants.
- **Consistency**: Code style inconsistencies vs. the dominant patterns observed in Phase 1.

Do NOT rewrite code unless asked. Provide targeted, surgical suggestions with the file path and line reference where possible.

---

## Phase 4 — Prioritized Output

Produce a structured report with three sections:

### 🏗 Structural Recommendations (High Impact)
Numbered list. Each item: problem → impact → recommended action.

### 🔧 File-Level Improvements (Medium Impact)
Grouped by file or module. Each item: file path + issue + suggested fix (one-liner or short snippet if helpful).

### 🧹 Minor Polish (Low Impact / Quick Wins)
Naming, formatting, trivial cleanup — batched briefly.

---

## Constraints

- Be specific: always reference actual file paths and code you have read, never invent examples.
- Be honest: if a part of the codebase is well-structured, say so.
- Be concise in the report itself — save detail for when implementing fixes.
- Ask clarifying questions before starting if the project purpose or intended architecture is unclear.
