// How a memory reads back — shared by every surface that shows one, which is
// `bin/mem` and `mcp/mem/server.mjs`.
//
// This file exists because the skills document these renderings as a contract.
// recall/SKILL.md teaches how to read a hit ("0.84 is cosine similarity, then
// kind, scope, and age of the last update") and quotes the empty answer verbatim
// so it is recognised as a real answer rather than a failure. If the CLI and the
// MCP tools each owned a copy, one would drift, and the documented way to spot a
// stale memory would quietly depend on which surface you happened to ask.
//
// What stays with each surface is what genuinely differs: the CLI owns flag
// parsing, stdout and exit codes; the server owns JSON Schema and MCP framing.
// Everything between "here is a row" and "here is the text a reader sees" is
// here, rendered identically for both.

import { DAY_MS } from './decay.mjs';

// ------------------------------------------------------------- primitives --

/** "3d", "2mo" — enough to judge staleness without printing a timestamp. */
export function age(ms, now) {
  if (!ms) return '?';
  const days = Math.max(0, (now - ms) / DAY_MS);
  if (days < 1) return 'today';
  if (days < 60) return `${Math.round(days)}d`;
  return `${Math.round(days / 30)}mo`;
}

/** An absolute date, for the fields where "when exactly" is the question. */
export const day = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : 'never');

export const clip = (text, max = 84) => (text.length <= max ? text : `${text.slice(0, max - 1)}…`);

/** Pad every column to its widest cell; the last column runs free. */
export function table(rows) {
  const widths = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] ?? 0, String(cell).length);
    });
  }
  return rows.map((row) =>
    row
      .map((cell, i) => (i === row.length - 1 ? String(cell) : String(cell).padEnd(widths[i])))
      .join('  ')
      .trimEnd(),
  );
}

const fmtNum = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

export function describeChanges(changes) {
  if (changes.length === 0) return 'nothing changed';
  return changes
    .map((c) => (typeof c.to === 'number' ? `${c.field} ${fmtNum(c.from)} → ${fmtNum(c.to)}` : c.field))
    .join(', ');
}

export function describeScope(row, scopeSource) {
  return row.scope === 'global' ? 'global' : `project ${row.project_key} (${scopeSource})`;
}

// -------------------------------------------------------------------- add --

export function renderAdd({ row, action, changes, similarity, nearest, scopeSource }) {
  const lines =
    action === 'merged'
      ? [
          `Merged into #${row.id} · ${similarity.toFixed(3)} similar · ${describeScope(row, scopeSource)}`,
          `  ${row.text}`,
          `  ${describeChanges(changes)}`,
        ]
      : [
          `Added #${row.id} · ${row.kind} · ${row.status} · ${describeScope(row, scopeSource)}`,
          `  ${row.text}`,
          ...(nearest ? [`  nearest existing: #${nearest.id} at ${similarity.toFixed(3)} (kept separate)`] : []),
        ];
  return lines.join('\n');
}

// ----------------------------------------------------------------- search --

export function describeResult(r, now, explain) {
  const where = r.scope === 'global' ? 'global' : `project ${r.project_key}`;
  const sim = r.similarity === null ? ' lex ' : r.similarity.toFixed(2);
  const lines = [
    `  #${r.id}  ${sim}  ${r.kind}  ${where}  ${age(r.updated_at, now)}${r.pinned ? '  pinned' : ''}`,
    `      ${r.text}`,
  ];
  if (r.why) lines.push(`      why: ${r.why}`);
  if (explain) {
    const ranks = Object.entries(r.ranks).map(([leg, n]) => `${leg} #${n}`).join(', ') || 'none';
    lines.push(
      `      rrf ${r.rrf.toFixed(4)} (${ranks}) · strength ${r.strength.toFixed(2)}` +
        ` · boost ${r.boost.toFixed(2)} · score ${r.score.toFixed(4)}` +
        (r.terms.length ? ` · terms ${r.terms.join('/')} (${r.coverage.toFixed(2)})` : ''),
    );
  }
  return lines.join('\n');
}

/**
 * Nothing found is rendered here rather than at the call site, because it is not
 * an error path: on an unrelated query it is the only correct answer, and it
 * reports what the gate did so the reader can tell "nothing stored" from
 * "something was stored but judged too weak to be worth trusting".
 */
export function renderSearch({ query, results, stats }, { now = Date.now(), explain = false } = {}) {
  if (results.length === 0) {
    return (
      `Nothing relevant to "${query}" — searched ${stats.candidates}, ` +
      `${stats.gated} of ${stats.fused} candidates fell below the gate.`
    );
  }
  return [
    `${results.length} ${results.length === 1 ? 'memory' : 'memories'} for "${query}"` +
      `  ·  searched ${stats.candidates}`,
    '',
    ...results.map((r) => describeResult(r, now, explain)),
  ].join('\n');
}

