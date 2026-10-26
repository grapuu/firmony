// Schema step 84 (26 October 2026): the digital postman built into Firmony (peppol/). What the Peppol SML said of a
// participant, kept a short while by the hash the SML names it by (never the DIČ in clear); which company a participant
// is, bound only when the postman tells us the company chose Firmony on the Financial Administration's portal (its
// representative signed in there, so nobody can send or receive as a company by typing its DIČ); every e-invoice sent
// with its state; every e-invoice received, once; and what could not be placed, for the team to see.
export const PEPPOL_SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS peppol_lookups (
    name TEXT PRIMARY KEY CHECK (length(name) BETWEEN 40 AND 80),
    state TEXT NOT NULL CHECK (state IN ('found', 'missing')),
    smp TEXT CHECK (smp IS NULL OR length(smp) <= 253),
    checked_at INTEGER NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS peppol_lookups_checked ON peppol_lookups (checked_at)',
  `CREATE TABLE IF NOT EXISTS peppol_bindings (
    participant TEXT PRIMARY KEY CHECK (participant GLOB '[0-9][0-9][0-9][0-9]:*' AND length(participant) <= 64),
    company_id TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL,
    bound_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS einvoice_sends (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    invoice_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    created_by TEXT,
    sender TEXT NOT NULL,
    receiver TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('invoice', 'credit')),
    sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
    state TEXT NOT NULL CHECK (state IN ('queued', 'sent', 'delivered', 'rejected', 'failed')),
    state_at INTEGER NOT NULL,
    sent_at INTEGER,
    provider TEXT,
    ref TEXT CHECK (ref IS NULL OR length(ref) <= 200),
    tries INTEGER NOT NULL DEFAULT 0,
    next_at INTEGER,
    reason TEXT CHECK (reason IS NULL OR length(reason) <= 500)
  )`,
  // One live sending of an invoice: a second click, or two at once, sends nothing twice. A failed one may be followed
  // by another; a rejected one is answered by a credit note, not by the same invoice again.
  "CREATE UNIQUE INDEX IF NOT EXISTS einvoice_sends_live ON einvoice_sends (invoice_id) WHERE state IN ('queued', 'sent', 'delivered', 'rejected')",
  'CREATE UNIQUE INDEX IF NOT EXISTS einvoice_sends_ref ON einvoice_sends (provider, ref) WHERE ref IS NOT NULL',
  'CREATE INDEX IF NOT EXISTS einvoice_sends_company ON einvoice_sends (company_id, created_at)',
  'CREATE INDEX IF NOT EXISTS einvoice_sends_due ON einvoice_sends (state, next_at)',
  // A state moves forward only: rejected and failed stay so; delivered may still turn rejected (the customer's
  // answer comes after the delivery), never back.
  `CREATE TRIGGER IF NOT EXISTS einvoice_sends_forward BEFORE UPDATE OF state ON einvoice_sends
    WHEN NEW.state <> OLD.state AND (OLD.state IN ('rejected', 'failed') OR (OLD.state = 'delivered' AND NEW.state <> 'rejected') OR (OLD.state = 'sent' AND NEW.state = 'queued'))
    BEGIN SELECT RAISE(ABORT, 'FIRMONY_EINVOICE_FINAL'); END`,
  `CREATE TRIGGER IF NOT EXISTS einvoice_sends_fixed BEFORE UPDATE OF company_id, invoice_id, sender, receiver, kind, sha256, created_at ON einvoice_sends
    BEGIN SELECT RAISE(ABORT, 'FIRMONY_EINVOICE_FIXED'); END`,
  // The postman's word on a sending whose reference we have not recorded yet (its answer was lost): applied when it is.
  `CREATE TABLE IF NOT EXISTS einvoice_status_pending (
    provider TEXT NOT NULL,
    ref TEXT NOT NULL CHECK (length(ref) <= 200),
    state TEXT NOT NULL CHECK (state IN ('delivered', 'rejected')),
    reason TEXT CHECK (reason IS NULL OR length(reason) <= 500),
    at INTEGER NOT NULL,
    PRIMARY KEY (provider, ref, state)
  )`,
  `CREATE TABLE IF NOT EXISTS einvoice_received (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    ref TEXT NOT NULL CHECK (length(ref) <= 200),
    received_at INTEGER NOT NULL,
    sender TEXT CHECK (sender IS NULL OR length(sender) <= 64),
    receiver TEXT NOT NULL CHECK (length(receiver) <= 64),
    sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
    file_key TEXT,
    document_id TEXT,
    kind TEXT,
    prepaid INTEGER NOT NULL DEFAULT 0,
    supplier_endpoint TEXT CHECK (supplier_endpoint IS NULL OR length(supplier_endpoint) <= 64),
    mismatch INTEGER NOT NULL DEFAULT 0,
    party TEXT CHECK (party IS NULL OR length(party) <= 200),
    party_iban TEXT CHECK (party_iban IS NULL OR length(party_iban) <= 34),
    number TEXT CHECK (number IS NULL OR length(number) <= 64),
    vs TEXT CHECK (vs IS NULL OR length(vs) <= 10),
    issued_on TEXT,
    due_on TEXT,
    total_cents INTEGER,
    currency TEXT CHECK (currency IS NULL OR length(currency) <= 3),
    paid_on TEXT,
    UNIQUE (provider, ref)
  )`,
  'CREATE INDEX IF NOT EXISTS einvoice_received_company ON einvoice_received (company_id, received_at)',
  // What the postman told us that no company of ours could take, and a workspace's registration until the
  // administrator confirms that the workspace is that company: shown to the administrator, never lost.
  `CREATE TABLE IF NOT EXISTS peppol_unrouted (
    id TEXT PRIMARY KEY,
    at INTEGER NOT NULL,
    provider TEXT NOT NULL,
    ref TEXT CHECK (ref IS NULL OR length(ref) <= 200),
    kind TEXT NOT NULL CHECK (kind IN ('received', 'registered', 'event')),
    participant TEXT CHECK (participant IS NULL OR length(participant) <= 64),
    sender TEXT CHECK (sender IS NULL OR length(sender) <= 64),
    reason TEXT NOT NULL CHECK (reason IN ('unbound', 'unverified', 'ambiguous', 'unknown', 'conflict', 'ended', 'error')),
    company_id TEXT,
    file_key TEXT,
    resolved_at INTEGER,
    resolved_by TEXT
  )`,
  'CREATE INDEX IF NOT EXISTS peppol_unrouted_open ON peppol_unrouted (resolved_at, at)',
  'CREATE INDEX IF NOT EXISTS peppol_unrouted_ref ON peppol_unrouted (provider, ref, kind)',
]
