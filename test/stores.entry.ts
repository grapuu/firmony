// Real storage functions exercised against the same local D1 as the runtime, including deliberately stale revisions.
export { bookTaxStatements, closingsOf, fileClosingStatement, saveInputsStatement } from '../src/app/closing-store'
export { payslip } from '../src/app/payroll'
export { exportYears, exportYear } from '../src/app/export'
export { beginExport, completeExport, confirmExport, dataRevision, confirmedRevision } from '../src/app/handover-store'
export { fileSummaryStatement, svFiledOf, svViewOf, svViewsOf, summariesFiled, docsAround } from '../src/app/vat-store'
export { companyOf } from '../src/app/store'
export { summaryXml } from '../src/app/vat-xml'
export { teamDeadlines } from '../src/team/deadlines-store'
