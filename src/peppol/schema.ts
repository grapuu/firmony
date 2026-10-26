// Schema step 84 (26 October 2026): the digital postman built into Firmony (peppol/). What the Peppol SML said of a
// participant, kept a while; every e-invoice sent through the postman with its state; every e-invoice received, once.
// Nothing here is the invoice itself: an invoice stays in `invoices`, a received one becomes a document of the company.
export const PEPPOL_SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS peppol_lookups (
    participant TEXT PRIMARY KEY CHECK (participant GLOB '[0-9][0-9][0-9][0-9]:*' AND length(participant) <= 64),
    state TEXT NOT NULL CHECK (state IN ('found', 'missing')),
    smp TEXT CHECK (smp IS NULL OR length(smp) <= 253),
    checked_at INTEGER NOT NULL
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
  // One live sending of an invoice: a second click, or two at once, sends nothing twice. A rejected or failed one
  // may be followed by another.
  "CREATE UNIQUE INDEX IF NOT EXISTS einvoice_sends_live ON einvoice_sends (invoice_id) WHERE state IN ('queued', 'sent', 'delivered')",
  'CREATE UNIQUE INDEX IF NOT EXISTS einvoice_sends_ref ON einvoice_sends (provider, ref) WHERE ref IS NOT NULL',
  'CREATE INDEX IF NOT EXISTS einvoice_sends_company ON einvoice_sends (company_id, created_at)',
  'CREATE INDEX IF NOT EXISTS einvoice_sends_due ON einvoice_sends (state, next_at)',
  // A state only moves forward: queued to sent, sent to delivered or rejected, any open one to failed. A delivered or
  // rejected e-invoice stays so (the postman's word is evidence).
  `CREATE TRIGGER IF NOT EXISTS einvoice_sends_forward BEFORE UPDATE OF state ON einvoice_sends
    WHEN OLD.state IN ('delivered', 'rejected', 'failed') AND NEW.state <> OLD.state
    BEGIN SELECT RAISE(ABORT, 'FIRMONY_EINVOICE_FINAL'); END`,
  `CREATE TRIGGER IF NOT EXISTS einvoice_sends_fixed BEFORE UPDATE OF company_id, invoice_id, sender, receiver, kind, sha256, created_at ON einvoice_sends
    BEGIN SELECT RAISE(ABORT, 'FIRMONY_EINVOICE_FIXED'); END`,
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
    party TEXT,
    party_iban TEXT,
    number TEXT,
    vs TEXT,
    issued_on TEXT,
    due_on TEXT,
    total_cents INTEGER,
    currency TEXT,
    paid_on TEXT,
    UNIQUE (provider, ref)
  )`,
  'CREATE INDEX IF NOT EXISTS einvoice_received_company ON einvoice_received (company_id, received_at)',
]
