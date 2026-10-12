// A tiny reporter: every check prints one line, a failure sets the exit code.
let failed = 0
let passed = 0
export function check(name, ok, detail = '') {
  if (ok) passed += 1
  else failed += 1
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : `: ${detail}`}`)
}
export function done(suite) {
  console.log(failed ? `${suite}: ${failed} FAILED of ${passed + failed}` : `${suite}: all ${passed} passed`)
  if (failed) process.exitCode = 1
}
