import { AML_AUTO_REVIEW_SCHEMA } from './aml/auto-review-schema'
import { AML_ENHANCED_SCHEMA } from './aml/enhanced-schema'
import { AML_PROSPECT_SCHEMA } from './aml/prospect-schema'
import { AML_RETENTION_SCHEMA } from './aml/retention'
import { AML_SCHEMA } from './aml/schema'
import { AML_POLICY_SCHEMA } from './aml/policy-schema'
import { MANAGED_HANDOVER_SCHEMA } from './migration/schema'
import { ASSISTANT_SCHEMA } from './assistant/schema'
import { FORMATION_SCHEMA } from './formation/schema'
import { INVOICING_SCHEMA } from './app/invoicing-schema'
import { ANALYTICS_SCHEMA } from './analytics/schema'
import { PEPPOL_SCHEMA } from './peppol/schema'
import { PASSKEY_SIGNIN_SCHEMA } from './security/schema'
import { FOUNDING_SCHEMA } from './founding/schema'
import { SANCTIONS_SCHEMA } from './aml/sanctions-schema'
import { usageCutoff } from './analytics/model'
import { bratislavaDay } from './time'
// The database: requests from the site, the outbox of email, and the counters that limit the forms.
// The schema applies itself on the first request (MIGRATIONS); never edit a step that has reached the live database.
import { RETENTION } from './config'
import { PERIOD_SCHEMA, assetVatGuards, badDebtsGuards, closingsGuardsWithoutDistribution, documentsUpdateGuardWith, invoicesUpdateGuard, vatRatiosGuards } from './app/period-schema'
import { CONTRACT_SCHEMA } from './contract-schema'
import { SECURITY_SCHEMA } from './security/schema'
import { INCIDENT_SCHEMA } from './incidents/schema'
import { FILING_SCHEMA } from './filings/schema'
import { PAYROLL_REPORTING_SCHEMA } from './payroll-reporting/schema'
import { PAYROLL_REVIEW_SCHEMA } from './payroll-reporting/review-schema'
import { PAYROLL_HEALTH_COVERAGE_SCHEMA, PAYROLL_HEALTH_SCHEMA } from './payroll-reporting/health-schema'
import { PAYROLL_SOCIAL_SCHEMA } from './payroll-reporting/social-schema'

export const now = (): number => Math.floor(Date.now() / 1000)

