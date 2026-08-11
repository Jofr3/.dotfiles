// Reading a session transcript, incrementally.
//
// Claude Code appends one JSON object per line to
// ~/.claude/projects/<slug>/<session-id>.jsonl while a session runs. The Stop
// hook is called after every turn, so re-parsing the whole file each time would
// make the cost of observing a session quadratic in its length — and these files
// reach tens of megabytes. Everything here exists to read only the bytes that
// appeared since the last look.
//
// The transcript is an append-only log in practice but not by contract, so
// `readTail` treats a file that shrank as a new file and starts over. That is
// the only recovery it attempts: a corrupt or half-written line is skipped, and
// a trailing partial line is left unconsumed until the newline arrives.
//
// The shapes below were read off real transcripts (Claude Code 2.x), and the
// ones that matter are:
//
//   {type:"user", promptSource:"typed", origin:{kind:"human"},
//    message:{content:"<what the user typed>"}}
//   {type:"assistant", message:{content:[{type:"tool_use", id, name, input}]}}
//   {type:"user", toolUseResult:…,
//    message:{content:[{type:"tool_result", tool_use_id, content, is_error}]}}
//   {type:"system", subtype:"turn_duration", durationMs}
//
// `isSidechain:true` marks subagent traffic, and `isMeta:true` marks the
// harness's own injections (a slash command's body, for one). Both are dropped —
// a subagent's failed command is not friction the user can fix in their config,
// and a meta message is not something anybody typed.

import { openSync, closeSync, fstatSync, readSync } from 'node:fs';

/** Never hand more than this to the parser in one pass. A session that grew by
 *  more than 8MB between two Stop hooks is a bulk write, not a turn; reading its
 *  tail is still correct, and the cap keeps the hook's memory bounded. */
const MAX_CHUNK = 8 * 1024 * 1024;

/**
 * Read whatever was appended to `file` after byte `offset`.
 *
 * Returns the parsed entries and the offset to pass in next time — always the
 * position just past the last complete line, so no line is ever seen twice and
 * none is seen half-written.
 */
export function readTail(file, offset = 0) {
  let fd;
  try {
    fd = openSync(file, 'r');
  } catch {
    return { entries: [], offset, missing: true };
  }
  try {
    const size = fstatSync(fd).size;

    // Shrank: not the file we were reading. Start again rather than slice at a
    // byte position that now means something else.
    let from = offset > size ? 0 : offset;
    if (size - from > MAX_CHUNK) from = size - MAX_CHUNK;
    if (size === from) return { entries: [], offset: size };

    const buf = Buffer.allocUnsafe(size - from);
    const read = readSync(fd, buf, 0, buf.length, from);
    const text = buf.toString('utf8', 0, read);

    // Only whole lines. Anything after the last newline is a line still being
    // written, and belongs to the next call.
    const cut = text.lastIndexOf('\n');
    if (cut === -1) return { entries: [], offset: from };

    const entries = [];
    for (const line of text.slice(0, cut).split('\n')) {
      if (line === '') continue;
      try {
        entries.push(JSON.parse(line));
      } catch {
        // A line we cannot parse is a line we cannot learn from. Skipping it
        // costs one observation; failing here would cost the whole session.
      }
    }
    return { entries, offset: from + Buffer.byteLength(text.slice(0, cut + 1)) };
  } catch {
    return { entries: [], offset };
  } finally {
    try {
      closeSync(fd);
    } catch {}
  }
}

/**
 * Flatten transcript entries into the four things the detectors care about:
 * what the user said, what was called, what came back, and how long the turn
 * took. Subagent and harness-generated entries are dropped here so no detector
 * has to remember to check.
 */
export function events(entries) {
  const out = [];
  for (const e of entries) {
    if (e?.isSidechain === true || e?.isMeta === true) continue;

    if (e.type === 'user') {
      const c = e.message?.content;
      if (typeof c === 'string') {
        // Only what a human typed. Task notifications and hook output arrive on
        // this same event with a different origin, and mistaking one for a
        // complaint is the fastest way to invent friction that never happened.
        if (e.origin?.kind === 'human' || e.promptSource === 'typed') {
          out.push({ kind: 'prompt', text: c, ts: e.timestamp });
        }
        continue;
      }
      if (Array.isArray(c)) {
        for (const part of c) {
          if (part?.type !== 'tool_result') continue;
          out.push({
            kind: 'result',
            id: part.tool_use_id,
            isError: part.is_error === true,
            text: resultText(part, e.toolUseResult),
            ts: e.timestamp,
          });
        }
      }
      if (Array.isArray(e.hookErrors) && e.hookErrors.length > 0) {
        out.push({ kind: 'hook-error', detail: e.hookErrors, ts: e.timestamp });
      }
      continue;
    }

    if (e.type === 'assistant') {
      const c = e.message?.content;
      if (!Array.isArray(c)) continue;
      for (const part of c) {
        if (part?.type === 'tool_use') {
          out.push({ kind: 'tool', id: part.id, name: part.name, input: part.input ?? {}, ts: e.timestamp });
        }
      }
      continue;
    }

    if (e.type === 'system') {
      if (e.subtype === 'turn_duration') out.push({ kind: 'turn', ms: e.durationMs ?? 0, ts: e.timestamp });
      if (Array.isArray(e.hookErrors) && e.hookErrors.length > 0) {
        out.push({ kind: 'hook-error', detail: e.hookErrors, ts: e.timestamp });
      }
    }
  }
  return out;
}

/**
 * The text of a tool result, from whichever field carried it. `toolUseResult` is
 * the richer record (Bash splits stdout from stderr there) but its shape varies
 * per tool, so the `content` block is the fallback that always exists.
 */
function resultText(part, toolUseResult) {
  const bits = [];
  if (typeof toolUseResult === 'string') bits.push(toolUseResult);
  else if (toolUseResult && typeof toolUseResult === 'object') {
    for (const k of ['stderr', 'stdout', 'error', 'message']) {
      if (typeof toolUseResult[k] === 'string' && toolUseResult[k] !== '') bits.push(toolUseResult[k]);
    }
  }
  if (bits.length === 0) {
    const c = part.content;
    if (typeof c === 'string') bits.push(c);
    else if (Array.isArray(c)) {
      for (const b of c) if (typeof b?.text === 'string') bits.push(b.text);
    }
  }
  // Results can be megabytes. Nothing downstream reads past the first few lines.
  return bits.join('\n').slice(0, 4000);
}

/** The directory name Claude Code gives a project: its path, non-alphanumerics
 *  flattened to dashes. `/home/u/.dotfiles` → `-home-u--dotfiles`. */
export function projectSlug(cwd) {
  return String(cwd).replace(/[^A-Za-z0-9]/g, '-');
}
