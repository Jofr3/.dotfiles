---
name: context7
description: Fetch up-to-date library documentation and code examples from Context7. Use when you need current API references, usage examples, or documentation for any programming library or framework — especially when your training data may be outdated.
---

# Context7 — Up-to-date Library Documentation

Query the Context7 API to retrieve current documentation and code examples for any programming library or framework. This is especially useful when working with libraries that have frequent releases or when you need accurate, version-specific API references.

## Tools

| Tool | Description |
|------|-------------|
| `context7_search` | Search for libraries by name. Returns library IDs, descriptions, snippet counts, and quality scores. |
| `context7_docs` | Fetch documentation and code examples for a specific library using its Context7 library ID. |

## Workflow

### Step 1: Find the Library ID

Always call `context7_search` first to resolve a library name to a Context7-compatible library ID:

```
context7_search({ libraryName: "react", query: "hooks and state management" })
```

This returns a ranked list of matching libraries. Select the best match based on:
- Name similarity (exact matches preferred)
- Snippet count (higher = more comprehensive)
- Benchmark score (higher = better quality)
- Source reputation (High > Medium > Low)

### Step 2: Fetch Documentation

Use the library ID from step 1 to fetch relevant docs:

```
context7_docs({ libraryId: "/websites/react_dev", query: "useEffect cleanup function" })
```

**Be specific with your query** — vague queries like "hooks" return broad results. Specific queries like "useEffect cleanup function examples" return targeted, useful snippets.

## Examples

### Get React hook examples
```
context7_search({ libraryName: "react", query: "useState hook" })
context7_docs({ libraryId: "/websites/react_dev", query: "useState hook initialization and updates" })
```

### Get Next.js App Router docs
```
context7_search({ libraryName: "nextjs", query: "app router" })
context7_docs({ libraryId: "/vercel/next.js", query: "app router file-based routing and layouts" })
```

### Get Express middleware docs
```
context7_search({ libraryName: "express", query: "middleware" })
context7_docs({ libraryId: "/expressjs/express", query: "custom middleware error handling" })
```

## Configuration

### API Key (Optional)

Set `CONTEXT7_API_KEY` environment variable for higher rate limits. Without it, the API works with lower rate limits.

Get a free API key at: https://context7.com/dashboard

### Library ID Format

Library IDs follow the pattern `/org/project` (e.g., `/vercel/next.js`, `/mongodb/docs`). Some libraries also support versioned IDs: `/org/project/version`.

## Guidelines

- **Always search first.** Call `context7_search` before `context7_docs` to get a valid library ID.
- **Be specific with queries.** "How to set up JWT authentication in Express.js" works much better than "auth".
- **Don't over-call.** Limit to 3 calls per question. If you can't find what you need, use the best result you have.
- **Check snippet count.** Libraries with more snippets have more comprehensive documentation coverage.
- **Use benchmark scores.** Higher scores (max 100) indicate better documentation quality.