const MIGRATIONS: readonly string[][] = [
  [
    `CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      ico TEXT,
      company TEXT,
      address TEXT,
      company_source TEXT,
      plan TEXT NOT NULL,
      situation TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      note TEXT,
      source TEXT,
      privacy_version TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new'
    )`,
    'CREATE INDEX IF NOT EXISTS requests_created ON requests (created_at)',
    `CREATE TABLE IF NOT EXISTS outbox (
      id TEXT PRIMARY KEY,
      recipient TEXT NOT NULL,
      reply_to TEXT,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      tried_at INTEGER,
      sent_at INTEGER,
      message_id TEXT,
      error TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS throttle (
      key TEXT NOT NULL,
      bucket INTEGER NOT NULL,
      hits INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      PRIMARY KEY (key, bucket)
    )`,
    'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
  ],
  // The client's app and the accountants' side (13 October 2026). Nothing of this step has reached a live database
  // yet (no Worker exists), so it was rewritten in place that evening; once deployed, it is never edited again.
  // Whether a payment still needs a document is never stored: it is read from `links` and `exempt` every time
  // (src/app/store.ts), so it cannot disagree with them.
  [
    `CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      name TEXT NOT NULL,
      ico TEXT,
      dic TEXT,
      icdph TEXT,
      address TEXT,
      register_line TEXT,
      vat_payer INTEGER NOT NULL DEFAULT 0,
      plan TEXT NOT NULL,
      inbox TEXT NOT NULL UNIQUE,
      accountant_id TEXT,
      request_id TEXT,
      note TEXT,
      demo INTEGER NOT NULL DEFAULT 0,
      closed_at INTEGER,
      invoice_iban TEXT,
      invoice_due_days INTEGER NOT NULL DEFAULT 14,
      invoice_footer TEXT,
      order_id TEXT,
      contract_at INTEGER,
      terms_version TEXT,
      signed_by TEXT,
      start_on TEXT,
      notice_at INTEGER,
      notice_by TEXT,
      notice_side TEXT,
      ends_on TEXT,
      purged_at INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      request_id TEXT,
      ico TEXT NOT NULL,
      company TEXT NOT NULL,
      address TEXT,
      register_line TEXT,
      directors TEXT,
      plan TEXT NOT NULL,
      person TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      accepted_at INTEGER,
      signed_by TEXT,
      start_on TEXT,
      price_cents INTEGER,
      terms_version TEXT,
      ip_hash TEXT,
      company_id TEXT
    )`,
    'CREATE INDEX IF NOT EXISTS orders_ico ON orders (ico)',
    `CREATE TABLE IF NOT EXISTS company_files (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      created_by TEXT,
      file_name TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      r2_key TEXT NOT NULL,
      checked_at INTEGER,
      checked_by TEXT
    )`,
    'CREATE INDEX IF NOT EXISTS company_files_company ON company_files (company_id, kind)',
    `CREATE TABLE IF NOT EXISTS declarations (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      created_by TEXT NOT NULL,
      data TEXT NOT NULL,
      checked_at INTEGER,
      checked_by TEXT
    )`,
    'CREATE INDEX IF NOT EXISTS declarations_company ON declarations (company_id, created_at)',
    `CREATE TABLE IF NOT EXISTS risks (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      created_by TEXT NOT NULL,
      level TEXT NOT NULL,
      note TEXT
    )`,
    'CREATE INDEX IF NOT EXISTS risks_company ON risks (company_id, created_at)',
    `CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      created_by TEXT NOT NULL,
      body TEXT NOT NULL,
      decided_at INTEGER,
      decided_by TEXT,
      decision TEXT,
      decision_note TEXT
    )`,
    'CREATE INDEX IF NOT EXISTS reports_company ON reports (company_id, created_at)',
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL,
      team TEXT,
      reminders INTEGER NOT NULL DEFAULT 1
    )`,
    `CREATE TABLE IF NOT EXISTS members (
      company_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      invited_by TEXT,
      PRIMARY KEY (company_id, user_id)
    )`,
    'CREATE INDEX IF NOT EXISTS members_user ON members (user_id)',
    `CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      company_id TEXT,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    )`,
    'CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id)',
    `CREATE TABLE IF NOT EXISTS login_links (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      used_at INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      iban TEXT NOT NULL,
      bank TEXT,
      balance_cents INTEGER,
      balance_on TEXT,
      link_id TEXT,
      remote_id TEXT,
      UNIQUE (company_id, iban)
    )`,
    `CREATE TABLE IF NOT EXISTS bank_links (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      created_by TEXT,
      bank TEXT NOT NULL,
      country TEXT NOT NULL,
      state TEXT NOT NULL UNIQUE,
      session_id TEXT,
      valid_until INTEGER,
      status TEXT NOT NULL,
      synced_at INTEGER,
      tried_at INTEGER,
      error TEXT
    )`,
    'CREATE INDEX IF NOT EXISTS bank_links_company ON bank_links (company_id, status)',
    `CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      booked_on TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'EUR',
      party TEXT,
      party_iban TEXT,
      vs TEXT,
      ss TEXT,
      ks TEXT,
      note TEXT,
      card INTEGER NOT NULL DEFAULT 0,
      ref TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'statement',
      exempt TEXT,
      exempt_note TEXT,
      exempt_by TEXT,
      checked_at INTEGER,
      checked_by TEXT,
      UNIQUE (account_id, ref)
    )`,
    'CREATE INDEX IF NOT EXISTS payments_company ON payments (company_id, booked_on)',
    `CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      source TEXT NOT NULL,
      added_by TEXT,
      file_key TEXT,
      file_type TEXT,
      file_name TEXT,
      file_bytes INTEGER,
      file_hash TEXT,
      status TEXT NOT NULL,
      read_by TEXT,
      read_tries INTEGER NOT NULL DEFAULT 0,
      kind TEXT,
      party TEXT,
      party_ico TEXT,
      party_iban TEXT,
      number TEXT,
      vs TEXT,
      issued_on TEXT,
      due_on TEXT,
      total_cents INTEGER,
      vat_cents INTEGER,
      currency TEXT,
      category TEXT,
      proposal TEXT,
      vat_deduct INTEGER,
      account TEXT,
      booked_at INTEGER,
      booked_by TEXT,
      duplicate_of TEXT,
      invoice_id TEXT,
      paid_privately INTEGER NOT NULL DEFAULT 0,
      deleted_at INTEGER
    )`,
    'CREATE INDEX IF NOT EXISTS documents_company ON documents (company_id, created_at)',
    'CREATE INDEX IF NOT EXISTS documents_hash ON documents (company_id, file_hash)',
    `CREATE TABLE IF NOT EXISTS links (
      document_id TEXT PRIMARY KEY,
      payment_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      how TEXT NOT NULL,
      by TEXT,
      created_at INTEGER NOT NULL
    )`,
    'CREATE INDEX IF NOT EXISTS links_payment ON links (payment_id)',
    `CREATE TABLE IF NOT EXISTS supplier_rules (
      company_id TEXT NOT NULL,
      key TEXT NOT NULL,
      name TEXT,
      category TEXT NOT NULL,
      vat_deduct INTEGER NOT NULL,
      uses INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL,
      updated_by TEXT,
      PRIMARY KEY (company_id, key)
    )`,
    `CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      author TEXT,
      side TEXT NOT NULL,
      body TEXT NOT NULL,
      payment_id TEXT,
      seen_at INTEGER
    )`,
    'CREATE INDEX IF NOT EXISTS messages_company ON messages (company_id, created_at)',
    `CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      created_by TEXT,
      status TEXT NOT NULL,
      year INTEGER,
      seq INTEGER,
      number TEXT,
      customer_name TEXT NOT NULL,
      customer_ico TEXT,
      customer_dic TEXT,
      customer_icdph TEXT,
      customer_address TEXT,
      customer_email TEXT,
      issued_on TEXT NOT NULL,
      delivered_on TEXT NOT NULL,
      due_on TEXT NOT NULL,
      note TEXT,
      base_cents INTEGER NOT NULL,
      vat_cents INTEGER NOT NULL,
      total_cents INTEGER NOT NULL,
      iban TEXT,
      token TEXT NOT NULL UNIQUE,
      document_id TEXT,
      sent_at INTEGER,
      reminded_at INTEGER,
      UNIQUE (company_id, number)
    )`,
    'CREATE INDEX IF NOT EXISTS invoices_company ON invoices (company_id, created_at)',
    `CREATE TABLE IF NOT EXISTS invoice_lines (
      invoice_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      description TEXT NOT NULL,
      quantity_milli INTEGER NOT NULL,
      unit TEXT,
      unit_cents INTEGER NOT NULL,
      vat_rate INTEGER NOT NULL,
      base_cents INTEGER NOT NULL,
      PRIMARY KEY (invoice_id, position)
    )`,
    `CREATE TABLE IF NOT EXISTS inbound_mail (
      id TEXT PRIMARY KEY,
      company_id TEXT,
      received_at INTEGER NOT NULL,
      sender TEXT,
      subject TEXT,
      files INTEGER NOT NULL,
      status TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at INTEGER NOT NULL,
      company_id TEXT,
      user_id TEXT,
      action TEXT NOT NULL,
      subject TEXT,
      detail TEXT
    )`,
    'CREATE INDEX IF NOT EXISTS events_company ON events (company_id, at)',
  ],
  // VAT (14 October 2026): what a document's VAT is for the return and the control statement (src/app/vat.ts),
  // how the company is registered and files, and the returns marked as filed. A period's row is what the
  // Financial Administration knows of it now: the regular return (kind R), or the corrective (O) or supplementary
  // (D) one filed after it, with the control statement's lines as filed (kv, for the next supplementary one) and
  // the filing it replaced (prev, JSON, so that a mark set by mistake can be taken back to it).
  [
    'ALTER TABLE documents ADD COLUMN supplied_on TEXT',
    'ALTER TABLE documents ADD COLUMN vat_mode TEXT',
    'ALTER TABLE documents ADD COLUMN vat_lines TEXT',
    'ALTER TABLE documents ADD COLUMN party_vat_id TEXT',
    'ALTER TABLE documents ADD COLUMN corrects TEXT',
    'ALTER TABLE documents ADD COLUMN vat_period TEXT',
    'ALTER TABLE documents ADD COLUMN foreign_party INTEGER',
    'ALTER TABLE companies ADD COLUMN vat_7a INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE companies ADD COLUMN vat_quarterly INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE companies ADD COLUMN vat_since TEXT',
    'ALTER TABLE companies ADD COLUMN tax_office TEXT',
    'ALTER TABLE companies ADD COLUMN tax_account TEXT',
    // The excess deduction of the last period before ours that was not refunded: the first period of ours deducts it (row 34).
    'ALTER TABLE companies ADD COLUMN vat_carry INTEGER NOT NULL DEFAULT 0',
    `CREATE TABLE IF NOT EXISTS vat_returns (
      company_id TEXT NOT NULL,
      period TEXT NOT NULL,
      filed_at INTEGER NOT NULL,
      filed_on TEXT NOT NULL,
      filed_by TEXT,
      rows TEXT NOT NULL,
      kv_rows INTEGER NOT NULL DEFAULT 0,
      pay_cents INTEGER NOT NULL DEFAULT 0,
      refund_cents INTEGER NOT NULL DEFAULT 0,
      due_on TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'R',
      fast INTEGER NOT NULL DEFAULT 0,
      carried INTEGER NOT NULL DEFAULT 0,
      kv TEXT,
      found_on TEXT,
      prev TEXT,
      PRIMARY KEY (company_id, period)
    )`,
  ],
  // The books (14 October 2026, src/app/ledger.ts). They are worked out from the documents, the payments and the
  // returns every time; stored are only what nothing else holds: the accountant's internal documents and the
  // opening balances (ledger_entries, removed by a mark and never deleted), the account she gave a payment that has no
  // document (payments.contra), and each bank account's analytic account, given once and never renumbered.
  [
    `CREATE TABLE IF NOT EXISTS ledger_entries (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      year INTEGER NOT NULL,
      seq INTEGER,
      number TEXT,
      on_date TEXT NOT NULL,
      text TEXT NOT NULL,
      lines TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      created_by TEXT,
      deleted_at INTEGER,
      deleted_by TEXT
    )`,
    'CREATE INDEX IF NOT EXISTS ledger_entries_company ON ledger_entries (company_id, on_date)',
    'ALTER TABLE payments ADD COLUMN contra TEXT',
    'ALTER TABLE accounts ADD COLUMN ledger TEXT',
    `UPDATE accounts SET ledger = printf('221.%03d', (SELECT COUNT(*) FROM accounts b WHERE b.company_id = accounts.company_id AND b.rowid <= accounts.rowid)) WHERE ledger IS NULL`,
  ],
  // The bank without an aggregator (14 October 2026, src/app/statements.ts and fio.ts). Every statement is kept as a
  // record with its file (a bank statement is an accounting document): where it came from, what it held, and whether
  // it was taken, waits for the owner (an account the company does not have yet) or for the accountant (it does not
  // follow the last one). A bank link of a second kind: Fio banka, read by the client's own token. And the way the
  // owner chose to bring the bank in, with the bank, until the first statement shows that it works.
  [
    `CREATE TABLE IF NOT EXISTS statements (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      account_id TEXT,
      iban TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      source TEXT NOT NULL,
      added_by TEXT,
      sender TEXT,
      file_key TEXT,
      file_hash TEXT,
      file_name TEXT,
      part INTEGER NOT NULL DEFAULT 0,
      number TEXT,
      from_on TEXT,
      to_on TEXT,
      opening_cents INTEGER,
      opening_on TEXT,
      closing_cents INTEGER,
      closing_on TEXT,
      entries INTEGER NOT NULL DEFAULT 0,
      added INTEGER NOT NULL DEFAULT 0,
      known INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      reason TEXT,
      decided_at INTEGER,
      decided_by TEXT
    )`,
    'CREATE INDEX IF NOT EXISTS statements_company ON statements (company_id, created_at)',
    "ALTER TABLE bank_links ADD COLUMN kind TEXT NOT NULL DEFAULT 'eb'",
    'ALTER TABLE bank_links ADD COLUMN token TEXT',
    'ALTER TABLE companies ADD COLUMN bank_setup TEXT',
  ],
  // Every client's deadlines on one screen (src/team/deadlines.ts). What the app does not file itself yet is marked
  // here as filed once the accountant filed it elsewhere, so that its deadline does not stay open: the recapitulative
  // statement (kind 'sv', the period of the VAT return it belongs to, or the quarter of a person registered under § 7a)
  // and the annual closing with the corporate income tax return (kind 'closing', the year). One row a filing.
  [
    `CREATE TABLE IF NOT EXISTS filings (
      company_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      period TEXT NOT NULL,
      filed_on TEXT NOT NULL,
      filed_at INTEGER NOT NULL,
      filed_by TEXT,
      PRIMARY KEY (company_id, kind, period)
    )`,
  ],
  // The annual closing and the corporate income tax return (src/app/closing.ts, 14 October 2026): one row a company's
  // year, with what the accountant set for it (closing-form.ts), the deadline a notice moved (§ 49(3)), the internal
  // document that books the tax, and once filed, what was filed and what the client was told to pay by when. The mark of
  // a closing filed moves here from `filings` (step 6), which keeps the recapitulative statement.
  [
    `CREATE TABLE IF NOT EXISTS closings (
      company_id TEXT NOT NULL,
      year INTEGER NOT NULL,
      inputs TEXT,
      saved_at INTEGER,
      saved_by TEXT,
      extended_to TEXT,
      tax_entry TEXT,
      filed_on TEXT,
      filed_at INTEGER,
      filed_by TEXT,
      filed TEXT,
      pay_cents INTEGER,
      due_on TEXT,
      PRIMARY KEY (company_id, year)
    )`,
    "INSERT OR IGNORE INTO closings (company_id, year, filed_on, filed_at, filed_by) SELECT company_id, CAST(period AS INTEGER), filed_on, filed_at, filed_by FROM filings WHERE kind = 'closing'",
    "DELETE FROM filings WHERE kind = 'closing'",
  ],
  // Payroll (src/app/payroll.ts, 14 October 2026): a company's employees in an employment relationship, each month's
  // run (the incomes typed while it is open, the payslips as they were once closed: what the books, the client's
  // message and the deadlines read), and the company's payroll settings (the payday, the accounts and payer numbers at
  // the Social Insurance Agency and the health insurers).
  [
    `CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      name TEXT NOT NULL,
      born_on TEXT,
      insurer TEXT NOT NULL,
      started_on TEXT NOT NULL,
      ended_on TEXT,
      wage_cents INTEGER NOT NULL,
      declaration INTEGER NOT NULL DEFAULT 0,
      disabled INTEGER NOT NULL DEFAULT 0,
      health_deduction INTEGER NOT NULL DEFAULT 0,
      health_exempt INTEGER NOT NULL DEFAULT 0,
      children TEXT NOT NULL DEFAULT '[]',
      iban TEXT,
      created_at INTEGER NOT NULL,
      created_by TEXT,
      updated_at INTEGER
    )`,
    'CREATE INDEX IF NOT EXISTS employees_company ON employees (company_id)',
    `CREATE TABLE IF NOT EXISTS payroll_runs (
      company_id TEXT NOT NULL,
      period TEXT NOT NULL,
      payday TEXT,
      lines TEXT NOT NULL DEFAULT '[]',
      saved_at INTEGER,
      saved_by TEXT,
      closed_at INTEGER,
      closed_on TEXT,
      closed_by TEXT,
      PRIMARY KEY (company_id, period)
    )`,
    'ALTER TABLE companies ADD COLUMN payroll TEXT',
  ],
  // eKasa receipts (src/app/ekasa.ts, 14 October 2026): the receipt's identifier and the seller's verification code
  // as the reader wrote them, which tell one receipt from another.
  ['ALTER TABLE documents ADD COLUMN ekasa_uid TEXT', 'ALTER TABLE documents ADD COLUMN ekasa_okp TEXT'],
  // The recapitulative statement (src/app/vat-summary.ts, 14 October 2026): what a statement marked as filed held
  // (its rows, the rows its file sent, and the filing it replaced), so that a change after it asks for a correction.
  ['ALTER TABLE filings ADD COLUMN data TEXT'],
  // Compare-and-swap for a closing's writes; keep the original values when a filed closing or a closed payroll is reopened.
  [
    'ALTER TABLE closings ADD COLUMN revision INTEGER NOT NULL DEFAULT 0',
    `CREATE TABLE closing_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT, company_id TEXT NOT NULL, year INTEGER NOT NULL,
      archived_at INTEGER NOT NULL, data TEXT NOT NULL
    )`,
    'CREATE INDEX closing_history_company ON closing_history (company_id, year)',
    `CREATE TRIGGER closing_history_update AFTER UPDATE ON closings
      WHEN OLD.inputs IS NOT NULL OR OLD.tax_entry IS NOT NULL OR OLD.filed_at IS NOT NULL
      BEGIN INSERT INTO closing_history (company_id, year, archived_at, data)
        VALUES (OLD.company_id, OLD.year, unixepoch(), json_object(
          'inputs', OLD.inputs, 'saved_at', OLD.saved_at, 'saved_by', OLD.saved_by, 'extended_to', OLD.extended_to,
          'tax_entry', OLD.tax_entry, 'filed_on', OLD.filed_on, 'filed_at', OLD.filed_at, 'filed_by', OLD.filed_by,
          'filed', OLD.filed, 'pay_cents', OLD.pay_cents, 'due_on', OLD.due_on, 'revision', OLD.revision)); END`,
    `CREATE TABLE payroll_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT, company_id TEXT NOT NULL, period TEXT NOT NULL,
      archived_at INTEGER NOT NULL, data TEXT NOT NULL
    )`,
    'CREATE INDEX payroll_history_company ON payroll_history (company_id, period)',
    `CREATE TRIGGER payroll_history_update AFTER UPDATE ON payroll_runs
      WHEN OLD.closed_at IS NOT NULL AND (OLD.closed_at IS NOT NEW.closed_at OR OLD.lines IS NOT NEW.lines)
      BEGIN INSERT INTO payroll_history (company_id, period, archived_at, data)
        VALUES (OLD.company_id, OLD.period, unixepoch(), json_object(
          'payday', OLD.payday, 'lines', OLD.lines, 'saved_at', OLD.saved_at, 'saved_by', OLD.saved_by,
          'closed_at', OLD.closed_at, 'closed_on', OLD.closed_on, 'closed_by', OLD.closed_by)); END`,
  ],
  // A completed export is acknowledged by the owner. Any subsequent accounting change invalidates that handover.
  [
    'ALTER TABLE companies ADD COLUMN purge_started_at INTEGER',
    'ALTER TABLE companies ADD COLUMN purge_checked_at INTEGER',
    'CREATE TABLE company_data_revisions (company_id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 0)',
    `CREATE TABLE export_receipts (
      id TEXT PRIMARY KEY, company_id TEXT NOT NULL, year TEXT NOT NULL, revision INTEGER NOT NULL,
      user_id TEXT NOT NULL, created_at INTEGER NOT NULL, completed_at INTEGER, confirmed_at INTEGER
    )`,
    'CREATE INDEX export_receipts_company ON export_receipts (company_id, revision, year)',
    ...['documents', 'payments', 'links', 'accounts', 'bank_links', 'statements', 'invoices', 'messages', 'supplier_rules', 'vat_returns', 'filings', 'closings', 'closing_history', 'employees', 'payroll_runs', 'payroll_history', 'ledger_entries', 'company_files'].flatMap((table) => [
      ...['INSERT', 'UPDATE', 'DELETE'].map((action) => {
        const row = action === 'DELETE' ? 'OLD' : 'NEW'
        return `CREATE TRIGGER ${table}_data_${action.toLowerCase()} AFTER ${action} ON ${table} BEGIN
          INSERT INTO company_data_revisions (company_id, revision) VALUES (${row}.company_id, 1)
          ON CONFLICT (company_id) DO UPDATE SET revision = revision + 1; END`
      }),
      ...['INSERT', 'UPDATE'].map((action) => `CREATE TRIGGER ${table}_purging_${action.toLowerCase()} BEFORE ${action} ON ${table}
        WHEN EXISTS (SELECT 1 FROM companies WHERE id = NEW.company_id AND purge_started_at IS NOT NULL)
        BEGIN SELECT RAISE(ABORT, 'Company handover is being finalized'); END`),
    ]),
    ...['INSERT', 'UPDATE', 'DELETE'].map((action) => {
      const row = action === 'DELETE' ? 'OLD' : 'NEW'
      return `CREATE TRIGGER invoice_lines_data_${action.toLowerCase()} AFTER ${action} ON invoice_lines BEGIN
        INSERT INTO company_data_revisions (company_id, revision) SELECT company_id, 1 FROM invoices WHERE id = ${row}.invoice_id
        ON CONFLICT (company_id) DO UPDATE SET revision = revision + 1; END`
    }),
    ...['INSERT', 'UPDATE'].map((action) => `CREATE TRIGGER invoice_lines_purging_${action.toLowerCase()} BEFORE ${action} ON invoice_lines
      WHEN EXISTS (SELECT 1 FROM invoices i JOIN companies c ON c.id = i.company_id WHERE i.id = NEW.invoice_id AND c.purge_started_at IS NOT NULL)
      BEGIN SELECT RAISE(ABORT, 'Company handover is being finalized'); END`),
    `CREATE TRIGGER companies_data_update AFTER UPDATE OF name, ico, dic, icdph, address, register_line, payroll, tax_account, start_on, ends_on, vat_payer, vat_7a, vat_quarterly, vat_since, tax_office, vat_carry ON companies BEGIN
      INSERT INTO company_data_revisions (company_id, revision) VALUES (NEW.id, 1)
      ON CONFLICT (company_id) DO UPDATE SET revision = revision + 1; END`,
    `CREATE TRIGGER companies_purging_update BEFORE UPDATE OF name, ico, dic, icdph, address, register_line, payroll, tax_account, start_on, ends_on, vat_payer, vat_7a, vat_quarterly, vat_since, tax_office, vat_carry ON companies
      WHEN OLD.purge_started_at IS NOT NULL AND NEW.purged_at IS NULL BEGIN SELECT RAISE(ABORT, 'Company handover is being finalized'); END`,
  ],
  // SV originals survive corrections, cancellation of a mark and reclassification from a quarter to its last month.
  [
    `CREATE TABLE filing_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT, company_id TEXT NOT NULL, kind TEXT NOT NULL, period TEXT NOT NULL,
      archived_at INTEGER NOT NULL, data TEXT NOT NULL
    )`,
    'CREATE INDEX filing_history_company ON filing_history (company_id, kind, period)',
    `CREATE TRIGGER filing_history_update AFTER UPDATE ON filings WHEN OLD.kind = 'sv' AND OLD.data IS NOT NEW.data BEGIN
      INSERT INTO filing_history (company_id, kind, period, archived_at, data) VALUES (OLD.company_id, OLD.kind, OLD.period, unixepoch(),
        json_object('filed_on', OLD.filed_on, 'filed_at', OLD.filed_at, 'filed_by', OLD.filed_by, 'data', OLD.data)); END`,
    `CREATE TRIGGER filing_history_delete BEFORE DELETE ON filings WHEN OLD.kind = 'sv'
      AND NOT EXISTS (SELECT 1 FROM companies WHERE id = OLD.company_id AND purge_started_at IS NOT NULL) BEGIN
      INSERT INTO filing_history (company_id, kind, period, archived_at, data) VALUES (OLD.company_id, OLD.kind, OLD.period, unixepoch(),
        json_object('filed_on', OLD.filed_on, 'filed_at', OLD.filed_at, 'filed_by', OLD.filed_by, 'data', OLD.data)); END`,
    ...['INSERT', 'UPDATE', 'DELETE'].map((action) => {
      const row = action === 'DELETE' ? 'OLD' : 'NEW'
      return `CREATE TRIGGER filing_history_data_${action.toLowerCase()} AFTER ${action} ON filing_history BEGIN
        INSERT INTO company_data_revisions (company_id, revision) VALUES (${row}.company_id, 1)
        ON CONFLICT (company_id) DO UPDATE SET revision = revision + 1; END`
    }),
    ...['INSERT', 'UPDATE'].map((action) => `CREATE TRIGGER filing_history_purging_${action.toLowerCase()} BEFORE ${action} ON filing_history
      WHEN EXISTS (SELECT 1 FROM companies WHERE id = NEW.company_id AND purge_started_at IS NOT NULL)
      BEGIN SELECT RAISE(ABORT, 'Company handover is being finalized'); END`),
  ],
  // A continuous period lock, its transition history and transactional guards on accounting sources.
  PERIOD_SCHEMA,
  CONTRACT_SCHEMA,
  SECURITY_SCHEMA,
  INCIDENT_SCHEMA,
  FILING_SCHEMA,
  PAYROLL_REPORTING_SCHEMA,
  PAYROLL_REVIEW_SCHEMA,
  PAYROLL_HEALTH_SCHEMA,
  PAYROLL_SOCIAL_SCHEMA,
  // 23 (17 October 2026): people who want their investments' tax return (the page /investori), one row an address.
  [
    `CREATE TABLE IF NOT EXISTS investor_requests (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      email TEXT NOT NULL UNIQUE,
      brokers TEXT,
      way TEXT,
      source TEXT,
      privacy_version TEXT NOT NULL
    )`,
  ],
  // 24 (17 October 2026): only a change of the company's records changes the revision a confirmed archive stands
  // for. A bank consent that runs out, a message being read or a company saved without a change touched it before,
  // and so took away the client's confirmation without a reason, and an expired consent of a frozen company aborted
  // the schedule's statement for every company. Reading a message stays possible while a handover is finalized.
  [
    'DROP TRIGGER IF EXISTS bank_links_data_insert',
    'DROP TRIGGER IF EXISTS bank_links_data_update',
    'DROP TRIGGER IF EXISTS bank_links_data_delete',
    'DROP TRIGGER IF EXISTS messages_data_update',
    `CREATE TRIGGER messages_data_update AFTER UPDATE ON messages
      WHEN OLD.company_id IS NOT NEW.company_id OR OLD.created_at IS NOT NEW.created_at OR OLD.author IS NOT NEW.author
        OR OLD.side IS NOT NEW.side OR OLD.body IS NOT NEW.body OR OLD.payment_id IS NOT NEW.payment_id
      BEGIN INSERT INTO company_data_revisions (company_id, revision) VALUES (NEW.company_id, 1)
        ON CONFLICT (company_id) DO UPDATE SET revision = revision + 1; END`,
    'DROP TRIGGER IF EXISTS messages_purging_update',
    `CREATE TRIGGER messages_purging_update BEFORE UPDATE ON messages
      WHEN (OLD.company_id IS NOT NEW.company_id OR OLD.created_at IS NOT NEW.created_at OR OLD.author IS NOT NEW.author
        OR OLD.side IS NOT NEW.side OR OLD.body IS NOT NEW.body OR OLD.payment_id IS NOT NEW.payment_id)
        AND EXISTS (SELECT 1 FROM companies WHERE id = NEW.company_id AND purge_started_at IS NOT NULL)
      BEGIN SELECT RAISE(ABORT, 'Company handover is being finalized'); END`,
    'DROP TRIGGER IF EXISTS companies_data_update',
    `CREATE TRIGGER companies_data_update AFTER UPDATE OF name, ico, dic, icdph, address, register_line, payroll, tax_account, start_on, ends_on, vat_payer, vat_7a, vat_quarterly, vat_since, tax_office, vat_carry ON companies
      WHEN OLD.name IS NOT NEW.name OR OLD.ico IS NOT NEW.ico OR OLD.dic IS NOT NEW.dic OR OLD.icdph IS NOT NEW.icdph
        OR OLD.address IS NOT NEW.address OR OLD.register_line IS NOT NEW.register_line OR OLD.payroll IS NOT NEW.payroll
        OR OLD.tax_account IS NOT NEW.tax_account OR OLD.start_on IS NOT NEW.start_on OR OLD.ends_on IS NOT NEW.ends_on
        OR OLD.vat_payer IS NOT NEW.vat_payer OR OLD.vat_7a IS NOT NEW.vat_7a OR OLD.vat_quarterly IS NOT NEW.vat_quarterly
        OR OLD.vat_since IS NOT NEW.vat_since OR OLD.tax_office IS NOT NEW.tax_office OR OLD.vat_carry IS NOT NEW.vat_carry
      BEGIN INSERT INTO company_data_revisions (company_id, revision) VALUES (NEW.id, 1)
        ON CONFLICT (company_id) DO UPDATE SET revision = revision + 1; END`,
  ],
  // 25 (17 October 2026): Firmony's own invoices to its clients. europio s. r. o. is a company in the app (operator),
  // whose invoices bill what billing_items claims, once for each key; billing_invoices says which client an invoice is
  // for and whether its copy reached the client's documents; billing_tariffs keeps the prices of a paper contract.
  [
    'ALTER TABLE companies ADD COLUMN operator INTEGER NOT NULL DEFAULT 0',
    'CREATE UNIQUE INDEX IF NOT EXISTS companies_operator ON companies (operator) WHERE operator = 1',
    `CREATE TABLE IF NOT EXISTS billing_tariffs (
      company_id TEXT PRIMARY KEY,
      data TEXT NOT NULL CHECK (json_valid(data)),
      created_at INTEGER NOT NULL,
      created_by TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS billing_invoices (
      invoice_id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      month TEXT NOT NULL,
      document_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      created_by TEXT,
      delivered_at INTEGER
    )`,
    'CREATE INDEX IF NOT EXISTS billing_invoices_client ON billing_invoices (client_id, created_at)',
    `CREATE TABLE IF NOT EXISTS billing_items (
      client_id TEXT NOT NULL,
      key TEXT NOT NULL,
      invoice_id TEXT NOT NULL,
      cents INTEGER NOT NULL,
      PRIMARY KEY (client_id, key)
    )`,
  ],
  // 26 (17 October 2026): the register of fixed assets (src/app/assets.ts), every size of company being his word. An
  // asset gives the books its putting in use, each month's depreciation and its disposal, so it is guarded as the
  // books are: nothing of it that reaches a locked period changes, every change moves the company's data revision,
  // and nothing changes while the company is being handed over.
  [
    `CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      number TEXT NOT NULL,
      name TEXT NOT NULL,
      account TEXT NOT NULL CHECK (account IN ('013', '014', '019', '021', '022', '029')),
      document_id TEXT,
      cost_cents INTEGER NOT NULL CHECK (cost_cents > 0),
      in_use_on TEXT NOT NULL,
      tax_group INTEGER CHECK (tax_group IS NULL OR tax_group BETWEEN 0 AND 6),
      tax_method TEXT NOT NULL DEFAULT 'straight' CHECK (tax_method IN ('straight', 'accelerated')),
      car INTEGER NOT NULL DEFAULT 0,
      book_months INTEGER,
      source TEXT NOT NULL DEFAULT 'purchase' CHECK (source IN ('purchase', 'opening')),
      prior_book_cents INTEGER NOT NULL DEFAULT 0,
      prior_tax_cents INTEGER NOT NULL DEFAULT 0,
      prior_tax_years INTEGER NOT NULL DEFAULT 0,
      disposed_on TEXT,
      disposal TEXT CHECK (disposal IS NULL OR disposal IN ('sale', 'liquidation', 'damage', 'gift')),
      note TEXT,
      created_at INTEGER NOT NULL,
      created_by TEXT,
      updated_at INTEGER,
      updated_by TEXT,
      deleted_at INTEGER,
      UNIQUE (company_id, number)
    )`,
    'CREATE INDEX IF NOT EXISTS assets_company ON assets (company_id, in_use_on)',
    ...['INSERT', 'UPDATE', 'DELETE'].flatMap((action) => {
      const row = action === 'DELETE' ? 'OLD' : 'NEW'
      const lockedOn = (r: string, day: string) => `EXISTS (SELECT 1 FROM period_locks l JOIN companies c ON c.id = l.company_id
        WHERE l.company_id = ${r}.company_id AND l.through_on IS NOT NULL AND c.purge_started_at IS NULL AND ${day} <= l.through_on)`
      // What reaches the books from the day of putting in use, or only from a disposal's day when nothing else changes.
      const reach = (r: string) => `(${lockedOn(r, `${r}.in_use_on`)} OR (${r}.disposed_on IS NOT NULL AND ${lockedOn(r, `${r}.disposed_on`)}))`
      const onlyDisposal = `(OLD.name IS NEW.name AND OLD.account IS NEW.account AND OLD.cost_cents IS NEW.cost_cents AND OLD.in_use_on IS NEW.in_use_on
        AND OLD.tax_group IS NEW.tax_group AND OLD.tax_method IS NEW.tax_method AND OLD.car IS NEW.car AND OLD.book_months IS NEW.book_months
        AND OLD.source IS NEW.source AND OLD.prior_book_cents IS NEW.prior_book_cents AND OLD.prior_tax_cents IS NEW.prior_tax_cents
        AND OLD.prior_tax_years IS NEW.prior_tax_years AND OLD.deleted_at IS NEW.deleted_at)`
      const lock =
        action === 'UPDATE'
          ? `CASE WHEN ${onlyDisposal} THEN (OLD.disposed_on IS NOT NEW.disposed_on OR OLD.disposal IS NOT NEW.disposal)
              AND ((OLD.disposed_on IS NOT NULL AND ${lockedOn('OLD', 'OLD.disposed_on')}) OR (NEW.disposed_on IS NOT NULL AND ${lockedOn('NEW', 'NEW.disposed_on')}))
              ELSE (${reach('OLD')} OR ${reach('NEW')}) END`
          : reach(row)
      return [
        `DROP TRIGGER IF EXISTS assets_locked_${action.toLowerCase()}`,
        `CREATE TRIGGER assets_locked_${action.toLowerCase()} BEFORE ${action} ON assets WHEN ${lock}
          BEGIN SELECT RAISE(ABORT, 'FIRMONY_PERIOD_LOCKED'); END`,
        `DROP TRIGGER IF EXISTS assets_data_${action.toLowerCase()}`,
        `CREATE TRIGGER assets_data_${action.toLowerCase()} AFTER ${action} ON assets BEGIN
          INSERT INTO company_data_revisions (company_id, revision) VALUES (${row}.company_id, 1)
          ON CONFLICT (company_id) DO UPDATE SET revision = revision + 1; END`,
        ...(action === 'DELETE'
          ? []
          : [
              `DROP TRIGGER IF EXISTS assets_purging_${action.toLowerCase()}`,
              `CREATE TRIGGER assets_purging_${action.toLowerCase()} BEFORE ${action} ON assets
                WHEN EXISTS (SELECT 1 FROM companies WHERE id = NEW.company_id AND purge_started_at IS NOT NULL)
                BEGIN SELECT RAISE(ABORT, 'Company handover is being finalized'); END`,
            ]),
      ]
    }),
  ],
  // 27 (17 October 2026): stock (src/app/stock.ts). How a company keeps it (continuously, method A, or by its counts,
  // method B, and the valuation of what leaves), its items and their moves. The moves give the books their entries, so
  // they are guarded as the books are; so is a change of the way stock is kept or valued, or of an item's kind, once
  // anything it reaches is in a locked period.
  [
    `CREATE TABLE IF NOT EXISTS stock_settings (
      company_id TEXT PRIMARY KEY,
      method TEXT NOT NULL CHECK (method IN ('A', 'B')),
      valuation TEXT NOT NULL DEFAULT 'average' CHECK (valuation IN ('average', 'fifo')),
      updated_at INTEGER NOT NULL,
      updated_by TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS stock_items (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      unit TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('goods', 'material', 'products')),
      created_at INTEGER NOT NULL,
      created_by TEXT,
      updated_at INTEGER,
      deleted_at INTEGER,
      UNIQUE (company_id, code)
    )`,
    `CREATE TABLE IF NOT EXISTS stock_moves (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      number TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('in', 'out', 'count')),
      on_date TEXT NOT NULL,
      quantity_milli INTEGER NOT NULL CHECK (quantity_milli >= 0 AND quantity_milli <= 1000000000000),
      value_cents INTEGER CHECK (value_cents IS NULL OR (value_cents >= 0 AND value_cents <= 100000000000)),
      document_id TEXT,
      note TEXT,
      created_at INTEGER NOT NULL,
      created_by TEXT,
      deleted_at INTEGER,
      deleted_by TEXT,
      UNIQUE (company_id, number)
    )`,
    'CREATE INDEX IF NOT EXISTS stock_moves_item ON stock_moves (company_id, item_id, on_date)',
    'CREATE INDEX IF NOT EXISTS stock_items_company ON stock_items (company_id, code)',
    ...(() => {
      const lockedOn = (company: string, day: string) => `EXISTS (SELECT 1 FROM period_locks l JOIN companies c ON c.id = l.company_id
        WHERE l.company_id = ${company} AND l.through_on IS NOT NULL AND c.purge_started_at IS NULL AND ${day} <= l.through_on)`
      // Anything of a company's stock, or of one item, in a locked period: a move that is not removed, dated on or before the lock.
      const movesLocked = (company: string, item: string | null) => `EXISTS (SELECT 1 FROM stock_moves m JOIN period_locks l ON l.company_id = m.company_id JOIN companies c ON c.id = m.company_id
        WHERE m.company_id = ${company}${item ? ` AND m.item_id = ${item}` : ''} AND m.deleted_at IS NULL AND l.through_on IS NOT NULL AND c.purge_started_at IS NULL AND m.on_date <= l.through_on)`
      const guards = (table: string, lock: Record<string, string>) =>
        ['INSERT', 'UPDATE', 'DELETE'].flatMap((action) => {
          const row = action === 'DELETE' ? 'OLD' : 'NEW'
          const name = `${table}_${action.toLowerCase()}`
          return [
            ...(lock[action]
              ? [`DROP TRIGGER IF EXISTS ${name}_locked`, `CREATE TRIGGER ${name}_locked BEFORE ${action} ON ${table} WHEN ${lock[action]} BEGIN SELECT RAISE(ABORT, 'FIRMONY_PERIOD_LOCKED'); END`]
              : []),
            `DROP TRIGGER IF EXISTS ${name}_data`,
            `CREATE TRIGGER ${name}_data AFTER ${action} ON ${table} BEGIN
              INSERT INTO company_data_revisions (company_id, revision) VALUES (${row}.company_id, 1)
              ON CONFLICT (company_id) DO UPDATE SET revision = revision + 1; END`,
            ...(action === 'DELETE'
              ? []
              : [
                  `DROP TRIGGER IF EXISTS ${name}_purging`,
                  `CREATE TRIGGER ${name}_purging BEFORE ${action} ON ${table}
                    WHEN EXISTS (SELECT 1 FROM companies WHERE id = NEW.company_id AND purge_started_at IS NOT NULL)
                    BEGIN SELECT RAISE(ABORT, 'Company handover is being finalized'); END`,
                ]),
          ]
        })
      return [
        ...guards('stock_moves', {
          INSERT: lockedOn('NEW.company_id', 'NEW.on_date'),
          UPDATE: `(${lockedOn('OLD.company_id', 'OLD.on_date')} OR ${lockedOn('NEW.company_id', 'NEW.on_date')})`,
          DELETE: lockedOn('OLD.company_id', 'OLD.on_date'),
        }),
        ...guards('stock_items', {
          UPDATE: `(OLD.kind IS NOT NEW.kind OR OLD.deleted_at IS NOT NEW.deleted_at) AND ${movesLocked('OLD.company_id', 'OLD.id')}`,
          DELETE: movesLocked('OLD.company_id', 'OLD.id'),
        }),
        ...guards('stock_settings', {
          INSERT: movesLocked('NEW.company_id', null),
          UPDATE: `(OLD.method IS NOT NEW.method OR OLD.valuation IS NOT NEW.valuation) AND ${movesLocked('OLD.company_id', null)}`,
          DELETE: movesLocked('OLD.company_id', null),
        }),
      ]
    })(),
  ],
  // Full payroll (src/app/pay-month.ts, 17 October 2026): the relationship a person is paid under (an employment, an
  // agreement outside employment, a director's remuneration), a regular income, a pension, the deduction claimed, an
  // hourly wage, the hours of a week, the holiday agreed above the law's; and each sick leave with its daily base. A
  // removed leave is marked, never deleted.
  [
    "ALTER TABLE employees ADD COLUMN contract TEXT NOT NULL DEFAULT 'employment'",
    'ALTER TABLE employees ADD COLUMN regular INTEGER NOT NULL DEFAULT 1',
    "ALTER TABLE employees ADD COLUMN pension TEXT NOT NULL DEFAULT 'none'",
    'ALTER TABLE employees ADD COLUMN exemption INTEGER NOT NULL DEFAULT 0',
    "ALTER TABLE employees ADD COLUMN wage_kind TEXT NOT NULL DEFAULT 'monthly'",
    'ALTER TABLE employees ADD COLUMN weekly_hours INTEGER NOT NULL DEFAULT 4000',
    'ALTER TABLE employees ADD COLUMN leave_days INTEGER',
    `CREATE TABLE IF NOT EXISTS sick_leaves (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      from_on TEXT NOT NULL,
      to_on TEXT,
      dvz INTEGER,
      created_at INTEGER NOT NULL,
      created_by TEXT,
      updated_at INTEGER,
      deleted_at INTEGER,
      deleted_by TEXT
    )`,
    'CREATE INDEX IF NOT EXISTS sick_leaves_employee ON sick_leaves (company_id, employee_id, from_on)',
    ...['INSERT', 'UPDATE', 'DELETE'].flatMap((action) => {
      const row = action === 'DELETE' ? 'OLD' : 'NEW'
      return [
        `CREATE TRIGGER sick_leaves_data_${action.toLowerCase()} AFTER ${action} ON sick_leaves BEGIN
          INSERT INTO company_data_revisions (company_id, revision) VALUES (${row}.company_id, 1)
          ON CONFLICT (company_id) DO UPDATE SET revision = revision + 1; END`,
        ...(action === 'DELETE'
          ? []
          : [
              `CREATE TRIGGER sick_leaves_purging_${action.toLowerCase()} BEFORE ${action} ON sick_leaves
                WHEN EXISTS (SELECT 1 FROM companies WHERE id = NEW.company_id AND purge_started_at IS NOT NULL)
                BEGIN SELECT RAISE(ABORT, 'Company handover is being finalized'); END`,
            ]),
      ]
    }),
  ],  // A health insurer's report of a month covers the people insured with it as employees: a student on a student's
  // agreement and an old-age pensioner on an agreement are left out of it, as the report leaves them out.
  PAYROLL_HEALTH_COVERAGE_SCHEMA,
  // The annual settlement (src/app/tax-settlement.ts, 17 October 2026): an employee's year, what the accountant gave,
  // the result worked out when saved, and the payroll month it is settled in.
  [
    `CREATE TABLE IF NOT EXISTS tax_settlements (
      company_id TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      year INTEGER NOT NULL,
      inputs TEXT NOT NULL,
      result TEXT,
      settle_in TEXT,
      saved_at INTEGER,
      saved_by TEXT,
      PRIMARY KEY (company_id, employee_id, year)
    )`,
    ...['INSERT', 'UPDATE', 'DELETE'].flatMap((action) => {
      const row = action === 'DELETE' ? 'OLD' : 'NEW'
      return [
        `CREATE TRIGGER tax_settlements_data_${action.toLowerCase()} AFTER ${action} ON tax_settlements BEGIN
          INSERT INTO company_data_revisions (company_id, revision) VALUES (${row}.company_id, 1)
          ON CONFLICT (company_id) DO UPDATE SET revision = revision + 1; END`,
        ...(action === 'DELETE'
          ? []
          : [
              `CREATE TRIGGER tax_settlements_purging_${action.toLowerCase()} BEFORE ${action} ON tax_settlements
                WHEN EXISTS (SELECT 1 FROM companies WHERE id = NEW.company_id AND purge_started_at IS NOT NULL)
                BEGIN SELECT RAISE(ABORT, 'Company handover is being finalized'); END`,
            ]),
      ]
    }),
  ],
  // Taking the books over (src/app/takeover.ts, 17 October 2026): the financial statements the accountant before filed,
  // one row a year; the documents and assets of an import marked with it.
  [
    `CREATE TABLE IF NOT EXISTS prior_statements (
      company_id TEXT NOT NULL,
      year INTEGER NOT NULL,
      form TEXT NOT NULL CHECK (form IN ('muj', 'pod')),
      data TEXT NOT NULL,
      file_name TEXT,
      created_at INTEGER NOT NULL,
      created_by TEXT,
      PRIMARY KEY (company_id, year)
    )`,
    'ALTER TABLE documents ADD COLUMN takeover TEXT',
    'ALTER TABLE assets ADD COLUMN takeover TEXT',
    ...['INSERT', 'UPDATE', 'DELETE'].flatMap((action) => {
      const row = action === 'DELETE' ? 'OLD' : 'NEW'
      return [
        `CREATE TRIGGER prior_statements_data_${action.toLowerCase()} AFTER ${action} ON prior_statements BEGIN
          INSERT INTO company_data_revisions (company_id, revision) VALUES (${row}.company_id, 1)
          ON CONFLICT (company_id) DO UPDATE SET revision = revision + 1; END`,
        ...(action === 'DELETE'
          ? []
          : [
              `CREATE TRIGGER prior_statements_purging_${action.toLowerCase()} BEFORE ${action} ON prior_statements
                WHEN EXISTS (SELECT 1 FROM companies WHERE id = NEW.company_id AND purge_started_at IS NOT NULL)
                BEGIN SELECT RAISE(ABORT, 'Company handover is being finalized'); END`,
            ]),
      ]
    }),
  ],
  // Foreign currencies (src/app/fx.ts, 17 October 2026): the ECB's reference rates, the same for every company; the
  // rate a document is converted at, guarded by the period lock like its amount; the currency of a bank account.
  [
    `CREATE TABLE IF NOT EXISTS fx_rates (
      currency TEXT NOT NULL,
      day TEXT NOT NULL,
      rate TEXT NOT NULL,
      fetched_at INTEGER NOT NULL,
      PRIMARY KEY (currency, day)
    )`,
    'ALTER TABLE documents ADD COLUMN fx_rate TEXT',
    'ALTER TABLE accounts ADD COLUMN currency TEXT',
    ...documentsUpdateGuardWith(['fx_rate']),
  ],
  // The one-stop shop (src/app/oss.ts, 17 October 2026): the member state a document's VAT is owed in, the day a company
  // uses the EU scheme from, and each quarter's return as it was filed (its rows and file), changed by nobody after.
  [
    'ALTER TABLE documents ADD COLUMN vat_country TEXT',
    'ALTER TABLE companies ADD COLUMN oss_since TEXT',
    ...documentsUpdateGuardWith(['fx_rate', 'vat_country']),
    `CREATE TABLE IF NOT EXISTS oss_returns (
      company_id TEXT NOT NULL,
      quarter TEXT NOT NULL CHECK (quarter GLOB '[0-9][0-9][0-9][0-9]-Q[1-4]'),
      data TEXT NOT NULL,
      xml TEXT NOT NULL,
      filed_on TEXT NOT NULL,
      filed_at INTEGER NOT NULL,
      filed_by TEXT,
      PRIMARY KEY (company_id, quarter)
    )`,
    ...['INSERT', 'UPDATE', 'DELETE'].flatMap((action) => {
      const row = action === 'DELETE' ? 'OLD' : 'NEW'
      return [
        `CREATE TRIGGER oss_returns_data_${action.toLowerCase()} AFTER ${action} ON oss_returns BEGIN
          INSERT INTO company_data_revisions (company_id, revision) VALUES (${row}.company_id, 1)
          ON CONFLICT (company_id) DO UPDATE SET revision = revision + 1; END`,
        ...(action === 'DELETE'
          ? []
          : [
              `CREATE TRIGGER oss_returns_purging_${action.toLowerCase()} BEFORE ${action} ON oss_returns
                WHEN EXISTS (SELECT 1 FROM companies WHERE id = NEW.company_id AND purge_started_at IS NOT NULL)
                BEGIN SELECT RAISE(ABORT, 'Company handover is being finalized'); END`,
            ]),
      ]
    }),
  ],  // Intrastat (src/app/intrastat.ts, 17 October 2026): a company's settings (the months each flow is reported from and the
  // usual values), what the accountant said of each document's goods, and each filing as it was sent (its reports and file).
  [
    'ALTER TABLE companies ADD COLUMN intrastat TEXT',
    `CREATE TABLE IF NOT EXISTS intrastat_goods (
      company_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      updated_by TEXT,
      PRIMARY KEY (company_id, document_id)
    )`,
    `CREATE TABLE IF NOT EXISTS intrastat_returns (
      company_id TEXT NOT NULL,
      month TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'),
      flow TEXT NOT NULL CHECK (flow IN ('A', 'D')),
      seq INTEGER NOT NULL CHECK (seq >= 1),
      envelope INTEGER NOT NULL,
      data TEXT NOT NULL,
      xml TEXT NOT NULL,
      filed_on TEXT NOT NULL,
      filed_at INTEGER NOT NULL,
      filed_by TEXT,
      PRIMARY KEY (company_id, month, flow, seq)
    )`,
    ...['intrastat_goods', 'intrastat_returns'].flatMap((table) =>
      ['INSERT', 'UPDATE', 'DELETE'].flatMap((action) => {
        const row = action === 'DELETE' ? 'OLD' : 'NEW'
        return [
          `CREATE TRIGGER ${table}_data_${action.toLowerCase()} AFTER ${action} ON ${table} BEGIN
            INSERT INTO company_data_revisions (company_id, revision) VALUES (${row}.company_id, 1)
            ON CONFLICT (company_id) DO UPDATE SET revision = revision + 1; END`,
          ...(action === 'DELETE'
            ? []
            : [
                `CREATE TRIGGER ${table}_purging_${action.toLowerCase()} BEFORE ${action} ON ${table}
                  WHEN EXISTS (SELECT 1 FROM companies WHERE id = NEW.company_id AND purge_started_at IS NOT NULL)
                  BEGIN SELECT RAISE(ABORT, 'Company handover is being finalized'); END`,
              ]),
        ]
      }),
    ),
  ],
  // Joint-stock companies (17 October 2026): the legal form of an order and of a client (rpo.ts, LegalForm), how its
  // statutory body acts as the register says it, the role of the member who concluded the contract, and a year's
  // distribution of its result with the internal document that books it (distribution.ts).
  [
    'ALTER TABLE orders ADD COLUMN legal_form TEXT',
    'ALTER TABLE orders ADD COLUMN acting TEXT',
    'ALTER TABLE orders ADD COLUMN signed_role TEXT',
    'ALTER TABLE companies ADD COLUMN legal_form TEXT',
    'ALTER TABLE companies ADD COLUMN signed_role TEXT',
    'ALTER TABLE closings ADD COLUMN distribution TEXT',
    'ALTER TABLE closings ADD COLUMN distribution_entry TEXT',
  ],
  // A year's distribution kept with a closing whose year is locked (18 October 2026): the closings' period guards
  // leave out the distribution and the revision (period-schema.ts).
  closingsGuardsWithoutDistribution,
  // Credit notes (18 October 2026, invoices.ts): an invoice or a credit note (dobropis) of an invoice issued before,
  // the invoice it corrects and why. Its document names the invoice's number (documents.corrects).
  ["ALTER TABLE invoices ADD COLUMN kind TEXT NOT NULL DEFAULT 'invoice'", 'ALTER TABLE invoices ADD COLUMN corrects TEXT', 'ALTER TABLE invoices ADD COLUMN reason TEXT'],
  // How an issued invoice is taxed (18 October 2026, invoices.ts): Slovak VAT, or a supply to another member state,
  // a service whose customer pays the VAT, an export, a supply outside Slovakia. Its document carries it as a hint
  // the VAT proposal follows until the accountant confirms it (documents.vat_hint, guarded like the rest).
  ['ALTER TABLE invoices ADD COLUMN vat_mode TEXT', 'ALTER TABLE documents ADD COLUMN vat_hint TEXT', ...documentsUpdateGuardWith(['fx_rate', 'vat_country', 'vat_hint'])],
  // Domestic reverse charge on an issued invoice (18 October 2026, vat.ts ReverseGoods): what the control statement's
  // A.2 asks of the supply (the letter of § 69(12), the tariff's code, the quantity and its unit), on the invoice and
  // on its document (a hint until the accountant confirms the document's VAT, then part of it; guarded like the rest).
  ['ALTER TABLE invoices ADD COLUMN vat_reverse TEXT', 'ALTER TABLE documents ADD COLUMN vat_reverse TEXT', ...documentsUpdateGuardWith(['fx_rate', 'vat_country', 'vat_hint', 'vat_reverse'])],
  // Advances (18 October 2026, invoices.ts): a request for an advance (zálohová faktúra, kind 'proforma') numbered in
  // its own row with its own variable symbol, the tax document of an advance received (kind 'advance', § 73) and the
  // final invoice that deducts it, each naming the request it belongs to (relates).
  // A final invoice's document keeps the base of the advances it deducts (documents.advance_cents): the books take it
  // from 324 to the revenue. An advance's line carries the VAT in the payment, and its deduction that VAT again
  // (invoice_lines.vat_cents), since neither is counted from its base.
  [
    'ALTER TABLE invoices ADD COLUMN vs TEXT',
    'ALTER TABLE invoice_lines ADD COLUMN vat_cents INTEGER',
    // One tax document a payment received: a second click, or two at once, makes none.
    'ALTER TABLE invoices ADD COLUMN payment_id TEXT',
    'CREATE UNIQUE INDEX IF NOT EXISTS invoices_payment ON invoices (payment_id) WHERE payment_id IS NOT NULL',
    'ALTER TABLE invoices ADD COLUMN relates TEXT',
    'CREATE INDEX IF NOT EXISTS invoices_vs ON invoices (company_id, vs)',
    // One final invoice a request: a second would deduct the same advances again.
    "CREATE UNIQUE INDEX IF NOT EXISTS invoices_final ON invoices (relates) WHERE kind = 'invoice' AND status = 'issued' AND relates IS NOT NULL",
    'ALTER TABLE documents ADD COLUMN advance_cents INTEGER',
    ...documentsUpdateGuardWith(['fx_rate', 'vat_country', 'vat_hint', 'vat_reverse', 'advance_cents']),
  ],
  // Invoices in another currency (18 October 2026, invoices.ts): the currency, the rate it is converted to euros at
  // (as documents.fx_rate writes it, "1,0845") and the ECB's day of that rate; the document takes both.
  ['ALTER TABLE invoices ADD COLUMN currency TEXT', 'ALTER TABLE invoices ADD COLUMN fx_rate TEXT', 'ALTER TABLE invoices ADD COLUMN fx_day TEXT'],
  // Invoices issued again by themselves (18 October 2026, repeat.ts): an issued invoice repeats every 1, 3 or 12
  // months on the day of the month it keeps (anchor); one repeat that runs per invoice, and one invoice a repeat a day
  // (invoices.repeat_id with its day of issue), so a second run of the schedule issues nothing twice.
  [
    `CREATE TABLE IF NOT EXISTS invoice_repeats (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      template_id TEXT NOT NULL,
      every INTEGER NOT NULL,
      anchor INTEGER NOT NULL,
      next_on TEXT NOT NULL,
      until_on TEXT,
      send INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      created_by TEXT,
      stopped_at INTEGER,
      stopped_by TEXT,
      last_invoice_id TEXT,
      last_on TEXT,
      failed TEXT
    )`,
    'CREATE UNIQUE INDEX IF NOT EXISTS invoice_repeats_template ON invoice_repeats (template_id) WHERE stopped_at IS NULL',
    'CREATE INDEX IF NOT EXISTS invoice_repeats_due ON invoice_repeats (next_on) WHERE stopped_at IS NULL',
    'CREATE INDEX IF NOT EXISTS invoice_repeats_company ON invoice_repeats (company_id)',
    'ALTER TABLE invoices ADD COLUMN repeat_id TEXT',
    'CREATE UNIQUE INDEX IF NOT EXISTS invoices_repeat ON invoices (repeat_id, issued_on) WHERE repeat_id IS NOT NULL',
  ],
  // Payment orders (18 October 2026, payorders.ts): the suppliers' invoices put in one SEPA file for the bank, kept
  // with what each held, so the page knows what is in an order already and the file is made again the same.
  [
    `CREATE TABLE IF NOT EXISTS payment_orders (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      account_iban TEXT NOT NULL,
      execute_on TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      created_by TEXT,
      count INTEGER NOT NULL,
      total_cents INTEGER NOT NULL
    )`,
    'CREATE INDEX IF NOT EXISTS payment_orders_company ON payment_orders (company_id, created_at)',
    `CREATE TABLE IF NOT EXISTS payment_order_items (
      order_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      cents INTEGER NOT NULL,
      iban TEXT NOT NULL,
      vs TEXT,
      party TEXT,
      number TEXT,
      PRIMARY KEY (order_id, document_id)
    )`,
    'CREATE INDEX IF NOT EXISTS payment_order_items_document ON payment_order_items (document_id)',
  ],
  // The customer's state on an invoice (18 October 2026): chosen on the form; without it, the state of the customer's
  // VAT number, else Slovakia (an export to a private person needs it).
  ['ALTER TABLE invoices ADD COLUMN customer_country TEXT'],
  // Approving suppliers' invoices before they are paid (18 October 2026): a company's choice, and who approved a
  // document when. Not the books' business: no period guard covers them.
  [
    'ALTER TABLE companies ADD COLUMN approvals INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE documents ADD COLUMN approved_at INTEGER',
    'ALTER TABLE documents ADD COLUMN approved_by TEXT',
  ],
  // A company's own invoice numbers (18 October 2026, invoices.ts): a prefix, a mark between the year and the order,
  // the order's digits, and the first order of a year (a company that comes in the middle of a year goes on with its
  // row). The variable symbol stays the year and the order (invoices.vs).
  [
    'ALTER TABLE companies ADD COLUMN invoice_prefix TEXT',
    'ALTER TABLE companies ADD COLUMN invoice_sep TEXT',
    'ALTER TABLE companies ADD COLUMN invoice_digits INTEGER',
    'ALTER TABLE companies ADD COLUMN invoice_from_year INTEGER',
    'ALTER TABLE companies ADD COLUMN invoice_from INTEGER',
  ],
  // The company's logo on its invoices (18 October 2026): a picture in R2 (companies/<id>/brand/), its type.
  ['ALTER TABLE companies ADD COLUMN logo_key TEXT', 'ALTER TABLE companies ADD COLUMN logo_type TEXT'],
  // A supplier's prepayment invoice (386) read from its file (18 October 2026, after the review): it documents money
  // paid already, so the payment orders never offer it.
  ['ALTER TABLE documents ADD COLUMN prepaid INTEGER NOT NULL DEFAULT 0'],
  // Business trips at home (18 October 2026, trips.ts): who travelled where and when, the meals given free, the private
  // car, what it came to as worked out then, and the document it made (owed to the person on 333). A trip is removed by
  // a mark, while its document is neither booked nor paired; its number is never given again.
  [
    `CREATE TABLE IF NOT EXISTS trips (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      year INTEGER NOT NULL,
      seq INTEGER NOT NULL,
      number TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      created_by TEXT,
      traveller TEXT NOT NULL,
      employee_id TEXT,
      iban TEXT,
      purpose TEXT NOT NULL,
      place_from TEXT NOT NULL,
      place_to TEXT NOT NULL,
      start_at TEXT NOT NULL,
      end_at TEXT NOT NULL,
      transport TEXT NOT NULL,
      plate TEXT,
      car TEXT,
      meals TEXT NOT NULL DEFAULT '{}',
      result TEXT NOT NULL,
      total_cents INTEGER NOT NULL,
      document_id TEXT,
      removed_at INTEGER,
      removed_by TEXT,
      UNIQUE (company_id, year, seq)
    )`,
    'CREATE INDEX IF NOT EXISTS trips_company ON trips (company_id, created_at)',
    'CREATE INDEX IF NOT EXISTS trips_document ON trips (document_id)',
    ...['INSERT', 'UPDATE', 'DELETE'].map((action) => {
      const row = action === 'DELETE' ? 'OLD' : 'NEW'
      return `CREATE TRIGGER trips_data_${action.toLowerCase()} AFTER ${action} ON trips BEGIN
        INSERT INTO company_data_revisions (company_id, revision) VALUES (${row}.company_id, 1)
        ON CONFLICT (company_id) DO UPDATE SET revision = revision + 1; END`
    }),
    ...['INSERT', 'UPDATE'].map(
      (action) => `CREATE TRIGGER trips_purging_${action.toLowerCase()} BEFORE ${action} ON trips
      WHEN EXISTS (SELECT 1 FROM companies WHERE id = NEW.company_id AND purge_started_at IS NOT NULL)
      BEGIN SELECT RAISE(ABORT, 'Company handover is being finalized'); END`,
    ),
  ],
  // The cash box (18 October 2026, cash.ts): cash documents are ledger entries of their own kind ('cash', PPD and VPD
  // numbered by year), with what they are, who paid or was paid, the invoice one pays in cash (once) and the bank
  // payment that took cash out of the bank or put it in.
  [
    'ALTER TABLE ledger_entries ADD COLUMN cash_kind TEXT',
    'ALTER TABLE ledger_entries ADD COLUMN party TEXT',
    'ALTER TABLE ledger_entries ADD COLUMN document_id TEXT',
    'ALTER TABLE ledger_entries ADD COLUMN payment_id TEXT',
    "CREATE UNIQUE INDEX IF NOT EXISTS ledger_entries_cash_document ON ledger_entries (document_id) WHERE kind = 'cash' AND deleted_at IS NULL AND document_id IS NOT NULL",
    "CREATE UNIQUE INDEX IF NOT EXISTS ledger_entries_cash_payment ON ledger_entries (payment_id) WHERE kind = 'cash' AND deleted_at IS NULL AND payment_id IS NOT NULL",
  ],
  // Reminders and late interest (18 October 2026, dunning.ts): a company's choice to remind its customers by itself,
  // how many reminders went for an invoice, and an invoice of late interest's invoice paid late (one an invoice).
  [
    'ALTER TABLE companies ADD COLUMN dunning INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE invoices ADD COLUMN reminders INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE invoices ADD COLUMN interest_of TEXT',
    "CREATE UNIQUE INDEX IF NOT EXISTS invoices_interest ON invoices (interest_of) WHERE interest_of IS NOT NULL AND status = 'issued'",
  ],
  // Cost centres (18 October 2026, centers.ts): the company's own division of its costs and revenues, and the centre of
  // each document (management information: no period guard holds it).
  [
    `CREATE TABLE IF NOT EXISTS cost_centers (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      created_by TEXT,
      archived_at INTEGER,
      UNIQUE (company_id, code)
    )`,
    'ALTER TABLE documents ADD COLUMN center_id TEXT',
    'CREATE INDEX IF NOT EXISTS documents_center ON documents (company_id, center_id) WHERE center_id IS NOT NULL',
    ...['INSERT', 'UPDATE', 'DELETE'].map((action) => {
      const row = action === 'DELETE' ? 'OLD' : 'NEW'
      return `CREATE TRIGGER cost_centers_data_${action.toLowerCase()} AFTER ${action} ON cost_centers BEGIN
        INSERT INTO company_data_revisions (company_id, revision) VALUES (${row}.company_id, 1)
        ON CONFLICT (company_id) DO UPDATE SET revision = revision + 1; END`
    }),
    ...['INSERT', 'UPDATE'].map(
      (action) => `CREATE TRIGGER cost_centers_purging_${action.toLowerCase()} BEFORE ${action} ON cost_centers
      WHEN EXISTS (SELECT 1 FROM companies WHERE id = NEW.company_id AND purge_started_at IS NOT NULL)
      BEGIN SELECT RAISE(ABORT, 'Company handover is being finalized'); END`,
    ),
  ],
  // After the review of reminders (18 October 2026): a locked period no longer stops sending or reminding an issued
  // invoice (the guard holds the columns of the invoice as filed); late interest may be invoiced again for the days
  // after the last invoice of it (each to its own last day, `interest_to`), and a credit note of an interest invoice
  // carries the link too (the unique index counts invoices of interest only).
  [
    ...invoicesUpdateGuard,
    'ALTER TABLE invoices ADD COLUMN interest_to TEXT',
    'DROP INDEX IF EXISTS invoices_interest',
    "CREATE UNIQUE INDEX IF NOT EXISTS invoices_interest ON invoices (interest_of, interest_to) WHERE interest_of IS NOT NULL AND status = 'issued' AND kind = 'invoice'",
  ],
  // The day's takings of an eKasa till (18 October 2026, takings.ts): a document of its own (source 'takings'), its
  // cash part (the rest by card); the documents' lock guard made again with it, since it is what the books take.
  ['ALTER TABLE documents ADD COLUMN takings_cash INTEGER', ...documentsUpdateGuardWith(['fx_rate', 'vat_country', 'vat_hint', 'vat_reverse', 'advance_cents', 'takings_cash'])],
  // Approving for larger companies (18 October 2026, approvals.ts): colleagues an owner makes approvers, each with a
  // limit; two approvals from an amount, the first kept on the document. Management, not the books: no period guard.
  [
    'ALTER TABLE members ADD COLUMN approver INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE members ADD COLUMN approve_limit INTEGER',
    'ALTER TABLE companies ADD COLUMN approval_two_from INTEGER',
    'ALTER TABLE documents ADD COLUMN first_approved_at INTEGER',
    'ALTER TABLE documents ADD COLUMN first_approved_by TEXT',
  ],
  // After the review of the takings (18 October 2026): one day's closing once, by its number, or without one by its total.
  [
    `CREATE UNIQUE INDEX IF NOT EXISTS documents_takings ON documents (company_id, issued_on, COALESCE(number, ''), (CASE WHEN number IS NULL THEN total_cents ELSE 0 END))
       WHERE source = 'takings' AND deleted_at IS NULL`,
  ],
  // After the review of approving (18 October 2026): who typed a supplier's IBAN, so that a colleague who typed it never
  // approves that invoice himself (approvals.ts).
  ['ALTER TABLE documents ADD COLUMN iban_by TEXT'],
  // Meals of employees (18 October 2026, meals.ts): each employee's choice of vouchers or the financial contribution.
  ['ALTER TABLE employees ADD COLUMN meal_way TEXT'],
  // Budgets of cost centres (18 October 2026, centers.ts): a centre's revenues and costs planned for a year; the centre
  // a supplier's rule remembers.
  [
    `CREATE TABLE IF NOT EXISTS cost_center_budgets (
      company_id TEXT NOT NULL,
      center_id TEXT NOT NULL,
      year INTEGER NOT NULL,
      revenue INTEGER NOT NULL DEFAULT 0,
      costs INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      updated_by TEXT,
      PRIMARY KEY (center_id, year)
    )`,
    'CREATE INDEX IF NOT EXISTS cost_center_budgets_company ON cost_center_budgets (company_id, year)',
    // A supplier's rule remembers the cost centre too, given to the supplier's next documents that have none.
    'ALTER TABLE supplier_rules ADD COLUMN center_id TEXT',
    ...['INSERT', 'UPDATE', 'DELETE'].map((action) => {
      const row = action === 'DELETE' ? 'OLD' : 'NEW'
      return `CREATE TRIGGER cost_center_budgets_data_${action.toLowerCase()} AFTER ${action} ON cost_center_budgets BEGIN
        INSERT INTO company_data_revisions (company_id, revision) VALUES (${row}.company_id, 1)
        ON CONFLICT (company_id) DO UPDATE SET revision = revision + 1; END`
    }),
    ...['INSERT', 'UPDATE'].map(
      (action) => `CREATE TRIGGER cost_center_budgets_purging_${action.toLowerCase()} BEFORE ${action} ON cost_center_budgets
      WHEN EXISTS (SELECT 1 FROM companies WHERE id = NEW.company_id AND purge_started_at IS NOT NULL)
      BEGIN SELECT RAISE(ABORT, 'Company handover is being finalized'); END`,
    ),
  ],
  // Payroll by cost centre (18 October 2026, centers.ts): the centre an employee's cost of work goes to; the centre an
  // invoice is issued for, which its document takes.
  ['ALTER TABLE employees ADD COLUMN center_id TEXT', 'ALTER TABLE invoices ADD COLUMN center_id TEXT'],
  // Deductions from wages for an execution (18 October 2026, garnish.ts): each claim an executor ordered, and the persons
  // an employee maintains (the protected amount).
  [
    `CREATE TABLE IF NOT EXISTS wage_garnishments (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      minor INTEGER NOT NULL DEFAULT 0,
      persons INTEGER NOT NULL DEFAULT 0,
      creditor TEXT NOT NULL,
      reference TEXT,
      iban TEXT,
      vs TEXT,
      started_on TEXT NOT NULL,
      order_on TEXT,
      total_cents INTEGER,
      monthly_cents INTEGER,
      ended_on TEXT,
      created_at INTEGER NOT NULL,
      created_by TEXT,
      updated_at INTEGER,
      deleted_at INTEGER
    )`,
    'CREATE INDEX IF NOT EXISTS wage_garnishments_employee ON wage_garnishments (company_id, employee_id)',
    'ALTER TABLE employees ADD COLUMN dependents INTEGER NOT NULL DEFAULT 0',
    ...['INSERT', 'UPDATE', 'DELETE'].map((action) => {
      const row = action === 'DELETE' ? 'OLD' : 'NEW'
      return `CREATE TRIGGER wage_garnishments_data_${action.toLowerCase()} AFTER ${action} ON wage_garnishments BEGIN
        INSERT INTO company_data_revisions (company_id, revision) VALUES (${row}.company_id, 1)
        ON CONFLICT (company_id) DO UPDATE SET revision = revision + 1; END`
    }),
    ...['INSERT', 'UPDATE'].map(
      (action) => `CREATE TRIGGER wage_garnishments_purging_${action.toLowerCase()} BEFORE ${action} ON wage_garnishments
      WHEN EXISTS (SELECT 1 FROM companies WHERE id = NEW.company_id AND purge_started_at IS NOT NULL)
      BEGIN SELECT RAISE(ABORT, 'Company handover is being finalized'); END`,
    ),
  ],
  // The proportional deduction of VAT (18 October 2026, vat-ratio.ts): a company's coefficient of a year and the year's
  // settlement once confirmed; the coefficient a received document was deducted by, and an issued one left out of it.
  [
    `CREATE TABLE IF NOT EXISTS vat_ratios (
      company_id TEXT NOT NULL,
      year INTEGER NOT NULL CHECK (year BETWEEN 2000 AND 2100),
      coef INTEGER NOT NULL CHECK (coef BETWEEN 0 AND 100),
      how TEXT NOT NULL CHECK (how IN ('previous', 'estimate')),
      settled TEXT CHECK (settled IS NULL OR json_valid(settled)),
      settled_at INTEGER,
      settled_by TEXT,
      changed_at INTEGER NOT NULL,
      changed_by TEXT NOT NULL,
      PRIMARY KEY (company_id, year)
    )`,
    'ALTER TABLE documents ADD COLUMN vat_ratio INTEGER CHECK (vat_ratio IS NULL OR vat_ratio BETWEEN 0 AND 100)',
    "ALTER TABLE documents ADD COLUMN ratio_mode TEXT CHECK (ratio_mode IS NULL OR ratio_mode IN ('right', 'none', 'skip', 'final'))",
    ...vatRatiosGuards,
    ...['INSERT', 'UPDATE', 'DELETE'].map((action) => {
      const row = action === 'DELETE' ? 'OLD' : 'NEW'
      return `CREATE TRIGGER vat_ratios_data_${action.toLowerCase()} AFTER ${action} ON vat_ratios BEGIN
        INSERT INTO company_data_revisions (company_id, revision) VALUES (${row}.company_id, 1)
        ON CONFLICT (company_id) DO UPDATE SET revision = revision + 1; END`
    }),
    ...['INSERT', 'UPDATE'].map(
      (action) => `CREATE TRIGGER vat_ratios_purging_${action.toLowerCase()} BEFORE ${action} ON vat_ratios
      WHEN EXISTS (SELECT 1 FROM companies WHERE id = NEW.company_id AND purge_started_at IS NOT NULL)
      BEGIN SELECT RAISE(ABORT, 'Company handover is being finalized'); END`,
    ),
  ],
  // Depreciation by cost centre (18 October 2026, centers.ts): the centre an asset serves.
  ['ALTER TABLE assets ADD COLUMN center_id TEXT'],
  // Stock by cost centre (18 October 2026, centers.ts): the centre an item's stock belongs to.
  ['ALTER TABLE stock_items ADD COLUMN center_id TEXT'],
  // After the review of the proportional deduction (18 October 2026): the coefficient a document was deducted by and its
  // mark for the coefficient change what a locked period holds, so the documents' guard covers them.
  [...documentsUpdateGuardWith(['fx_rate', 'vat_country', 'vat_hint', 'vat_reverse', 'advance_cents', 'takings_cash', 'vat_ratio', 'ratio_mode'])],
  // After the review of § 53b (18 October 2026): a received invoice's corrections are read with it (PAID_ON_COLUMN in
  // store.ts), found by the company and the number they correct.
  ['CREATE INDEX IF NOT EXISTS documents_corrects ON documents (company_id, corrects) WHERE corrects IS NOT NULL'],
  // The supplier's bad debts (18 October 2026, bad-debt.ts, § 25a): an issued invoice's claim lowered once uncollectible,
  // and raised again after a payment that comes later, each with its corrective document (OD-<year>-<order>) when one is
  // issued; removed only by a mark, so a number is never given twice.
  [
    `CREATE TABLE IF NOT EXISTS bad_debts (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('reduce', 'restore')),
      ground TEXT CHECK (ground IS NULL OR ground IN ('a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'c1', 'c2', 'c3', 'd', 'e1', 'e2', 'f')),
      event_on TEXT NOT NULL,
      year INTEGER,
      seq INTEGER,
      number TEXT,
      issued_on TEXT,
      sent_on TEXT,
      lines TEXT NOT NULL CHECK (json_valid(lines)),
      cents INTEGER NOT NULL CHECK (cents > 0),
      evidence TEXT CHECK (evidence IS NULL OR length(evidence) <= 1000),
      payment_id TEXT,
      created_at INTEGER NOT NULL,
      created_by TEXT NOT NULL,
      deleted_at INTEGER,
      deleted_by TEXT
    )`,
    'CREATE INDEX IF NOT EXISTS bad_debts_document ON bad_debts (document_id)',
    'CREATE INDEX IF NOT EXISTS bad_debts_company ON bad_debts (company_id, event_on)',
    "CREATE UNIQUE INDEX IF NOT EXISTS bad_debts_reduce ON bad_debts (document_id) WHERE deleted_at IS NULL AND kind = 'reduce'",
    "CREATE UNIQUE INDEX IF NOT EXISTS bad_debts_restore ON bad_debts (document_id, event_on) WHERE deleted_at IS NULL AND kind = 'restore'",
    'CREATE UNIQUE INDEX IF NOT EXISTS bad_debts_number ON bad_debts (company_id, year, seq) WHERE seq IS NOT NULL',
    ...badDebtsGuards,
    ...['INSERT', 'UPDATE', 'DELETE'].map((action) => {
      const row = action === 'DELETE' ? 'OLD' : 'NEW'
      return `CREATE TRIGGER bad_debts_data_${action.toLowerCase()} AFTER ${action} ON bad_debts BEGIN
        INSERT INTO company_data_revisions (company_id, revision) VALUES (${row}.company_id, 1)
        ON CONFLICT (company_id) DO UPDATE SET revision = revision + 1; END`
    }),
    ...['INSERT', 'UPDATE'].map(
      (action) => `CREATE TRIGGER bad_debts_purging_${action.toLowerCase()} BEFORE ${action} ON bad_debts
      WHEN EXISTS (SELECT 1 FROM companies WHERE id = NEW.company_id AND purge_started_at IS NOT NULL)
      BEGIN SELECT RAISE(ABORT, 'Company handover is being finalized'); END`,
    ),
  ],
  // The adjustment of the deduction on investment property (18 October 2026, vat-assets.ts, § 54 to § 54d): an asset's
  // VAT as the accountant gives it, one row an asset, and each change of its use from a year, removed only by a mark.
  [
    `CREATE TABLE IF NOT EXISTS asset_vat (
      asset_id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      lines TEXT NOT NULL CHECK (json_valid(lines)),
      first_year INTEGER NOT NULL CHECK (first_year BETWEEN 1990 AND 2100),
      deducted INTEGER NOT NULL CHECK (deducted BETWEEN 0 AND 100),
      business INTEGER NOT NULL DEFAULT 100 CHECK (business BETWEEN 0 AND 100),
      regime TEXT NOT NULL CHECK (regime IN ('fixed', 'ratio')),
      sale TEXT CHECK (sale IS NULL OR sale IN ('taxed', 'exempt')),
      changed_at INTEGER NOT NULL,
      changed_by TEXT NOT NULL
    )`,
    'CREATE INDEX IF NOT EXISTS asset_vat_company ON asset_vat (company_id)',
    `CREATE TABLE IF NOT EXISTS asset_vat_uses (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      from_year INTEGER NOT NULL CHECK (from_year BETWEEN 1990 AND 2100),
      use TEXT NOT NULL CHECK (use IN ('taxable', 'exempt', 'ratio', 'share')),
      share INTEGER CHECK (share IS NULL OR share BETWEEN 0 AND 100),
      business INTEGER NOT NULL DEFAULT 100 CHECK (business BETWEEN 0 AND 100),
      created_at INTEGER NOT NULL,
      created_by TEXT NOT NULL,
      deleted_at INTEGER,
      deleted_by TEXT
    )`,
    'CREATE INDEX IF NOT EXISTS asset_vat_uses_asset ON asset_vat_uses (asset_id)',
    'CREATE UNIQUE INDEX IF NOT EXISTS asset_vat_uses_year ON asset_vat_uses (asset_id, from_year) WHERE deleted_at IS NULL',
    ...assetVatGuards,
    ...['asset_vat', 'asset_vat_uses'].flatMap((table) => [
      ...['INSERT', 'UPDATE', 'DELETE'].map((action) => {
        const row = action === 'DELETE' ? 'OLD' : 'NEW'
        return `CREATE TRIGGER ${table}_data_${action.toLowerCase()} AFTER ${action} ON ${table} BEGIN
          INSERT INTO company_data_revisions (company_id, revision) VALUES (${row}.company_id, 1)
          ON CONFLICT (company_id) DO UPDATE SET revision = revision + 1; END`
      }),
      ...['INSERT', 'UPDATE'].map(
        (action) => `CREATE TRIGGER ${table}_purging_${action.toLowerCase()} BEFORE ${action} ON ${table}
        WHEN EXISTS (SELECT 1 FROM companies WHERE id = NEW.company_id AND purge_started_at IS NOT NULL)
        BEGIN SELECT RAISE(ABORT, 'Company handover is being finalized'); END`,
      ),
    ]),
  ],
  // The accountants paid for the work done (20 October 2026, team/work-pay.ts): her month's events are read by user
  // and time, and whether a document, a period or a company was dealt with before by its subject.
  ['CREATE INDEX IF NOT EXISTS events_user ON events (user_id, at)', 'CREATE INDEX IF NOT EXISTS events_subject ON events (subject, action, at)'],
  // What the reader proposed for a document, as it proposed it (20 October 2026, team/ai-accuracy.ts): written once when
  // the document is read and never by the booking, so the page "Presnosť softvéru" compares it with what was booked.
  ['ALTER TABLE documents ADD COLUMN reading TEXT'],
  // What the site last told IndexNow of its public pages (20 October 2026, robots.ts `announceSite`): one row a kind
  // of notice, nobody's data.
  ['CREATE TABLE IF NOT EXISTS site_state (key TEXT PRIMARY KEY, value TEXT NOT NULL, at INTEGER NOT NULL)'],
  // Documents the app books by itself where the accountant turned it on for a client (20 October 2026, app/autobook.ts);
  // such a document is booked by 'auto'. The index finds them for her month's check.
  ['ALTER TABLE companies ADD COLUMN autobook INTEGER NOT NULL DEFAULT 0', 'CREATE INDEX IF NOT EXISTS documents_auto ON documents (company_id, booked_at) WHERE booked_by = \'auto\''],
  // 73: AML admission and immutable verification evidence (21 October 2026).
  AML_SCHEMA,
  // 74: full five-year AML retention and restricted archival access.
  AML_RETENTION_SCHEMA,
  // 75: confidential findings and retention before a contract exists.
  AML_PROSPECT_SCHEMA,
  // 76: original account and first-payment evidence for high-risk remote admission.
  AML_ENHANCED_SCHEMA,
  // 77: source-bound professional review of automatic bookings.
  AML_AUTO_REVIEW_SCHEMA,
  // 78: managed takeover requests, professional workflow and retained revision evidence.
  MANAGED_HANDOVER_SCHEMA,
  // 79: bounded cloud topic routing, immutable usage evidence and the operational switch.
  ASSISTANT_SCHEMA,
  // 80: company formation requests, professional workflow and retained revision evidence.
  FORMATION_SCHEMA,
  // 81: AML re-evaluation after a list update, the place of business, fresh checks on a review, retained former members
  // and dropped bank payments (findings of two independent reviews, 26 October 2026).
  AML_POLICY_SCHEMA,
  // 82: invoicing for everyone (26 October 2026, app/invoicing.ts): a workspace of a business's invoices alone, kept apart
  // from the books by triggers; an invoice paid by the user's word; sign-ups waiting for their link. Also: the
  // assistant's use moves the data revision only on the client's side.
  INVOICING_SCHEMA,
  // 83: first-party analytics in daily sums (analytics/schema.ts).
  ANALYTICS_SCHEMA,
  // 84: e-invoices through the Peppol network (peppol/): the SML's answers kept a while, sendings with their state,
  // what the network delivered.
  PEPPOL_SCHEMA,
  // 85: signing in with a passkey alone, without an email link (security/schema.ts).
  PASSKEY_SIGNIN_SCHEMA,
  // 86: the s. r. o. for 1 €: a founder's application, the designated person's checks and its history, kept as written;
  // the company formed through it and its prepayment to credit (founding/schema.ts).
  FOUNDING_SCHEMA,
  // 87: the EU's and the UN's sanctions lists as last read, for the screening the designated person confirms
  // (aml/sanctions-schema.ts).
  SANCTIONS_SCHEMA,
  // 88: what is left to pay of a document when it says less than its total (a credit, a balance or an overpayment set
  // off, the amount due of an e-invoice); null when it is the total (europio as client zero, 29 October 2026).
  ['ALTER TABLE documents ADD COLUMN due_cents INTEGER CHECK (due_cents IS NULL OR due_cents >= 0)'],
  // 89: an e-mail left on the site to start (his word of 29 October 2026: the e-mail first, kept at every send): one row an
  // address, where on the site and from which campaign, and the one reminder when the request was not finished.
  [
    `CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      last_at INTEGER NOT NULL,
      times INTEGER NOT NULL DEFAULT 1,
      place TEXT,
      source TEXT,
      privacy_version TEXT NOT NULL,
      reminded_at INTEGER
    )`,
    'CREATE INDEX IF NOT EXISTS leads_last ON leads (last_at)',
  ],
  // 90: the overview's check by Claude (his word of 29 October 2026, team/overview-check.ts): what it said, without
  // anything of a person, who asked and what it cost; kept half a year.
  [
    `CREATE TABLE IF NOT EXISTS admin_checks (
      id TEXT PRIMARY KEY,
      at INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      result TEXT NOT NULL CHECK (json_valid(result))
    )`,
    'CREATE INDEX IF NOT EXISTS admin_checks_at ON admin_checks (at)',
  ],
]

/** The next bank account's analytic account of a company (221.001, 221.002 ...), as SQL over ?1, the company. */
export const NEXT_BANK_LEDGER = `(SELECT printf('221.%03d', COALESCE(MAX(CAST(substr(ledger, 5) AS INTEGER)), 0) + 1) FROM accounts WHERE company_id = ?1)`

export const SCHEMA_VERSION = MIGRATIONS.length

let ready: Promise<void> | null = null

/** Brings the database up to date, once per isolate. A failure is tried again on the next request. */
export function ensureSchema(db: D1Database): Promise<void> {
  if (!ready) {
    ready = migrate(db).catch((err) => {
      ready = null
      throw err
    })
  }
  return ready
}

async function migrate(db: D1Database): Promise<void> {
  await db.prepare('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)').run()
  const row = await db.prepare("SELECT value FROM meta WHERE key = 'schema'").first<{ value: string }>()
  const at = Number(row?.value ?? 0)
  for (let step = at; step < MIGRATIONS.length; step++) {
    const statements = (MIGRATIONS[step] ?? []).map((sql) => db.prepare(sql))
    statements.push(db.prepare("INSERT INTO meta (key, value) VALUES ('schema', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(String(step + 1)))
    await db.batch(statements)
  }
}

/** A SHA-256 of a text, as hex. Counters hold only hashes, never an address or an email. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Counts one more use of something within a window and says whether it is still within the limit. The count and
 * the answer are one statement, so requests that arrive at the same moment cannot all slip through.
 */
export async function withinLimit(db: D1Database, kind: string, who: string, limit: number, windowSeconds: number): Promise<boolean> {
  const key = await sha256Hex(`${kind}:${who}`)
  const ts = now()
  const bucket = Math.floor(ts / windowSeconds)
  const row = await db
    .prepare(
      `INSERT INTO throttle (key, bucket, hits, expires_at) VALUES (?1, ?2, 1, ?3)
       ON CONFLICT(key, bucket) DO UPDATE SET hits = hits + 1
       RETURNING hits`,
    )
    .bind(key, bucket, (bucket + 1) * windowSeconds + RETENTION.throttleHours * 3600)
    .first<{ hits: number }>()
  return (row?.hits ?? limit + 1) <= limit
}

export interface NewRequest {
  id: string
  ico: string | null
  company: string | null
  address: string | null
  companySource: 'register' | 'manual' | null
  plan: string
  situation: string
  name: string
  email: string
  phone: string | null
  note: string | null
  source: string | null
  privacyVersion: string
}

export function insertRequestStatement(db: D1Database, r: NewRequest): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO requests (id, created_at, ico, company, address, company_source, plan, situation, name, email, phone, note, source, privacy_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(r.id, now(), r.ico, r.company, r.address, r.companySource, r.plan, r.situation, r.name, r.email, r.phone, r.note, r.source, r.privacyVersion)
}

/**
 * Somebody who wants the investors' tax return: one row an address, its last answer counts. Kept a year from the
 * last time the address was sent, like a request.
 */
export function upsertInvestorStatement(db: D1Database, r: { email: string; brokers: string[]; way: string | null; source: string | null; privacyVersion: string }): D1PreparedStatement {
  const ts = now()
  return db
    .prepare(
      `INSERT INTO investor_requests (id, created_at, updated_at, email, brokers, way, source, privacy_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET updated_at = excluded.updated_at, brokers = COALESCE(excluded.brokers, investor_requests.brokers),
         way = COALESCE(excluded.way, investor_requests.way), privacy_version = excluded.privacy_version`,
    )
    .bind(crypto.randomUUID(), ts, ts, r.email.toLowerCase(), r.brokers.length > 0 ? r.brokers.join(',') : null, r.way, r.source, r.privacyVersion)
}

/**
 * An e-mail left on the site to start (schema step 89): one row an address, its last send counts for the place and the
 * campaign, kept a year from the last send like a request. Returns the row's id, the same for the same address.
 */
export function upsertLeadStatement(db: D1Database, r: { email: string; place: string | null; source: string | null; privacyVersion: string }, ts: number = now()): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO leads (id, email, created_at, last_at, times, place, source, privacy_version) VALUES (?, ?, ?, ?, 1, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET last_at = excluded.last_at, times = leads.times + 1, place = COALESCE(excluded.place, leads.place),
         source = COALESCE(excluded.source, leads.source), privacy_version = excluded.privacy_version
       RETURNING id`,
    )
    .bind(crypto.randomUUID(), r.email.trim().toLowerCase(), ts, ts, r.place, r.source, r.privacyVersion)
}

