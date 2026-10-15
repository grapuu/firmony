// Acceptance records are append-only in normal application use. Database administrators can still change the
// database: these controls and a digest are evidence of consistency, not a qualified signature or a WORM archive.
export const CONTRACT_SCHEMA = [
  `CREATE TABLE order_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL, reviewed_at INTEGER NOT NULL,
    reviewed_by TEXT NOT NULL, decision TEXT NOT NULL CHECK (decision IN ('standard', 'bespoke', 'hold')),
    offer_hash TEXT NOT NULL, plan TEXT NOT NULL, evidence TEXT NOT NULL, accountant_id TEXT, expires_at INTEGER NOT NULL
  )`,
  'CREATE INDEX order_reviews_order ON order_reviews (order_id, id DESC)',
  `CREATE TRIGGER order_reviews_immutable BEFORE UPDATE ON order_reviews BEGIN
    SELECT RAISE(ABORT, 'Append a new contract review'); END`,
  `CREATE TRIGGER order_reviews_keep BEFORE DELETE ON order_reviews
    WHEN EXISTS (SELECT 1 FROM orders o JOIN companies c ON c.id = o.company_id
      WHERE o.id = OLD.order_id AND c.purged_at IS NULL)
    BEGIN SELECT RAISE(ABORT, 'Retain accepted contract review'); END`,
  `CREATE TABLE contract_snapshots (
    company_id TEXT PRIMARY KEY, order_id TEXT NOT NULL UNIQUE, accepted_at INTEGER NOT NULL,
    terms_version TEXT NOT NULL, sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
    data TEXT NOT NULL CHECK (json_valid(data))
  )`,
  `CREATE TRIGGER contract_snapshots_insert BEFORE INSERT ON contract_snapshots
    WHEN NOT EXISTS (SELECT 1 FROM orders o JOIN companies c ON c.id = o.company_id
      WHERE o.id = NEW.order_id AND o.company_id = NEW.company_id AND c.order_id = o.id
        AND o.status = 'accepted' AND o.accepted_at = NEW.accepted_at AND o.terms_version = NEW.terms_version)
    BEGIN SELECT RAISE(ABORT, 'Snapshot requires the accepted order'); END`,
  `CREATE TRIGGER contract_snapshots_immutable BEFORE UPDATE ON contract_snapshots BEGIN
    SELECT RAISE(ABORT, 'Accepted contract is immutable'); END`,
  `CREATE TRIGGER contract_snapshots_keep BEFORE DELETE ON contract_snapshots
    WHEN NOT EXISTS (SELECT 1 FROM companies WHERE id = OLD.company_id AND purged_at IS NOT NULL)
    BEGIN SELECT RAISE(ABORT, 'Retain accepted contract'); END`,
]
