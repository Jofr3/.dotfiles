# Plan: OpenAI Agents SDK chatbot in a Node sidecar («Assistent» tab)

## Context

The admin floating panel already has two AI modes built in PHP: semantic search (RAG) and the
commercial report (Responses API + web search). The user wants to try the **OpenAI Agents SDK**,
which only exists for Python and JavaScript, so the agent must run outside PHP. A **Node sidecar**
next to Laravel is the smallest way to do that: Laravel keeps auth, CSRF, throttling and the UI;
Node only runs the agent and streams its answer back.

Decisions already taken (user, 2026-09-04):

| Question | Decision |
|---|---|
| Hosting | **Develop locally for now.** Server deployment is a documented pending item (dev2 is Ubuntu + nginx, the SSH account is jailed and cannot start long-running processes). |
| Scope v1 | **Plain SDK test, no tools.** An agent with a system prompt, to validate the plumbing. Tools (CRM lookups) are v2. |
| Transport | **Streamed via Laravel** (sidecar SSE → Laravel `StreamedResponse` → browser). |
| Audience | **Admin only**, same three-layer guard as the existing panel. Third tab in the same panel. |

Branch: `agent-sdk-test`. Nothing is deployed by this plan; `.env` is never edited (AGENTS.md §6).

## Architecture

```
Browser (admin, panel tab «Assistent»)
   │  POST /admin/cerca-semantica/assistent  {missatge, anterior?}   (session + CSRF + throttle)
   ▼
Laravel  AssistentController@xat ──► SidecarClient (Guzzle stream) ──► Node sidecar 127.0.0.1:8787
   ▲   StreamedResponse text/event-stream (byte pass-through)            POST /chat  (X-Assistent-Secret)
   │                                                                     @openai/agents run(stream:true)
   └──────────────────── SSE frames: delta / fi / error ◄────────────── OpenAI Responses API
```

- Conversation memory: OpenAI-side chaining with `previousResponseId`, exactly like the Informe tab
  (`anterior` travels browser → Laravel → sidecar and back in the `fi` event). No DB, no sessions.
- Laravel does **not** parse the SSE; it pipes bytes. The browser parses frames. If a proxy buffers,
  the UI degrades to "all at once" but still works.

## 1. Sidecar — `sidecar/assistent/` (new, own package.json, never merged into the root one)

```
sidecar/assistent/
  package.json      name ateinsa-assistent, private, "type":"module", engines node>=22,
                    deps: @openai/agents ^0.17.0, zod ^4.0.0 (peer) — nothing else, use node:http
                    scripts: start = node --env-file=.env src/server.mjs
                             dev   = node --env-file=.env --watch src/server.mjs
                             test  = node --test
  .env.example      OPENAI_API_KEY=, ASSISTENT_MODEL=gpt-5-mini, ASSISTENT_HOST=127.0.0.1,
                    ASSISTENT_PORT=8787, ASSISTENT_SECRET=, ASSISTENT_TIMEOUT_MS=120000,
                    OPENAI_AGENTS_DISABLE_TRACING=1
  .gitignore        node_modules/   (root .gitignore only ignores /node_modules; .env is already global)
  README.md         Catalan, short: què és, com arrencar en local, contracte HTTP, vegeu docs/modules/assistent_ia.md
  prompts/sistema.md   system prompt (Catalan/Spanish, replies in the user's language, states it has NO
                       access to CRM data in this version, never invents CRM facts)
  src/config.mjs    reads env, fails fast if OPENAI_API_KEY or ASSISTENT_SECRET missing
  src/agent.mjs     builds the Agent (instructions = prompts/sistema.md, model = config)
  src/sse.mjs       escriuEvent(res, nom, dades) → `event: nom\ndata: JSON\n\n`; ping comment helper
  src/server.mjs    node:http server: GET /health, POST /chat
  test/sse.test.mjs node:test for the SSE framing helper (small, no network)
```

HTTP contract:

