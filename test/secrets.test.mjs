// Nothing secret in the repository (29 October 2026, after it was found public for its first sixteen days): no key,
// token, password or private key in any file git tracks, and none of the files a key lives in. Runs in `npm test`, so
// before every push and in the Checks of GitHub. A real key belongs in Cloudflare's secrets or GitHub's, never here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const root = new URL('..', import.meta.url)
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)

/** What a key or a credential looks like where it is written down. */
export const SECRET_PATTERNS = {
  anthropic: /sk-ant-[A-Za-z0-9_-]{20,}/,
  stripe: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{10,}/,
  stripeWebhook: /\bwhsec_[A-Za-z0-9]{16,}/,
  github: /\b(?:ghp|gho|ghs|ghu|ghr)_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}/,
  aws: /\bAKIA[0-9A-Z]{16}\b/,
  google: /\bAIza[0-9A-Za-z_-]{35}\b/,
  slack: /\bxox[abprs]-[A-Za-z0-9-]{10,}/,
  privateKey: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED |PGP )?PRIVATE KEY(?: BLOCK)?-----/,
  jwt: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}/,
  password: /(?:password|passwd|heslo|pwd)\s*[:=]\s*["'][^"'\s]{8,}["']/i,
  assigned: /\b(?:[A-Z][A-Z0-9_]*_(?:KEY|TOKEN|SECRET|PASSWORD))\s*=\s*["']?[A-Za-z0-9/+_-]{24,}/,
}

/** Files that hold credentials by their nature. */
const SECRET_FILES = /(?:^|\/)(?:\.env(?:\.[^/]*)?|\.dev\.vars|[^/]*\.(?:pem|key|p12|pfx|jks|keystore)|id_(?:rsa|ed25519|ecdsa)|credentials(?:\.json)?|service-account[^/]*\.json)$/i

/** Made-up values the tests and the playground use on purpose, never a real credential; and IndexNow's key, which the
 *  protocol publishes at /<key>.txt for every search engine to read. */
const ALLOWED = [/TEST_BOOTSTRAP/, /playgroundActivation/, /sk_test_x\b/, /\bsk_test_(?:pretend|fake|example)[A-Za-z0-9_]*/, /^INDEXNOW_KEY = /, /^FIO_TOKEN = 'Fio2026token/]

const binary = (bytes) => bytes.subarray(0, 8000).includes(0)

test('git tracks no file that holds credentials', () => {
  assert.deepEqual(tracked.filter((path) => SECRET_FILES.test(path) && !path.endsWith('.example')), [])
})

test('no tracked file holds a key, a token, a password or a private key', () => {
  const found = []
  for (const path of tracked) {
    if (path === 'test/secrets.test.mjs') continue
    let bytes
    try {
      bytes = readFileSync(new URL(path, root))
    } catch {
      continue
    }
    if (binary(bytes)) continue
    const text = bytes.toString('utf8')
    for (const [kind, pattern] of Object.entries(SECRET_PATTERNS)) {
      const global = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`)
      for (const match of text.matchAll(global)) {
        if (ALLOWED.some((allowed) => allowed.test(match[0]))) continue
        found.push(`${path}: ${kind} (${match[0].slice(0, 12)}…)`)
      }
    }
  }
  assert.deepEqual(found, [])
})

test('every pattern catches what it is for and lets ordinary text through', () => {
  const fake = {
    anthropic: `sk-ant-api03-${'a'.repeat(30)}`,
    stripe: `sk_live_${'A1'.repeat(10)}`,
    stripeWebhook: `whsec_${'b'.repeat(24)}`,
    github: `ghp_${'c'.repeat(36)}`,
    aws: `AKIA${'D'.repeat(16)}`,
    google: `AIza${'e'.repeat(35)}`,
    slack: `xoxb-${'1'.repeat(12)}`,
    privateKey: '-----BEGIN PRIVATE KEY-----',
    jwt: `eyJ${'f'.repeat(12)}.eyJ${'g'.repeat(12)}.${'h'.repeat(24)}`,
    password: 'password: "Kocka123Pes!"',
    assigned: `ANTHROPIC_API_KEY=${'Z'.repeat(32)}`,
  }
  for (const [kind, pattern] of Object.entries(SECRET_PATTERNS)) assert.ok(pattern.test(fake[kind]), kind)
  for (const ordinary of ['ANTHROPIC_API_KEY', 'c.env.STRIPE_KEY', 'heslo: ""', 'sk-ant-', 'whsec_', 'Bearer ${key}']) {
    assert.ok(!Object.values(SECRET_PATTERNS).some((p) => p.test(ordinary)), ordinary)
  }
  assert.ok(SECRET_FILES.test('.env') && SECRET_FILES.test('config/.env.production') && SECRET_FILES.test('enable.pem') && SECRET_FILES.test('.dev.vars'))
  assert.ok(!SECRET_FILES.test('src/env.ts') && !SECRET_FILES.test('docs/keys.md'))
})
