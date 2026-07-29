// Secret scrubbing — PLAN's countermeasure #6: "reject writes matching
// key/token patterns rather than storing them".
//
// Reject, not redact. A memory store is a file that gets exported, grepped and
// injected into prompts; a credential that reaches it has already leaked into
// somewhere it should never have been, and silently rewriting the text would
// hide that from the person who can still rotate the key. So the write fails
// loudly and the text is never written.
//
// Two failure modes, weighed deliberately:
//   - a missed secret is stored forever;
//   - a false positive costs one rephrase and prints a reason.
// So the patterns lean strict, with narrow, documented exemptions where prose
// genuinely collides (git SHAs, placeholder values in examples) and one escape
// hatch, MEM_ALLOW_SECRETS=1, for the case the rules get wrong.

/** Text either side of a match used to judge context-sensitive rules. */
const CONTEXT_CHARS = 60;

/**
 * Words that make a bare 40- or 64-character hex string a content hash rather
 * than a credential. Deliberately requires the *exact* length of a git SHA-1 or
 * a SHA-256 digest — an arbitrary-length hex blob near the word "hash" is still
 * rejected.
 */
const HASH_CONTEXT =
  /\b(?:commit|commits|committed|sha|sha1|sha-1|sha256|sha-256|sha512|hash|hashes|digest|checksum|revision|rev|blob|oid|tree|md5|nix|derivation|integrity)\b/i;

/**
 * Values that look like a credential assignment but are obviously a stand-in:
 * `password=<yours>`, `token=$GITHUB_TOKEN`, `secret=***`. Memories about *how*
 * to configure something are exactly the kind of fact worth keeping.
 */
const PLACEHOLDER_VALUE =
  /^(?:[*x•.]{2,}|<[^>]*>|\{\{[^}]*\}\}|\$\{?[A-Za-z_]\w*\}?|%\w+%|(?:redacted|hidden|secret|placeholder|changeme|change_me|todo|none|null|empty|your[_-]?\w*|the[_-]?\w*|xxx+)|"{2}|'{2})$/i;

const around = (text, match) =>
  text.slice(Math.max(0, match.index - CONTEXT_CHARS), match.index + match[0].length + CONTEXT_CHARS);

/** Strip one layer of surrounding quotes and trailing punctuation from a value. */
function bareValue(value) {
  const unquoted = /^(["'`])(.*)\1$/.exec(value);
  return (unquoted ? unquoted[2] : value).replace(/[.,;)\]}]+$/, '');
}

/**
 * The rules. Each is a global regex plus an optional `accept(match, text)`
 * predicate for the context-sensitive ones. `opaque` marks a match that is
 * secret material end to end, so not even its first characters are echoed back;
 * the prefixed rules ('sk-', 'ghp_', 'password=') reveal a few characters
 * because the prefix is what makes the error actionable.
 */
