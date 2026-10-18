// SQL shared by the migration and automatic matching. Guards run inside the write transaction, including imports.
const activeLock = (company: string) => `SELECT l.through_on FROM period_locks l JOIN companies c ON c.id = l.company_id
  WHERE l.company_id = ${company} AND l.through_on IS NOT NULL AND c.purge_started_at IS NULL`
const locked = (company: string, date: string) => `EXISTS (${activeLock(company)} AND ${date} <= l.through_on)`

/** Bratislava's calendar day, including the EU daylight-saving boundaries at 01:00 UTC. */
export const localDaySql = (seconds: string) => `date(${seconds}, 'unixepoch', CASE WHEN
  ${seconds} >= unixepoch(strftime('%Y', ${seconds}, 'unixepoch') || '-03-31', '-6 days', 'weekday 0', '+1 hours') AND
  ${seconds} < unixepoch(strftime('%Y', ${seconds}, 'unixepoch') || '-10-31', '-6 days', 'weekday 0', '+1 hours')
  THEN '+2 hours' ELSE '+1 hours' END)`
export const docDaySql = (row: string) => `COALESCE(${row}.supplied_on, ${row}.issued_on, ${localDaySql(`${row}.created_at`)})`
const periodStart = (period: string) => `(CASE WHEN substr(${period}, 6, 1) = 'Q'
  THEN substr(${period}, 1, 4) || printf('-%02d-01', (CAST(substr(${period}, 7, 1) AS INTEGER) - 1) * 3 + 1)
  ELSE substr(${period}, 1, 7) || '-01' END)`
const postedDocLocked = (row: string) => `(${row}.booked_at IS NOT NULL AND ${row}.deleted_at IS NULL AND
  (${locked(`${row}.company_id`, docDaySql(row))} OR (${row}.vat_period IS NOT NULL AND ${locked(`${row}.company_id`, periodStart(`${row}.vat_period`))})))`
const paymentLocked = (id: string) => `EXISTS (SELECT 1 FROM payments p WHERE p.id = ${id} AND ${locked('p.company_id', 'p.booked_on')})`

/** A pair can change both the document's entry and every receipt/payment sharing the bank movement. */
export const linkLockedSql = (payment: string, doc: string) => `(${paymentLocked(payment)} OR
  EXISTS (SELECT 1 FROM documents d WHERE d.id = ${doc} AND ${postedDocLocked('d')}) OR
  EXISTS (SELECT 1 FROM links k JOIN documents d ON d.id = k.document_id WHERE k.payment_id = ${payment} AND ${postedDocLocked('d')}))`

const changed = (columns: string[]) => columns.map((col) => `OLD.${col} IS NOT NEW.${col}`).join(' OR ')
const guard = (table: string, action: string, condition: string) => `CREATE TRIGGER ${table}_locked_${action.toLowerCase()} BEFORE ${action} ON ${table}
  WHEN ${condition} BEGIN SELECT RAISE(ABORT, 'FIRMONY_PERIOD_LOCKED'); END`
const rowsGuard = (table: string, condition: (row: string) => string, columns?: string[]) => [
  guard(table, 'INSERT', condition('NEW')),
  guard(table, 'UPDATE', `${columns ? `(${changed(columns)}) AND ` : ''}(${condition('OLD')} OR ${condition('NEW')})`),
  guard(table, 'DELETE', condition('OLD')),
]
const dependentDoc = (row: string) => `EXISTS (SELECT 1 FROM links k JOIN documents d ON d.id = k.document_id
  WHERE k.payment_id = ${row}.id AND ${postedDocLocked('d')})`
const docLinked = (row: string) => `EXISTS (SELECT 1 FROM links k WHERE k.document_id = ${row}.id AND ${paymentLocked('k.payment_id')})`
const paymentFields = [
  'id',
  'company_id',
  'account_id',
  'booked_on',
  'amount_cents',
  'currency',
  'party',
  'party_iban',
  'vs',
  'note',
  'exempt',
  'exempt_note',
  'contra',
]
const docFields = [
  'id',
  'company_id',
  'created_at',
  'kind',
  'party',
  'number',
  'issued_on',
  'due_on',
  'total_cents',
  'vat_cents',
  'currency',
  'category',
  'vat_deduct',
  'account',
  'booked_at',
  'paid_privately',
  'deleted_at',
  'supplied_on',
  'vat_mode',
  'vat_lines',
  'party_vat_id',
  'corrects',
  'vat_period',
  'foreign_party',
]
const companyFields = ['id', 'start_on', 'vat_payer', 'vat_7a', 'vat_quarterly', 'vat_since', 'vat_carry']
const actorAllowed = (row: string) => `EXISTS (SELECT 1 FROM users u JOIN companies c ON c.id = ${row}.company_id
  WHERE u.id = ${row}.changed_by AND (u.team = 'admin' OR (u.team = 'accountant' AND c.accountant_id = u.id)) AND c.purge_started_at IS NULL)`

