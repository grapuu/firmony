import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser'

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
for (const form of document.querySelectorAll<HTMLFormElement>('form[data-passkey]')) {
  const button = form.querySelector<HTMLButtonElement>('button[type=submit]')
  if (!button) continue
  if (!browserSupportsWebAuthn()) {
    showError('Tento prehliadač nepodporuje prihlasovacie kľúče. Použite podporovaný prehliadač alebo zariadenie.')
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
      const options = await post('/auth/options', {
        action,
        next: fields.get('next'),
        code: fields.get('code'),
      })
      const response =
        action === 'register' ? await startRegistration({ optionsJSON: options.options }) : await startAuthentication({ optionsJSON: options.options })
      const result = await post('/auth/verify', {
        id: options.id,
        response,
        name: fields.get('name'),
      })
      window.location.assign(result.to)
    } catch (e) {
      showError(e instanceof ResponseError ? e.message : 'Potvrdenie nebolo dokončené. Skúste to znova alebo použite iný prihlasovací kľúč.')
      button.disabled = false
    }
  })
}
