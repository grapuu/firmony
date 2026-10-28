// Schema step 86: the s. r. o. for 1 € (src/founding/). An application of a founder who has no company yet, reached by
// a link sent to the founder's address; the designated person's checks and every move of it kept apart, never changed
// (deleted only with the application itself when its time is up, purge_started_at); the company it gave rise to and the
// prepayment that is still to be credited to its invoices. `rev` moves with every change: a write names the one it read.
export const FOUNDING_SCHEMA = [
  `CREATE TABLE foundings (
    id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    plan TEXT NOT NULL,
    -- Where the founder came from (utm_* and ref of the address, as a request keeps them): whom a referral is paid to.
    source TEXT CHECK(source IS NULL OR json_valid(source)),
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','verifying','verified','refused','lapsed','ordered','signing','filed','registered','withdrawn','cancelled')),
    founder TEXT CHECK(founder IS NULL OR json_valid(founder)),
    company TEXT CHECK(company IS NULL OR json_valid(company)),
    data_at INTEGER,
    id_front_key TEXT,
    id_back_key TEXT,
    id_at INTEGER,
    contract_version TEXT,
    contract_text TEXT,
    contract_hash TEXT,
    signed_key TEXT,
    signed_kind TEXT CHECK(signed_kind IS NULL OR signed_kind IN ('qes','paper')),
    signed_hash TEXT,
    signed_contract_hash TEXT,
    signed_at INTEGER,
    original_at INTEGER,
    original_by TEXT,
    vs TEXT NOT NULL UNIQUE,
    payment_id TEXT UNIQUE,
    paid_cents INTEGER,
    paid_at INTEGER,
    payer_name TEXT,
    payer_iban TEXT,
    month TEXT,
    calls INTEGER NOT NULL DEFAULT 0,
    called_at INTEGER,
    ico TEXT,
    company_id TEXT UNIQUE,
    approved_at INTEGER,
    exit_decision TEXT CHECK(exit_decision IS NULL OR exit_decision IN ('charge','waive')),
    exit_decided_by TEXT,
    rev INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    purge_started_at INTEGER
  )`,
  'CREATE INDEX foundings_status ON foundings (status, created_at)',
  'CREATE INDEX foundings_email ON foundings (email, created_at)',
  // The links to an application: each email to the founder carries a new one, and every one opens it (only their hash
  // is kept). A lost link is replaced by asking for the application again with the same address.
  `CREATE TABLE founding_links (
    token TEXT PRIMARY KEY,
    founding_id TEXT NOT NULL REFERENCES foundings(id),
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  )`,
  'CREATE INDEX founding_links_of ON founding_links (founding_id)',
  'CREATE INDEX foundings_month ON foundings (month)',
  // The designated person's checks: who, when, what and how it came out. Kept as written.
  `CREATE TABLE founding_checks (
    id TEXT PRIMARY KEY,
    founding_id TEXT NOT NULL REFERENCES foundings(id),
    at INTEGER NOT NULL,
    by TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('identity','pep','sanctions','debts','signature','payment','original')),
    result TEXT NOT NULL CHECK(result IN ('clear','problem')),
    note TEXT NOT NULL DEFAULT ''
  )`,
  'CREATE INDEX founding_checks_of ON founding_checks (founding_id, kind, at)',
  `CREATE TRIGGER founding_checks_kept BEFORE UPDATE ON founding_checks BEGIN SELECT RAISE(ABORT, 'founding checks are kept as written'); END`,
  `CREATE TRIGGER founding_checks_not_deleted BEFORE DELETE ON founding_checks WHEN (SELECT purge_started_at FROM foundings WHERE id = OLD.founding_id) IS NULL
    BEGIN SELECT RAISE(ABORT, 'founding checks are kept as written'); END`,
  // Every move of an application, with who made it and why.
  `CREATE TABLE founding_events (
    id TEXT PRIMARY KEY,
    founding_id TEXT NOT NULL REFERENCES foundings(id),
    at INTEGER NOT NULL,
    by TEXT,
    action TEXT NOT NULL,
    status TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT ''
  )`,
  'CREATE INDEX founding_events_of ON founding_events (founding_id, at)',
  `CREATE TRIGGER founding_events_kept BEFORE UPDATE ON founding_events BEGIN SELECT RAISE(ABORT, 'founding events are kept as written'); END`,
  `CREATE TRIGGER founding_events_not_deleted BEFORE DELETE ON founding_events WHEN (SELECT purge_started_at FROM foundings WHERE id = OLD.founding_id) IS NULL
    BEGIN SELECT RAISE(ABORT, 'founding events are kept as written'); END`,
  // A company formed through an application, and what of its prepayment is still to be credited to europio's invoices.
  'ALTER TABLE companies ADD COLUMN founding_id TEXT',
  'ALTER TABLE companies ADD COLUMN prepaid_cents INTEGER NOT NULL DEFAULT 0 CHECK(prepaid_cents >= 0)',
  'ALTER TABLE billing_invoices ADD COLUMN prepaid_cents INTEGER NOT NULL DEFAULT 0',
]
