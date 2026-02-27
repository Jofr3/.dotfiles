---
description: Fetch up-to-date library documentation and code examples via Context7. Use when the user asks about libraries, frameworks, APIs, or needs code examples. Activates for setup questions, code generation involving packages, or mentions of specific frameworks like React, Next.js, Prisma, Supabase, Tailwind, etc.
user_invocable: true
---

Use the Context7 MCP tools (`mcp__context7__resolve-library-id` and `mcp__context7__query-docs`) to fetch current documentation instead of relying on training data.

## When to Activate

- User asks setup or config questions ("How do I configure Next.js middleware?")
- User requests code involving a library ("Write a Prisma query for...")
- User needs API references ("What are the Supabase auth methods?")
- User mentions a specific framework or package by name
- User says "look up the docs" or "check the documentation"
- User provides a library name as the argument: $ARGUMENTS

## Steps

### 1. Resolve the library ID

Call `mcp__context7__resolve-library-id` with:
- `libraryName`: the package name (e.g. "next.js", "prisma", "react")
- `query`: the user's full question for better relevance ranking

### 2. Pick the best match

- Prefer exact name matches over partial
- Higher benchmark scores = better docs quality
- If the user mentioned a version (e.g. "React 19"), use version-specific IDs when available
- Prefer official packages over community forks

### 3. Query the docs

Call `mcp__context7__query-docs` with:
- `libraryId`: the Context7 library ID from step 2 (e.g. `/vercel/next.js`)
- `query`: the user's specific question

### 4. Respond

- Answer using the fetched documentation, not training data
- Include relevant code examples from the docs
- Mention the library version when relevant
- Do not call either tool more than 3 times per question
