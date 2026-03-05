---
name: context7
description: Fetch up-to-date library/framework documentation and code examples via the Context7 REST API. Use this skill whenever the user works with any library, framework, SDK, or package — whether they're asking setup questions, writing code that imports a package, debugging library-specific issues, or explicitly requesting docs. Trigger for mentions of specific technologies (React, Next.js, Prisma, Tailwind, FastAPI, etc.), questions about API methods or configuration, or any task where current documentation would produce a better answer than training data alone. Even if the user doesn't say "look up docs", if the task involves a third-party library, use this skill proactively.
user_invocable: true
---

# Context7 Documentation Fetcher

Pull current, version-specific documentation and code examples from Context7's REST API instead of relying on potentially outdated training data. This matters because libraries change fast — a six-month-old answer about a framework's API might be wrong today.

## API Reference

**Base URL**: `https://context7.com/api/v2`

### Endpoint 1: Search for Libraries

Find the right library ID before fetching docs.

```
GET /libs/search?libraryName={name}&query={question}
```

| Parameter     | Required | Description                                              |
|---------------|----------|----------------------------------------------------------|
| `libraryName` | yes      | Package/library name (e.g. `react`, `next.js`, `prisma`) |
| `query`       | yes      | The user's question — used for relevance ranking         |

**Response**: Array of library objects:
```json
[
  {
    "id": "/facebook/react",
    "title": "React",
    "description": "...",
    "totalSnippets": 1234,
    "trustScore": 9.2,
    "benchmarkScore": 85,
    "versions": ["/facebook/react/19.0"]
  }
]
```

### Endpoint 2: Get Documentation Context

Retrieve relevant documentation snippets for a specific library.

```
GET /context?libraryId={id}&query={question}&type=json
```

| Parameter   | Required | Description                                               |
|-------------|----------|-----------------------------------------------------------|
| `libraryId` | yes      | Library ID from search (e.g. `/facebook/react`)           |
| `query`     | yes      | Specific question for relevance ranking                   |
| `type`      | no       | `json` (default) or `txt` — use `json` for structured data |

**Response** (JSON format): Array of documentation snippets:
```json
[
  {
    "title": "useEffect Hook",
    "content": "The Effect Hook lets you perform side effects...",
    "source": "https://react.dev/reference/react/useEffect"
  }
]
```

## Workflow

### Step 1: Search for the library

Extract the library/package name from the user's question and search for it.

```bash
curl -s "https://context7.com/api/v2/libs/search?libraryName=react&query=how+to+use+useState"
```

Context7's search is sensitive to how you spell the library name. If the first search returns irrelevant results, try variations — split compound names, add/remove hyphens, or use the human-readable form:

| If this fails        | Try instead                          |
|----------------------|--------------------------------------|
| `tailwindcss`        | `tailwind css`                       |
| `nextjs`             | `next.js`                            |
| `vuejs`              | `vue`                                |
| `react-query`        | `tanstack query`                     |

When picking the right result:
- Prefer exact name matches over partial ones
- Higher `benchmarkScore` = better documentation quality
- Higher `trustScore` = more authoritative source (official repos)
- If the user mentioned a specific version (e.g. "React 19"), use the matching version ID from the `versions` array
- Prefer entries with more `totalSnippets` — they have richer docs

### Step 2: Fetch the documentation

Use the library ID from step 1 to get relevant docs.

```bash
curl -s "https://context7.com/api/v2/context?libraryId=/facebook/react&query=useState+hook&type=json"
```

Write a focused query that targets exactly what the user needs. A broad query like "react" returns generic results; a specific query like "useState initialization with lazy function" returns targeted snippets.

### Step 3: Use the documentation in your answer

- Answer based on the fetched docs, not training data
- Include code examples from the docs when relevant
- Mention the library version if the docs are version-specific
- Link to the source URL from the `source` field when citing specific APIs

## Tips for Good Queries

The `query` parameter drives the relevance ranking. Think of it like a search query — be specific about what you need:

| Instead of           | Use                                              |
|----------------------|--------------------------------------------------|
| `react`              | `how to manage form state with controlled inputs` |
| `next.js routing`    | `dynamic route parameters in app router`          |
| `prisma`             | `prisma many-to-many relation with explicit join` |

## When $ARGUMENTS is provided

If the user invokes this skill with arguments (e.g. `/context7 react hooks`), treat the argument as both the `libraryName` and the basis for the `query`. Search for the library, fetch docs, and present a summary of the most relevant documentation.

## Error Handling

- **No results from search**: Try name variations (see the table in Step 1 — e.g. `tailwindcss` → `tailwind css`, `nextjs` → `next.js`)
- **Empty docs response**: Broaden the query or try a different library ID from the search results
- **Rate limited (429)**: Wait and retry — check the `Retry-After` header for timing
