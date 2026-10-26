// The schema step of invoicing for everyone (26 October 2026); what it keeps apart and why: app/invoicing.ts.
// No imports: the schema is read before anything else of the app.

/** Schema step: the workspace's mark, an invoice paid by hand, the sign-ups waiting for their link. */
export const INVOICING_SCHEMA = [
  'ALTER TABLE companies ADD COLUMN invoicing_only INTEGER NOT NULL DEFAULT 0',
  'CREATE INDEX companies_invoicing ON companies (invoicing_only) WHERE invoicing_only = 1',
  'ALTER TABLE invoices ADD COLUMN hand_paid_on TEXT',
  'ALTER TABLE invoices ADD COLUMN hand_paid_by TEXT',
  `CREATE TABLE invoicing_signups (
    id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at INTEGER,
    email TEXT NOT NULL,
    name TEXT,
    ico TEXT,
    company TEXT NOT NULL,
    address TEXT,
    register_line TEXT,
    legal_form TEXT,
    source TEXT,
    terms_version TEXT NOT NULL,
    privacy_version TEXT NOT NULL,
    CHECK (length(company) BETWEEN 2 AND 160)
  )`,
  'CREATE INDEX invoicing_signups_expires ON invoicing_signups (expires_at)',
  // A workspace stays one, and a company of ours never becomes one: nothing of the books can cross either way.
  `CREATE TRIGGER companies_invoicing_fixed BEFORE UPDATE OF invoicing_only ON companies WHEN NEW.invoicing_only IS NOT OLD.invoicing_only
    BEGIN SELECT RAISE(ABORT, 'FIRMONY_INVOICING_FIXED'); END`,
  `CREATE TRIGGER companies_invoicing_insert BEFORE INSERT ON companies WHEN NEW.invoicing_only = 1
    AND (NEW.accountant_id IS NOT NULL OR NEW.contract_at IS NOT NULL OR NEW.order_id IS NOT NULL OR NEW.request_id IS NOT NULL OR NEW.operator = 1 OR NEW.demo = 1)
    BEGIN SELECT RAISE(ABORT, 'FIRMONY_INVOICING_SCOPE'); END`,
  `CREATE TRIGGER companies_invoicing_scope BEFORE UPDATE ON companies WHEN NEW.invoicing_only = 1
    AND (NEW.accountant_id IS NOT NULL OR NEW.contract_at IS NOT NULL OR NEW.order_id IS NOT NULL OR NEW.request_id IS NOT NULL OR NEW.operator = 1 OR NEW.autobook = 1)
    BEGIN SELECT RAISE(ABORT, 'FIRMONY_INVOICING_SCOPE'); END`,
  `CREATE TRIGGER documents_invoicing_only BEFORE INSERT ON documents WHEN NEW.source <> 'issued'
    AND EXISTS (SELECT 1 FROM companies WHERE id = NEW.company_id AND invoicing_only = 1)
    BEGIN SELECT RAISE(ABORT, 'FIRMONY_INVOICING_SCOPE'); END`,
  ...['payments', 'accounts', 'statements', 'messages', 'bank_links', 'ledger_entries', 'employees'].map(
    (table) => `CREATE TRIGGER ${table}_invoicing_only BEFORE INSERT ON ${table} WHEN EXISTS (SELECT 1 FROM companies WHERE id = NEW.company_id AND invoicing_only = 1)
    BEGIN SELECT RAISE(ABORT, 'FIRMONY_INVOICING_SCOPE'); END`,
  ),
  // The assistant's use moves the company's data revision only where the client's export carries it (its own side):
  // the team's use is no data of the client's (the review of 26 October 2026).
  'DROP TRIGGER assistant_uses_data_insert',
  'DROP TRIGGER assistant_uses_data_update',
  ...['INSERT', 'UPDATE'].map(
    (action) => `CREATE TRIGGER assistant_uses_data_${action.toLowerCase()} AFTER ${action} ON assistant_uses WHEN NEW.side = 'client' BEGIN
    INSERT INTO company_data_revisions(company_id,revision) VALUES(NEW.company_id,1) ON CONFLICT(company_id) DO UPDATE SET revision=revision+1; END`,
  ),
]