// ------------------------------------------------------------------- list --

/** What retrieval would have done with this row but the store still holds. */
export function rowFlags(row) {
  const marks = [];
  if (row.pinned) marks.push('pinned');
  if (row.expired) marks.push('expired');
  if (!row.embedded) marks.push('no-emb');
  return marks.join(',');
}

export function renderList({ rows, total, scope }, { now = Date.now() } = {}) {
  if (rows.length === 0) {
    return total === 0 ? 'Nothing stored here yet.' : 'No memories match those filters.';
  }
  const showKey = scope === 'all';
  return [
    ...table([
      ['id', 'status', 'kind', showKey ? 'project' : 'scope', 'str', 'age', 'flags', 'text'],
      ...rows.map((r) => [
        `#${r.id}`,
        r.status,
        r.kind,
        r.scope === 'global' ? 'global' : (showKey ? r.project_key : 'project'),
        r.strength.toFixed(2),
        age(r.updated_at, now),
        rowFlags(r),
        clip(r.text),
      ]),
    ]),
    '',
    rows.length < total
      ? `${rows.length} of ${total} — use --limit, --offset or 'mem export' for the lot.`
      : `${total} ${total === 1 ? 'memory' : 'memories'}.`,
  ].join('\n');
}

// ------------------------------------------------------------------- show --

export function describeEvent(event) {
  const detail = event.detail ?? {};
  const parts = [];
  if (detail.similarity !== undefined) parts.push(`similarity ${Number(detail.similarity).toFixed(3)}`);
  if (Array.isArray(detail.changes) && detail.changes.length > 0) {
    parts.push(detail.changes.map((c) => c.field).join(', '));
  }
  if (detail.previous?.status) parts.push(`was ${detail.previous.status}`);
  if (detail.via) parts.push(detail.via);
  if (detail.reason) parts.push(String(detail.reason));
  return parts.join(' · ');
}

export function renderMemory({ memory: m, events }, now) {
  const lines = [
    `#${m.id}  ${m.uid}`,
    `  ${m.text}`,
    ...(m.why ? [`  why: ${m.why}`] : []),
    '',
    ...table([
      ['  status', `${m.status}${m.pinned ? ', pinned' : ''}${m.expired ? ', expired' : ''}`],
      ['  kind', m.kind],
      ['  scope', m.scope === 'global' ? 'global' : `project ${m.project_key}`],
      ['  strength', `${m.strength.toFixed(3)}  (salience ${m.salience.toFixed(2)} × retention ${m.retention.toFixed(3)} × confidence ${m.confidence.toFixed(2)})`],
      ['  created', `${day(m.created_at)}  (${age(m.created_at, now)})`],
      ['  updated', `${day(m.updated_at)}  (${age(m.updated_at, now)})`],
      ['  expires', m.expires_at ? day(m.expires_at) : 'never'],
      ['  injected', `${m.injected_count}${m.last_injected_at ? `, last ${age(m.last_injected_at, now)} ago` : ''}`],
      ['  useful', `${m.useful_count}${m.last_used_at ? `, last ${age(m.last_used_at, now)} ago` : ''}`],
      ['  source', `${m.source_kind ?? '—'}${m.source_session ? ` / ${m.source_session}` : ''}`],
      ['  embedding', m.embedded ? `${m.emb_model} ${m.emb_dim}d` : 'none (tombstoned — lexical recall only)'],
      ...(m.superseded_by ? [['  superseded by', `#${m.superseded_by}`]] : []),
    ]),
  ];

  if (events.length > 0) {
    lines.push(
      '',
      '  history',
      ...table(events.map((e) => [`    ${day(e.at)}`, e.event, describeEvent(e)])),
    );
  }
  return lines.join('\n');
}

export function renderShow(entries, { now = Date.now() } = {}) {
  return entries.map((entry) => renderMemory(entry, now)).join('\n\n');
}

// ------------------------------------------------------------- forget/pin --

export function renderForget(results) {
  return results
    .map((r) => {
      if (r.action === 'purged') {
        return `Purged #${r.id} (${r.uid}) and ${r.eventsDeleted} events. This cannot be undone.\n  ${clip(r.text)}`;
      }
      if (r.action === 'restored') {
        return `Restored #${r.id} to ${r.to}.\n  ${clip(r.text)}`;
      }
      return `Archived #${r.id} — out of retrieval, restore with 'mem forget ${r.id} --restore'.\n  ${clip(r.text)}`;
    })
    .join('\n');
}

export function renderPin(results, on) {
  return results
    .map((r) => {
      const what = r.changed
        ? on
          ? `Pinned #${r.id} — it will never decay or be pruned.`
          : `Unpinned #${r.id} — it decays again.`
        : `#${r.id} was already ${on ? 'pinned' : 'unpinned'}.`;
      return `${what}\n  ${clip(r.text)}`;
    })
    .join('\n');
}