/** What the privacy notice promises: investors' sign-ups a year, sent and received email ninety days, counters two days. Requests: aml/prospects.ts. */
export async function purge(db: D1Database): Promise<void> {
  const ts = now()
  await db.batch([
    // Client/prospect records are erased only by the full AML retention workflow (app/purge.ts, aml/prospects.ts).
    db.prepare('DELETE FROM investor_requests WHERE updated_at < ?').bind(ts - RETENTION.requestDays * 86400),
    db.prepare('DELETE FROM leads WHERE last_at < ?').bind(ts - RETENTION.requestDays * 86400),
    db.prepare('DELETE FROM outbox WHERE created_at < ?').bind(ts - RETENTION.outboxDays * 86400),
    db.prepare('DELETE FROM inbound_mail WHERE company_id IS NULL AND received_at < ?').bind(ts - RETENTION.outboxDays * 86400),
    db.prepare('DELETE FROM throttle WHERE expires_at < ?').bind(ts),
    // A sign-up of invoicing not finished: kept a week past its link (the privacy notice says 8 days at most).
    db.prepare('DELETE FROM invoicing_signups WHERE expires_at < ?').bind(ts - 7 * 86400),
    // Which part of the app a person used on a day: 13 months (analytics/model.ts); the daily sums stay.
    db.prepare('DELETE FROM analytics_usage WHERE day < ?').bind(usageCutoff(bratislavaDay(ts))),
    // The daily sums of the site and the app: two years, the dashboard reads at most ninety days.
    db.prepare('DELETE FROM analytics_site WHERE day < ?').bind(bratislavaDay(ts - 731 * 86400)),
    db.prepare('DELETE FROM analytics_routes WHERE day < ?').bind(bratislavaDay(ts - 731 * 86400)),
    // A passkey sign-in's challenge: five minutes at most, forgotten the next day.
    db.prepare('DELETE FROM signin_challenges WHERE expires_at < ?').bind(ts - 86400),
  ])
}
