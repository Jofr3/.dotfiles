// Secret scrubbing. Every "secret" below is fabricated — the shapes are real,
// the values are not.
//
// The negative cases matter as much as the positive ones: a scrubber that
// rejects ordinary sentences about credentials ("the key lives in sops") makes
// the memory system unusable for exactly the facts worth remembering.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  RULES,
  SecretError,
  assertNoSecrets,
  findSecrets,
  isClean,
  scanFields,
} from '../../src/scrub.mjs';

const FAKE = {
  'openai-key': 'sk-proj-Ab12Cd34Ef56Gh78Ij90Kl12Mn34',
  // Assembled at runtime, not written literally: GitHub's push protection
  // scans raw source and can't tell a fabricated Stripe/Slack shape from a
  // real leak, so the joined-fragment form keeps pushes unblocked.
  'stripe-key': ['sk', 'live', '51H8xQ2eZvKYlo2C0abcd1234'].join('_'),
  'github-token': 'ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8',
  'aws-key-id': 'AKIAIOSFODNN7EXAMPLE',
  'slack-token': ['xoxb', '123456789012', '987654321098', 'Ab1Cd2Ef3Gh4Ij5Kl6Mn7Op8'].join('-'),
  'google-key': 'AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q',
  'npm-token': 'npm_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8',
  'pem-block': '-----BEGIN RSA PRIVATE KEY-----',
  jwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
  bearer: 'Bearer aGVsbG93b3JsZGFiY2RlZmdoaWprbG1ub3A',
  'credential-assignment': 'password=hunter2trombone',
  'long-hex': 'a3f5c9e1b7d2408695fc3ae4d1b8027f6c9a5e3d1f7b2049',
  'long-base64': 'QUJDZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY3ODkw',
};

describe('rule coverage', () => {
  it('has a fake sample for every rule, and every rule fires on it', () => {
    assert.deepEqual(
      RULES.map((r) => r.id).sort(),
      Object.keys(FAKE).sort(),
      'a rule without a test sample is a rule nobody has checked',
    );
    for (const [id, secret] of Object.entries(FAKE)) {
      const found = findSecrets(`remember this: ${secret} — do not lose it`);
      assert.equal(found.length, 1, `${id}: expected exactly one finding, got ${found.length}`);
      assert.equal(found[0].id, id);
    }
  });

  // PLAN names these explicitly as the shapes that must be rejected.
  it('rejects the shapes PLAN lists', () => {
    for (const secret of Object.values(FAKE)) {
      assert.equal(isClean(secret), false, `should have been rejected: ${secret.slice(0, 12)}…`);
    }
  });

  it('catches a credential hiding in an env-var assignment', () => {
    for (const line of [
      'OPENAI_API_KEY=Ab12Cd34Ef56',
      'GITHUB_TOKEN: gh0stwriter1234',
      'db_password = "s3cr3tPassphrase"',
      'CLIENT_SECRET=zxcvbnm12345',
    ]) {
      assert.equal(isClean(line), false, `should have been rejected: ${line}`);
    }
  });
});

describe('ordinary memories survive', () => {
  const clean = [
    'always use pnpm, never npm or yarn',
    'the Anthropic API key lives in sops-nix, not in .env',
    'set OPENAI_API_KEY=<your key> in .envrc before running the tests',
    'export GITHUB_TOKEN=$GH_PAT — the value comes from the password manager',
    'password=***',
    'the token is stored in 1Password under "prod / anthropic"',
    'prefer ssh remotes: git@github.com:me/dotfiles.git',
    'deploy with nix, not docker; the flake lives at /home/jofre/.dotfiles',
    'the config path is /home/jofre/Projects/Claude/Skills/Memory/src/index',
    'run mem doctor when the hook feels slow',
    'sk-' /* a bare prefix is not a key */,
    'AKIA is the prefix AWS uses for access key ids',
  ];

  for (const text of clean) {
    it(`accepts: ${text.slice(0, 48)}`, () => {
      assert.deepEqual(findSecrets(text), [], `false positive on: ${text}`);
    });
  }

  // Git SHAs and content digests are legitimate things to remember, and they
  // are indistinguishable from a hex secret without the surrounding words.
  it('allows a digest-length hex string in hash context, and only there', () => {
    const sha = 'a94a8fe5ccb19ba61c4c0873d391e987982fbbd3';
    assert.ok(isClean(`the regression landed in commit ${sha}`));
    assert.ok(isClean(`sha256 checksum ${'b'.repeat(64)} for the tarball`));
    assert.equal(isClean(`the value is ${sha}`), false, 'no hash context — still a secret');
    // The exemption is length-pinned: an arbitrary-length blob near "hash" stays rejected.
    assert.equal(isClean(`the hash is ${'c'.repeat(48)}`), false);
  });

  it('treats obvious placeholder values as documentation, not credentials', () => {
    for (const text of [
      'password=<yours>',
      'token: ${GITHUB_TOKEN}',
      'api_key = xxxxx',
      'secret: changeme',
      'auth_token=""',
      'password=…',
    ]) {
      assert.ok(isClean(text), `false positive on placeholder: ${text}`);
    }
  });
});

