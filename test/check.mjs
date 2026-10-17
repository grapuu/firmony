// A tiny reporter: every check prints one line, a failure sets the exit code.
let failed = 0
let passed = 0
let completed = false
// An unreferenced worker can let Node exit with an unresolved top-level await.
// A partial log must never be reported as a successful suite.
process.once('beforeExit', () => {
  if (!completed) {
    console.error('FAIL test suite ended before its completion marker')
    process.exitCode = 1
  }
})
export function check(name, ok, detail = '') {
  if (ok) passed += 1
  else failed += 1
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : `: ${detail}`}`)
}
export function done(suite) {
  completed = true
  console.log(failed ? `${suite}: ${failed} FAILED of ${passed + failed}` : `${suite}: all ${passed} passed`)
  if (failed) process.exitCode = 1
}
