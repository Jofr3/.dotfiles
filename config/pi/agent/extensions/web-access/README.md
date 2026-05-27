# Local split web-access core

Shared helper modules copied from `~/projects/pi-web-access` (pi-web-access 0.10.7) for the local split extensions in `../web-*.ts`.

This directory intentionally has no `index.ts` and no `pi.extensions` manifest, so Pi does **not** load it as an extension. The top-level extensions load only the capability they own:

- `web-search.ts` — `web_search`, `/websearch`, `/curator`
- `web-fetch.ts` — `fetch_content`
- `web-content.ts` — `get_search_content`, `/search`, session restore/cleanup
- `web-code-search.ts` — `code_search`
- `web-gemini.ts` — `/google-account`
- `web-activity.ts` — activity widget shortcut

Runtime dependencies are installed locally here and `node_modules/` is git-ignored:

```bash
npm install --prefix ~/.pi/agent/extensions/web-access --omit=dev
```

State that must cross extension boundaries (`storage`, `activityMonitor`, GitHub clone cache) is pinned on `globalThis`, because Pi loads each extension with an isolated jiti module cache.