```
POST /chat            headers: X-Assistent-Secret, Content-Type: application/json
body                  { "missatge": string 1..4000, "anterior": string|null, "usuari": { "id": int, "nom": string } }
200 text/event-stream event: delta   data: {"text":"…"}         (many)
                      event: fi      data: {"anterior":"resp_…"} (once, lastResponseId)
                      event: error   data: {"missatge":"…"}      (then the stream closes)
                      : ping                                     (comment every 15 s while waiting)
401 / 400 / 413 JSON  bad secret / invalid body / body over 64 KB
GET /health           { ok: true, model }
```

Server rules in `src/server.mjs`:
- Bind `ASSISTENT_HOST` (default `127.0.0.1`) only. Constant-time secret compare (`crypto.timingSafeEqual`
  on equal-length buffers).
- Body cap 64 KB, JSON parse with zod schema for the request.
- `AbortController` per request: aborted on `req.on('close')` and on `ASSISTENT_TIMEOUT_MS`; passed as
  `signal` to `run()`.
- `setDefaultOpenAIKey(config.openaiKey)`, `setTracingDisabled(true)` unless env opts in (traces would
  send prompts to the OpenAI dashboard).
- Log one line per turn (usuari id, ms, chars) with `console.log`; never log the message text.

Agent loop sketch (`src/server.mjs`, verified against SDK docs):

```js
const result = await run(agent, missatge, { stream: true, previousResponseId: anterior ?? undefined, maxTurns: 3, signal });
for await (const ev of result) {
  if (ev.type === 'raw_model_stream_event' && ev.data.type === 'output_text_delta') escriuEvent(res, 'delta', { text: ev.data.delta });
}
await result.completed;
escriuEvent(res, 'fi', { anterior: result.lastResponseId ?? null });
res.end();
```

## 2. Laravel side

**`config/assistent.php`** (new; header block in the style of `config/informe-ia.php`, `Vegeu docs/modules/assistent_ia.md`):

```php
'enabled'  => (bool) env('ASSISTENT_ENABLED', false),   // tab + route inert until the responsable turns it on
'sidecar'  => [
    'url'     => env('ASSISTENT_SIDECAR_URL', 'http://127.0.0.1:8787'),
    'secret'  => env('ASSISTENT_SIDECAR_SECRET'),
    'timeout' => (int) env('ASSISTENT_TIMEOUT', 180),
],
'max_chars' => 4000,
```

**`app/Services/Assistent/SidecarClient.php`** (new). Constructor takes the config array (same
injection style as `OpenAiResponsesClient`). One public method:

```php
/** @return \Generator<int,string> raw bytes of the sidecar's SSE stream */
public function xat(string $missatge, ?string $anterior, array $usuari): \Generator
```
- `Http::withHeaders(['X-Assistent-Secret' => …, 'Accept' => 'text/event-stream'])
   ->withOptions(['stream' => true])->timeout($timeout)->post($url.'/chat', [...])`.
