// Real storage functions exercised against the same local D1 as the runtime, including deliberately stale revisions.
export { bookTaxStatements, closingsOf, fileClosingStatement, saveInputsStatement } from '../src/app/closing-store'
export { payslip } from '../src/app/payroll'
export { exportYears, exportYear } from '../src/app/export'
export { beginExport, completeExport, confirmExport, dataRevision, confirmedRevision } from '../src/app/handover-store'