describe('findings', () => {
  it('reports position and a masked sample, never the secret itself', () => {
    const secret = FAKE['openai-key'];
    const [finding] = findSecrets(`the key is ${secret}`);
    assert.equal(finding.index, 11);
    assert.equal(finding.length, secret.length);
    assert.ok(!finding.sample.includes(secret));
    assert.ok(finding.sample.startsWith('sk-p'), `expected an identifying prefix: ${finding.sample}`);
    assert.match(finding.sample, new RegExp(`${secret.length} chars`));
  });

  it('reveals nothing at all for opaque blobs', () => {
    const [finding] = findSecrets(`the value is ${FAKE['long-hex']}`);
    assert.equal(finding.sample, `…${FAKE['long-hex'].length} chars`);
  });

  it('reports one finding per span, not one per overlapping rule', () => {
    // The JWT is also a run of base64 characters; it must be reported once.
    const found = findSecrets(`auth header: ${FAKE.jwt}`);
    assert.equal(found.length, 1);
    assert.equal(found[0].id, 'jwt');
  });

  it('finds every secret in a multi-secret string, in order', () => {
    const found = findSecrets(`${FAKE['github-token']} and ${FAKE['aws-key-id']}`);
    assert.deepEqual(found.map((f) => f.id), ['github-token', 'aws-key-id']);
    assert.ok(found[0].index < found[1].index);
  });

  it('is stateless across calls', () => {
    // Global regexes carry lastIndex; sharing one across calls would make the
    // second write of the same secret pass.
    const text = `key ${FAKE['github-token']}`;
    assert.deepEqual(findSecrets(text), findSecrets(text));
    assert.equal(findSecrets(text).length, 1);
  });

  it('handles empty and non-string input', () => {
    for (const value of ['', null, undefined, 42, {}]) assert.deepEqual(findSecrets(value), []);
  });
});

describe('scanFields', () => {
  it('names the field the secret is in', () => {
    const found = scanFields({ text: 'use pnpm', why: `told me on ${FAKE['slack-token']}` });
    assert.equal(found.length, 1);
    assert.equal(found[0].field, 'why');
  });

  it('skips fields that are not strings', () => {
    assert.deepEqual(scanFields({ text: 'fine', why: null, salience: 0.5 }), []);
  });
});

describe('assertNoSecrets', () => {
  it('passes clean writes through', () => {
    assert.deepEqual(assertNoSecrets({ text: 'always use pnpm', why: 'stated 2026-07-29' }), []);
    assert.deepEqual(assertNoSecrets('always use pnpm'), []);
  });

  it('rejects rather than storing, and says why', () => {
    let error;
    try {
      assertNoSecrets({ text: `the key is ${FAKE['openai-key']}` });
    } catch (err) {
      error = err;
    }
    assert.ok(error instanceof SecretError);
    assert.equal(error.code, 'MEM_SECRET_DETECTED');
    assert.equal(error.findings.length, 1);
    assert.equal(error.findings[0].field, 'text');
    assert.match(error.message, /Refusing to store/);
    assert.match(error.message, /API key/);
    assert.ok(!error.message.includes(FAKE['openai-key']), 'the error must not repeat the secret');
  });

  it('summarises at most three findings', () => {
    const many = Object.values(FAKE).join(' ');
    try {
      assertNoSecrets({ text: many });
      assert.fail('expected a rejection');
    } catch (err) {
      assert.ok(err.findings.length > 3);
      assert.match(err.message, /and \d+ more/);
    }
  });

  it('honours MEM_ALLOW_SECRETS=1 as the documented escape hatch', () => {
    const text = `the key is ${FAKE['openai-key']}`;
    assert.deepEqual(assertNoSecrets({ text }, { env: { MEM_ALLOW_SECRETS: '1' } }), []);
    assert.throws(() => assertNoSecrets({ text }, { env: { MEM_ALLOW_SECRETS: '0' } }), SecretError);
    assert.throws(() => assertNoSecrets({ text }, { env: {} }), SecretError);
  });
});