- Non-200 → log + `RuntimeException` (body message if JSON). Blank secret → `RuntimeException` at
  call time (same as the RAG client's "no key" guard).
- Read loop: `$body = $response->toPsrResponse()->getBody(); while (!$body->eof()) { yield $body->read(8192); }`.

**`app/Http/Controllers/CercaSemantica/AssistentController.php`** (new), method `xat(Request)`:
1. Same inline admin re-check as `InformeController::generar` (403 JSON).
2. `config('assistent.enabled')` false → 503 JSON `__('assistent.desactivat')`.
3. Validate `missatge` (required, string, min 1, max `config('assistent.max_chars')`) and `anterior`
   (sometimes, nullable, string, max 200).
4. Return `response()->stream(fn, 200, ['Content-Type' => 'text/event-stream; charset=utf-8',
   'Cache-Control' => 'no-cache, no-transform', 'X-Accel-Buffering' => 'no'])`.
   Inside the closure: `set_time_limit($timeout + 10)`; `foreach ($client->xat(...) as $chunk) { echo $chunk;
   if (ob_get_level() > 0) ob_flush(); flush(); if (connection_aborted()) break; }`.
   Any `Throwable` inside the closure → `Log::error` and write one `event: error` frame ourselves with
   `__('assistent.error')` so the browser always gets a terminal frame.
   `CompressResponse` already skips `StreamedResponse`, so no middleware change. Sessions are saved by
   `StartSession` before the body streams and the `file` driver takes no lock, so no `session()->save()` needed.

**`routes/web.php`** — inside the existing `cerca-semantica` group (line ~261), after `informe`:

```php
// Assistent IA (sidecar Node): cada torn es una crida de pagament, en streaming.
Route::post('assistent', [AssistentIaController::class, 'xat'])
    ->middleware('throttle:20,1')->name('assistent');
```
Alias import at the top next to `InformeIaController`.

**`app/Providers/RagServiceProvider.php`** — one more singleton, `SidecarClient` ←
`config('assistent.sidecar')`, with a comment mirroring the InformeIa one ("mateix domini, IA sobre
empreses"). No new provider, so `bootstrap/providers.php` stays untouched.

**`.env.example`** — new block under the Informe IA keys: `ASSISTENT_ENABLED=false`,
`ASSISTENT_SIDECAR_URL`, `ASSISTENT_SIDECAR_SECRET`, `ASSISTENT_TIMEOUT`, with a comment pointing to the
sidecar's own `.env.example` (the OpenAI key lives there, not in Laravel).

## 3. Browser — third tab in `resources/views/layouts/includes/cerca_semantica.blade.php`

All new markup and JS wrapped in `@if (config('assistent.enabled'))` so the include is inert when off.

- Markup: tab button `#cs-tab-assistent` in the tablist (line ~218); panel `#cs-mode-assistent` with
  `#cs-conversa-ast`, form `#cs-form-ast`, input `#cs-q-ast` (`maxlength="4000"`), button
  `#cs-enviar-ast`. Same classes (`cs-mode`, `cs-conversa`, `cs-entrada`), no new CSS.
- JS: new section `// Mode assistent` inside the existing IIFE, placed before `// ---- Pestanyes ----`
  (line ~719), so it reuses `TOKEN`, `crea()`, `markdown()`, `.cs-escrivint` dots and bubble classes.
  - `URL_ASSISTENT = route('admin.cerca-semantica.assistent')`, `TXTA` strings via `@json(trans(...))`.
  - `assistent(missatge)`: user bubble; system bubble with dots; `fetch` POST with the same four headers as
    `informe()`; on non-2xx read JSON and show `error`; otherwise `r.body.getReader()` + `TextDecoder`
    and a tiny SSE parser (split on blank line, read `event:`/`data:` lines, ignore `:` comments).
    `delta` → append to a text node inside a `<div class="cs-informe">` (progressive, plain text);
    `fi` → `anteriorAst = dades.anterior`, then clear and re-render the full text with `markdown()`;
    `error` → error bubble. Disable `#cs-enviar-ast` while streaming; `AbortController` cancelled on
    `#cs-neteja` and on panel close.
  - `estatInicialAst()` mirrors `estatInicialInf()`; bind it to `#cs-neteja` like the other two.
  - Tabs: push a third `{boto, panell, focus}` entry into the `tabs` array (line ~720) inside the `@if`.

## 4. Translations — `resources/lang/{ca,es,en}/cerca_semantica.php`

Add `tab_assistent`, `assistent_titol`, `assistent_placeholder`, `assistent_buit`, `assistent_buit_nota`,
`assistent_pensant`, `assistent_error`, `assistent_desactivat` (same prefix style as `informe_*`).
Server-side messages in new `resources/lang/{ca,es,en}/assistent.php`: `error`, `desactivat`.
Also fix the duplicated `'error'` key in `ca/cerca_semantica.php` (lines 16 and 25: the second silently
wins) by renaming the informe one to `informe_error` and updating `TXTI.error` — one-line, same file,
worth doing while we are in there; note it in both module docs.

## 5. Docs and repo housekeeping

- `docs/modules/assistent_ia.md` (new, full AGENTS.md §8 template). Key content: sidecar contract,
  the "no tools in v1" statement, security model (localhost bind + shared secret + admin-only), data
  leaving to OpenAI (messages, and traces if enabled), and **Punts pendents**: server deployment
  (Node runtime + process manager + nginx `proxy_buffering off`/`fastcgi_buffering off` for the
  Laravel route; needs the hosting provider since the jailed SSH cannot run daemons), v2 tools
  (company lookup via `InformeService`, CRM file via `EmpresaChunkRenderer`, `HybridSearchService`),
  prompt editable in DB like `boe_ai_config`, per-turn cost.
- `docs/modules/informe_comercial_ia.md` — Historial line for the `informe_error` key rename.
- `WORKFLOW.md` — module table row «Assistent IA (sidecar Node)».
- Deploy scripts: **not** touched now (local only). The doc lists the files a future
  `deploy-assistent-dev.sh` must carry, in the `deploy-rag-dev.sh` DIRS/FITXERS style.

## Files touched (summary)

New: `sidecar/assistent/**` (≈9 files), `config/assistent.php`, `app/Services/Assistent/SidecarClient.php`,
`app/Http/Controllers/CercaSemantica/AssistentController.php`, `resources/lang/{ca,es,en}/assistent.php`,
`docs/modules/assistent_ia.md`.
Edited: `routes/web.php`, `app/Providers/RagServiceProvider.php`,
`resources/views/layouts/includes/cerca_semantica.blade.php`, `resources/lang/{ca,es,en}/cerca_semantica.php`,
`.env.example`, `WORKFLOW.md`, `docs/modules/informe_comercial_ia.md`.
Not touched: `.env`, `bootstrap/app.php`, `bootstrap/providers.php`, `default.blade.php` (guard already exists),
deploy scripts.

## Verification (local)

1. Sidecar: `cd sidecar/assistent && npm install && cp .env.example .env` (user fills the key + secret),
   `npm test`, `npm run dev`. Then:
   `curl -s localhost:8787/health` → `{"ok":true,...}`;
   `curl -sN -H 'X-Assistent-Secret: …' -H 'Content-Type: application/json' -d '{"missatge":"Hola","anterior":null,"usuari":{"id":1,"nom":"test"}}' localhost:8787/chat`
   → `delta` frames then one `fi` with `anterior`; repeat with that `anterior` → it remembers.
   Without the header → 401. Body > 64 KB → 413.
2. Laravel static checks: `php -l` on each new/edited PHP file;
   `php artisan route:list --name=cerca-semantica` shows the new route with `throttle:20,1`.
3. Laravel runtime (AGENTS.md §6.1 checks first: no server already running). Start
   `PHP_CLI_SERVER_WORKERS=4 php artisan serve --host=127.0.0.1 --port=8000` (workers matter: one worker
   would be held by the open stream). `.env` needs `ASSISTENT_ENABLED=true` and the secret — the
   responsable sets it; the agent does not edit `.env`.
4. Browser (Chrome tools): log in as admin, open the panel, third tab visible; send a message and see
   tokens appear progressively; second message keeps context; `#cs-neteja` resets; non-admin user sees
   no tab and `curl` to the route as non-admin gets 403; missing CSRF → 419.
5. Failure paths: stop the sidecar → error bubble with `assistent.error`, Laravel log line; set
   `ASSISTENT_ENABLED=false` → tab gone, route 503.
6. Before any commit: `gitnexus_detect_changes()` (CLAUDE.md rule) and confirm only the listed files changed.

## Risks and notes

- **Server deployment is the real unknown**: needs Node ≥ 22 on the box, a process manager, and nginx
  buffering off for the Laravel streaming route. Out of scope now, documented as pending.
- PHP-FPM keeps a worker busy per open stream; throttle 20/min and a 180 s timeout bound it.
- `previousResponseId` relies on OpenAI storing responses (`store` default true); acceptable, same as the
  Informe module.
- v1 has no tools, so prompt injection has no blast radius; when v2 adds CRM tools they must stay read-only.
