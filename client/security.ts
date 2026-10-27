import { browserSupportsWebAuthn, browserSupportsWebAuthnAutofill, startAuthentication, startRegistration } from '@simplewebauthn/browser'

const error = document.querySelector<HTMLElement>('[data-auth-error]')
class ResponseError extends Error {}
const showError = (message: string) => {
  if (error) {
    error.textContent = message
    error.hidden = false
    error.focus()
  }
}
async function post(path: string, body: unknown) {
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    redirect: 'error',
  })
  const json = await res.json()
  if (!res.ok) throw new ResponseError(typeof json.error === 'string' ? json.error : 'Overenie sa nepodarilo.')
  return json
}
// Signing in with a passkey alone has endpoints of its own (no session yet); the rest work for the session.
const PATHS: Record<string, { options: string; verify: string }> = {
  signin: { options: '/app/prihlasenie/kluc/moznosti', verify: '/app/prihlasenie/kluc/overit' },
}
for (const form of document.querySelectorAll<HTMLFormElement>('form[data-passkey]')) {
  const button = form.querySelector<HTMLButtonElement>('button[type=submit]')
  if (!button) continue
  if (!browserSupportsWebAuthn()) {
    // On the sign-in page the email link stays the way in; elsewhere the person is told why nothing happens.
    if (form.dataset.hideUnsupported) form.hidden = true
    else showError('Tento prehliadač nepodporuje prihlasovacie kľúče. Použite podporovaný prehliadač alebo zariadenie.')
    continue
  }
  button.disabled = false
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    button.disabled = true
    if (error) error.hidden = true
    try {
      const fields = new FormData(form),
        action = form.dataset.passkey
      const paths = PATHS[action ?? ''] ?? { options: '/auth/options', verify: '/auth/verify' }
      const options = await post(paths.options, {
        action,
        next: fields.get('next'),
        code: fields.get('code'),
      })
      const response =
        action === 'register' ? await startRegistration({ optionsJSON: options.options }) : await startAuthentication({ optionsJSON: options.options })
      const result = await post(paths.verify, {
        id: options.id,
        response,
        name: fields.get('name'),
        next: fields.get('next'),
      })
      window.location.assign(result.to)
    } catch (e) {
      showError(e instanceof ResponseError ? e.message : 'Potvrdenie nebolo dokončené. Skúste to znova alebo použite iný prihlasovací kľúč.')
      button.disabled = false
    }
  })
}

// The password manager offers the saved sign-in right in the email field, as Google or Amazon do. A press of the button
// takes its place (the library aborts this one), and anything that ends it quietly leaves the page as it was.
const autofill = document.querySelector<HTMLInputElement>("input[autocomplete$='webauthn']")
if (autofill && browserSupportsWebAuthn()) {
  void (async () => {
    if (!(await browserSupportsWebAuthnAutofill())) return
    const paths = { options: '/app/prihlasenie/kluc/moznosti', verify: '/app/prihlasenie/kluc/overit' }
    const next = document.querySelector<HTMLInputElement>('form[data-passkey="signin"] input[name=next]')?.value ?? null
    const options = await post(paths.options, { action: 'signin', next })
    let response
    try {
      response = await startAuthentication({ optionsJSON: options.options, useBrowserAutofill: true })
    } catch {
      return
    }
    try {
      const result = await post(paths.verify, { id: options.id, response, next })
      window.location.assign(result.to)
    } catch (e) {
      showError(e instanceof ResponseError ? e.message : 'Prihlásenie sa nepodarilo. Skúste to znova.')
    }
  })().catch(() => undefined)
}