/** The documents' update guard made again with the columns added after it (step 32: the rate of a foreign currency). */
export const documentsUpdateGuardWith = (columns: string[]): string[] => [
  'DROP TRIGGER IF EXISTS documents_locked_update',
  guard('documents', 'UPDATE', `(${changed([...docFields, ...columns])}) AND ((${postedDocLocked('OLD')} OR ${docLinked('OLD')}) OR (${postedDocLocked('NEW')} OR ${docLinked('NEW')}))`),
]

/**
 * The issued invoices' update guard made again (step 53) with the columns that make the invoice as filed and booked:
 * its number, customer, days, amounts, taxation and currency. Sending it, reminding it, the customer's email typed to
 * send it to and the count of reminders are no accounting case, and a locked period no longer stops them.
 */
const INVOICE_FIELDS = [
  'id',
  'company_id',
  'status',
  'year',
  'seq',
  'number',
  'customer_name',
  'customer_ico',
  'customer_dic',
  'customer_icdph',
  'customer_address',
  'customer_country',
  'issued_on',
  'delivered_on',
  'due_on',
  'base_cents',
  'vat_cents',
  'total_cents',
  'document_id',
  'kind',
  'corrects',
  'vat_mode',
  'vat_reverse',
  'relates',
  'vs',
  'payment_id',
  'currency',
  'fx_rate',
  'interest_of',
]
export const invoicesUpdateGuard: string[] = [
  'DROP TRIGGER IF EXISTS invoices_locked_update',
  guard('invoices', 'UPDATE', `(${changed(INVOICE_FIELDS)}) AND ((OLD.status = 'issued' AND ${locked('OLD.company_id', 'OLD.issued_on')}) OR (NEW.status = 'issued' AND ${locked('NEW.company_id', 'NEW.issued_on')}))`),
]

/**
 * The closings' guards made again (step 36) so that a year's distribution, decided after the year by the general
 * meeting and booked on its own days, may be kept with a closing whose year is locked: the closing's own fields stay
 * guarded, the distribution's and the revision's do not, and an empty row may be made to hold it. The distribution's
 * documents are guarded by their own days like every other.
 */
const CLOSING_FIELDS = ['inputs', 'saved_at', 'saved_by', 'extended_to', 'tax_entry', 'filed_on', 'filed_at', 'filed_by', 'filed', 'pay_cents', 'due_on']
export const closingsGuardsWithoutDistribution: string[] = [
  'DROP TRIGGER IF EXISTS closings_locked_insert',
  'DROP TRIGGER IF EXISTS closings_locked_update',
  guard('closings', 'INSERT', `(${CLOSING_FIELDS.map((f) => `NEW.${f} IS NOT NULL`).join(' OR ')}) AND ${locked('NEW.company_id', "NEW.year || '-12-31'")}`),
  guard('closings', 'UPDATE', `(${changed(['company_id', 'year', ...CLOSING_FIELDS])}) AND (${locked('OLD.company_id', "OLD.year || '-12-31'")} OR ${locked('NEW.company_id', "NEW.year || '-12-31'")})`),
]

/**
 * The proportional deduction's years (step 62, vat-ratio.ts): a year's coefficient and settlement change its last
 * period's return and its books on 31 December, so nothing of a year changes once that day is locked.
 */
export const vatRatiosGuards: string[] = rowsGuard('vat_ratios', (r) => locked(`${r}.company_id`, `${r}.year || '-12-31'`))

/**
 * The supplier's bad debts (step 67, bad-debt.ts): a lowering or a raising changes the return of its day's period and the
 * books on that day, so nothing of it changes once the day is locked but the day its document was sent and what proves it.
 */