export const RULES = [
  {
    id: 'openai-key',
    label: 'API key (sk-…)',
    re: /\bsk-[A-Za-z0-9_-]{16,}/g,
  },
  {
    id: 'stripe-key',
    label: 'Stripe key',
    re: /\b[srp]k_(?:live|test)_[A-Za-z0-9]{10,}/g,
  },
  {
    id: 'github-token',
    label: 'GitHub token',
    re: /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  },
  {
    id: 'aws-key-id',
    label: 'AWS access key id',
    re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  },
  {
    id: 'slack-token',
    label: 'Slack token',
    re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g,
  },
  {
    id: 'google-key',
    label: 'Google API key',
    re: /\bAIza[0-9A-Za-z_-]{35}\b/g,
  },
  {
    id: 'npm-token',
    label: 'npm token',
    re: /\bnpm_[A-Za-z0-9]{36}\b/g,
  },
  {
    id: 'pem-block',
    label: 'PEM block',
    re: /-----BEGIN[ A-Z0-9]*-----/g,
  },
  {
    id: 'jwt',
    label: 'JWT',
    // The signature segment is empty for alg=none, hence the optional tail.
    re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]*)?/g,
  },
  {
    id: 'bearer',
    label: 'bearer token',
    re: /\bbearer\s+[A-Za-z0-9._~+/-]{16,}=*/gi,
  },
  {
    id: 'credential-assignment',
    label: 'credential assignment',
    // No leading \b: the keyword is usually the tail of a variable name
    // (OPENAI_API_KEY=, GITHUB_TOKEN=, db_password:), and requiring a word
    // boundary there would miss every one of them.
    // The value alternatives before \S+ keep a bracketed or quoted value whole,
    // so `<your key>` is seen as the placeholder it is rather than as `<your`.
    re: /(?:pass(?:word|wd)?|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|token)\s*[:=]\s*(<[^>\n]*>|"[^"\n]*"|'[^'\n]*'|\S+)/gi,
    accept(match) {
      const value = bareValue(match[1]);
      return value.length >= 4 && !PLACEHOLDER_VALUE.test(value);
    },
  },
  {
    id: 'long-hex',
    label: 'long hex string',
    re: /\b[0-9a-fA-F]{32,}\b/g,
    opaque: true,
    accept(match, text) {
      const isDigestLength = match[0].length === 40 || match[0].length === 64;
      return !(isDigestLength && HASH_CONTEXT.test(around(text, match)));
    },
  },
  {
    id: 'long-base64',
    label: 'long base64 blob',
    re: /\b[A-Za-z0-9+/]{40,}={0,2}/g,
    opaque: true,
    // Prose and identifiers do not run 40 characters with all three character
    // classes; encoded key material almost always does. The slash cap is what
    // keeps a long CamelCase file path from reading as a blob — base64 averages
    // well under one '/' per 40 characters, a deep path has several.
    accept(match) {
      const s = match[0];
      if ((s.match(/\//g) ?? []).length > 2) return false;
      return /[a-z]/.test(s) && /[A-Z]/.test(s) && /[0-9]/.test(s);
    },
  },
];

/** Show enough to identify the match, never enough to be the secret. */
function sample(text, opaque) {
  const reveal = opaque ? 0 : Math.min(4, text.length);
  return `${text.slice(0, reveal)}…${text.length} chars`;
}

/**
 * Every secret-looking span in `text`, earliest first. Overlapping matches keep
 * the first rule that claimed the span, so a mixed-case hex blob is reported
 * once rather than as both hex and base64.
 */
export function findSecrets(text) {
  if (typeof text !== 'string' || text === '') return [];

  const hits = [];
  for (const rule of RULES) {
    for (const match of text.matchAll(rule.re)) {
      if (rule.accept && !rule.accept(match, text)) continue;
      hits.push({
        id: rule.id,
        label: rule.label,
        index: match.index,
        length: match[0].length,
        sample: sample(match[0], rule.opaque),
      });
    }
  }

  hits.sort((a, b) => a.index - b.index || b.length - a.length);

  const kept = [];
  let end = -1;
  for (const hit of hits) {
    if (hit.index < end) continue;
    kept.push(hit);
    end = hit.index + hit.length;
  }
  return kept;
}

/** True when nothing in `text` looks like a credential. */
export function isClean(text) {
  return findSecrets(text).length === 0;
}

/**
 * Scan several named fields at once — `{ text, why }` on the write path — so the
 * error can name the one that has to be rewritten. Undefined and null fields
 * are skipped, not stringified.
 */
export function scanFields(fields) {
  const found = [];
  for (const [field, value] of Object.entries(fields)) {
    if (typeof value !== 'string') continue;
    found.push(...findSecrets(value).map((hit) => ({ field, ...hit })));
  }
  return found;
}

export class SecretError extends Error {
  constructor(message, findings) {
    super(message);
    this.name = 'SecretError';
    this.code = 'MEM_SECRET_DETECTED';
    this.findings = findings;
  }
}

function describe(findings) {
  const shown = findings
    .slice(0, 3)
    .map((f) => `${f.field ? `${f.field}: ` : ''}${f.label} (${f.sample}) at offset ${f.index}`);
  const rest = findings.length - shown.length;
  return shown.join('; ') + (rest > 0 ? `; and ${rest} more` : '');
}

/**
 * Throw unless every field is clean. This is the write path's gate — call it
 * before embedding, so a rejected write costs nothing and the secret never
 * reaches a vector either.
 *
 * MEM_ALLOW_SECRETS=1 skips the check. It exists because a rule will eventually
 * be wrong about something a person genuinely wants to store, and the
 * alternative to an escape hatch is a memory system that cannot record the
 * fact at all.
 */
export function assertNoSecrets(fields, { env = process.env } = {}) {
  const named = typeof fields === 'string' ? { text: fields } : fields;
  if (env.MEM_ALLOW_SECRETS === '1') return [];

  const findings = scanFields(named);
  if (findings.length === 0) return findings;

  throw new SecretError(
    `Refusing to store: this looks like it contains a credential — ${describe(findings)}. ` +
      'Rewrite it without the secret (say where the key lives, not what it is), ' +
      'or set MEM_ALLOW_SECRETS=1 if this is a false positive.',
    findings,
  );
}