export function renderTouch(results) {
  return results
    .map(
      (r) =>
        `Counted #${r.id} as useful ${r.useful_count}×  ·  halflife ` +
        `${r.was.halflife_days.toFixed(0)}d → ${r.halflife_days.toFixed(0)}d, decay clock reset.\n` +
        `  ${clip(r.text)}`,
    )
    .join('\n');
}

// ----------------------------------------------------------------- review --

/**
 * The active memory this capture sits next to — and whether promoting would fold
 * it in (`merge`) or leave two memories that sound alike (`near`). The second one
 * is the reviewer's call and nothing else in the plugin will make it for them.
 */
export function describeDuplicate(item) {
  if (!item.duplicate) return '';
  const { id, similarity, merges } = item.duplicate;
  return `#${id} ${similarity.toFixed(2)} ${merges ? 'merge' : 'near'}`;
}

export const REVIEW_HINTS = [
  "  mem review promote <ref…>            accept — a duplicate merges into what it restates",
  '  mem review edit <ref> --text "…"     fix the wording, add --promote to accept it too',
  '  mem review discard <ref…>            reject — archived, restorable with mem forget --restore',
];

export function renderQueue({ items, total }, { now = Date.now(), hints = REVIEW_HINTS } = {}) {
  if (items.length === 0) {
    return total === 0
      ? 'Nothing to review. Auto-captured memories land here before they can be recalled.'
      : 'No queue items match those filters.';
  }

  const dupes = items.filter((i) => i.duplicate?.merges).length;
  const nears = items.filter((i) => i.duplicate && !i.duplicate.merges).length;
  return [
    ...table([
      ['ref', 'type', 'age', 'kind', 'scope', 'similar', 'text'],
      ...items.map((i) => [
        `#${i.ref}`,
        i.type,
        age(i.when, now),
        i.memory.kind,
        i.memory.scope === 'global' ? 'global' : i.memory.project_key,
        describeDuplicate(i),
        clip(i.summary, 60),
      ]),
    ]),
    '',
    items.length < total
      ? `${items.length} of ${total} awaiting review — use --limit or --offset for the rest.`
      : `${total} awaiting review.` +
        (dupes
          ? `  ${dupes} restate${dupes === 1 ? 's' : ''} a memory you already have and would merge into it.`
          : '') +
        (nears ? `  ${nears} sit${nears === 1 ? 's' : ''} close to one without merging — your call.` : ''),
    '',
    ...hints,
  ].join('\n');
}

/**
 * A consolidation proposal, once it has been accepted or refused. Its own branch
 * because the subject is a *pair*: "promoted #12" would name one of two memories
 * and say nothing about what happened to the other.
 */
export function describeProposalResult(r) {
  if (r.action === 'declined') {
    return (
      `Declined ${r.ref} — neither memory changed, and the pair will not be judged again` +
      ' unless one of them is restated.'
    );
  }
  if (r.action === 'merge') {
    return `Merged #${r.loser} into #${r.survivor}.\n  ${clip(r.text)}\n  ${describeChanges(r.changes)}`;
  }
  if (r.action === 'supersede') {
    return (
      `Retired #${r.loser} — superseded by #${r.survivor}, restorable with ` +
      `'mem forget ${r.loser} --restore'.\n  ${clip(r.text)}`
    );
  }
  if (r.action === 'refine') {
    return (
      `Linked #${r.specific} as a refinement of #${r.general}` +
      `${r.changes.length ? `, and demoted #${r.general}: ${describeChanges(r.changes)}` : ''}.`
    );
  }
  return `Linked ${r.ref.replace(/^proposal:/, '#').replace(':', ' and #')} as related.`;
}

/** How a completed verb reads back. Shared so --json and the text agree. */
export function describeReviewResult(r) {
  if (r.type === 'consolidation-pair') return describeProposalResult(r);
  if (r.action === 'merged') {
    return [
      `Promoted #${r.id} into #${r.into.id} — ${r.similarity.toFixed(3)} similar, so it merged` +
        ' rather than adding a second copy.',
      `  ${clip(r.into.text)}`,
      `  ${describeChanges(r.changes)}`,
    ].join('\n');
  }
  if (r.action === 'promoted') {
    return `Promoted #${r.id} — active, and recallable from now on.\n  ${clip(r.text)}`;
  }
  if (r.action === 'archived') {
    return `Discarded #${r.id} — archived, restore with 'mem forget ${r.id} --restore'.\n  ${clip(r.text)}`;
  }
  return `Edited #${r.id} — ${describeChanges(r.changes)}.\n  ${clip(r.text)}`;
}

export function renderReviewResults(results) {
  return results.map(describeReviewResult).join('\n');
}