export const badDebtsGuards: string[] = rowsGuard('bad_debts', (r) => locked(`${r}.company_id`, `${r}.event_on`), [
  'company_id',
  'document_id',
  'kind',
  'ground',
  'event_on',
  'number',
  'issued_on',
  'lines',
  'cents',
  'payment_id',
  'deleted_at',
])

export const PERIOD_SCHEMA: string[] = [
  `CREATE TABLE period_locks (
    company_id TEXT PRIMARY KEY, through_on TEXT, version INTEGER NOT NULL CHECK (version > 0), change_id TEXT NOT NULL UNIQUE,
    changed_at INTEGER NOT NULL, changed_by TEXT NOT NULL, reason TEXT NOT NULL CHECK (length(reason) <= 1000),
    CHECK (through_on IS NULL OR (through_on GLOB '[12][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]' AND date(through_on) IS NOT NULL AND through_on = date(through_on, 'start of month', '+1 month', '-1 day')))
  )`,
  `CREATE TABLE period_lock_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT, company_id TEXT NOT NULL, version INTEGER NOT NULL, change_id TEXT NOT NULL UNIQUE,
    before_on TEXT, through_on TEXT, changed_at INTEGER NOT NULL, changed_by TEXT NOT NULL, reason TEXT NOT NULL,
    UNIQUE (company_id, version)
  )`,
  `CREATE TRIGGER period_locks_validate_insert BEFORE INSERT ON period_locks WHEN
    NOT (${actorAllowed('NEW')}) OR (NOT EXISTS (SELECT 1 FROM period_locks WHERE company_id = NEW.company_id) AND (NEW.version <> 1 OR NEW.through_on IS NULL))
    OR NEW.through_on >= ${localDaySql('unixepoch()')}
    BEGIN SELECT RAISE(ABORT, 'FIRMONY_LOCK_INVALID'); END`,
  `CREATE TRIGGER period_locks_validate_update BEFORE UPDATE ON period_locks WHEN
    NOT (${actorAllowed('NEW')}) OR NEW.company_id <> OLD.company_id OR NEW.version <> OLD.version + 1
    OR NEW.change_id = OLD.change_id OR NEW.through_on IS OLD.through_on
    OR NEW.through_on >= ${localDaySql('unixepoch()')}
    OR ((NEW.through_on IS NULL OR NEW.through_on < OLD.through_on) AND length(trim(NEW.reason)) < 10)
    BEGIN SELECT RAISE(ABORT, 'FIRMONY_LOCK_INVALID'); END`,
  ...['INSERT', 'UPDATE'].map(
    (action) => `CREATE TRIGGER period_locks_history_${action.toLowerCase()} AFTER ${action} ON period_locks BEGIN
    INSERT INTO period_lock_history (company_id, version, change_id, before_on, through_on, changed_at, changed_by, reason)
    VALUES (NEW.company_id, NEW.version, NEW.change_id, ${action === 'INSERT' ? 'NULL' : 'OLD.through_on'}, NEW.through_on, NEW.changed_at, NEW.changed_by, NEW.reason); END`,
  ),
  `CREATE TRIGGER period_lock_history_validate BEFORE INSERT ON period_lock_history WHEN
    NOT EXISTS (SELECT 1 FROM period_locks l WHERE l.company_id = NEW.company_id AND l.version = NEW.version AND l.change_id = NEW.change_id
      AND l.through_on IS NEW.through_on AND l.changed_at = NEW.changed_at AND l.changed_by = NEW.changed_by AND l.reason = NEW.reason)
    OR NEW.version <> COALESCE((SELECT MAX(version) FROM period_lock_history WHERE company_id = NEW.company_id), 0) + 1
    OR NEW.before_on IS NOT (SELECT through_on FROM period_lock_history WHERE company_id = NEW.company_id ORDER BY version DESC LIMIT 1)
    BEGIN SELECT RAISE(ABORT, 'FIRMONY_LOCK_HISTORY'); END`,
  `CREATE TRIGGER period_locks_keep BEFORE DELETE ON period_locks WHEN NOT EXISTS
    (SELECT 1 FROM companies WHERE id = OLD.company_id AND purge_started_at IS NOT NULL)
    BEGIN SELECT RAISE(ABORT, 'FIRMONY_LOCK_HISTORY'); END`,
  ...['UPDATE', 'DELETE'].map(
    (action) => `CREATE TRIGGER period_lock_history_keep_${action.toLowerCase()} BEFORE ${action} ON period_lock_history
    WHEN NOT EXISTS (SELECT 1 FROM companies WHERE id = OLD.company_id AND purge_started_at IS NOT NULL)
    BEGIN SELECT RAISE(ABORT, 'FIRMONY_LOCK_HISTORY'); END`,
  ),
  ...['period_locks', 'period_lock_history'].flatMap((table) => [
    ...['INSERT', 'UPDATE', 'DELETE'].map(
      (action) => `CREATE TRIGGER ${table}_data_${action.toLowerCase()} AFTER ${action} ON ${table} BEGIN
      INSERT INTO company_data_revisions (company_id, revision) VALUES (${action === 'DELETE' ? 'OLD' : 'NEW'}.company_id, 1)
      ON CONFLICT (company_id) DO UPDATE SET revision = revision + 1; END`,
    ),
    ...['INSERT', 'UPDATE'].map(
      (action) => `CREATE TRIGGER ${table}_purging_${action.toLowerCase()} BEFORE ${action} ON ${table}
      WHEN EXISTS (SELECT 1 FROM companies WHERE id = NEW.company_id AND purge_started_at IS NOT NULL)
      BEGIN SELECT RAISE(ABORT, 'Company handover is being finalized'); END`,
    ),
  ]),
  // Any opening entry changes booksStart(), even if the new opening is dated after the cutoff.
  ...rowsGuard(
    'ledger_entries',
    (r) =>
      `(${r}.deleted_at IS NULL AND (${locked(`${r}.company_id`, `${r}.on_date`)} OR (${r}.kind = 'opening' AND EXISTS (${activeLock(`${r}.company_id`)}))))`,
  ),
  // Unbooked late documents may still arrive and be read. Posting, or editing a dependency of a locked payment, needs reopening.
  ...rowsGuard('documents', (r) => `(${postedDocLocked(r)} OR ${docLinked(r)})`, docFields),
  guard('payments', 'INSERT', `(${locked('NEW.company_id', 'NEW.booked_on')} AND (NEW.exempt IS NOT NULL OR NEW.contra IS NOT NULL))`),
  guard(
    'payments',
    'UPDATE',
    `(${changed(paymentFields)}) AND
    (${locked('OLD.company_id', 'OLD.booked_on')} OR ${locked('NEW.company_id', 'NEW.booked_on')} OR ${dependentDoc('OLD')} OR ${dependentDoc('NEW')})`,
  ),
  guard('payments', 'DELETE', `(${locked('OLD.company_id', 'OLD.booked_on')} OR ${dependentDoc('OLD')})`),
  ...rowsGuard('links', (r) => linkLockedSql(`${r}.payment_id`, `${r}.document_id`)),
  guard('accounts', 'UPDATE', `(${changed(['id', 'company_id', 'iban', 'ledger'])}) AND EXISTS (${activeLock('OLD.company_id')})`),
  guard('accounts', 'DELETE', `EXISTS (${activeLock('OLD.company_id')})`),
  guard('companies', 'UPDATE', `(${changed(companyFields)}) AND EXISTS (${activeLock('OLD.id')})`),
  guard('companies', 'DELETE', `EXISTS (${activeLock('OLD.id')})`),
  ...['filings', 'payroll_runs'].flatMap((table) => rowsGuard(table, (r) => locked(`${r}.company_id`, periodStart(`${r}.period`)))),
  ...rowsGuard(
    'vat_returns',
    (r) => `(${locked(`${r}.company_id`, periodStart(`${r}.period`))} OR ${locked(`${r}.company_id`, `${r}.filed_on`)} OR
    EXISTS (${activeLock(`${r}.company_id`)} AND EXISTS (SELECT 1 FROM json_tree(CASE WHEN json_valid(${r}.prev) THEN ${r}.prev ELSE '{}' END) j
      WHERE j.key IN ('filedOn', 'filed_on') AND j.type = 'text' AND j.value <= l.through_on)))`,
  ),
  ...rowsGuard('closings', (r) => locked(`${r}.company_id`, `${r}.year || '-12-31'`)),
  ...rowsGuard('invoices', (r) => `(${r}.status = 'issued' AND ${locked(`${r}.company_id`, `${r}.issued_on`)})`),
  ...rowsGuard(
    'invoice_lines',
    (r) => `EXISTS (SELECT 1 FROM invoices i WHERE i.id = ${r}.invoice_id AND i.status = 'issued' AND ${locked('i.company_id', 'i.issued_on')})`,
  ),
]
