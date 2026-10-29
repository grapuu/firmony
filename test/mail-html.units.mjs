// The look of every email (src/mail-html.ts, 29 October 2026): the logo on top, the same words as the text part, a
// link to Firmony as a button with its address under it, every other address a plain link, nothing unescaped, and the
// company the law asks a business letter to name.
import { check } from './check.mjs'
import { mailHtml, bells } from '../.wrangler/tmp/units-bundle.mjs'

export function checkMailHtmlUnits() {
  const b = bells.bell.answer('https://firmony.io/app/spravy')
  const html = mailHtml.mailHtml(b.subject, b.body)
  check('mail: the logo of the site heads every email, as a PNG with the name as its alt', html.includes('src="https://firmony.io/art/mail-logo.png"') && html.includes('alt="Firmony"'))
  check('mail: a link to Firmony on its own line is a button, with the address under it', html.includes('>Otvoriť vo Firmony</a>') && html.includes('href="https://firmony.io/app/spravy"') && (html.match(/https:\/\/firmony\.io\/app\/spravy/g) ?? []).length === 3)
  const flat = html.replace(/[\u00a0\u202f]/g, ' ')
  check('mail: every line of the text is there', b.body.split('\n').filter((l) => l.trim() && !l.startsWith('https://')).every((l) => flat.includes(l.replace(/'/g, '&#39;'))))
  check('mail: the company is named as on a business letter', html.includes('europio s. r. o.') && html.includes('IČO 57 442 452') && html.includes('vložka č. 64897/V'))
  const other = mailHtml.mailHtml('A <b>', 'Dobrý deň,\n\n<script>x</script> a "quote" & more\n\nhttps://evil.example/login\n\nSee https://firmony.io/podmienky.')
  check('mail: nothing of the text is taken as HTML', !other.includes('<script>x') && other.includes('&lt;script&gt;x&lt;/script&gt;') && other.includes('&quot;quote&quot; &amp; more') && other.includes('<title>A &lt;b&gt;</title>'))
  check('mail: an address that is not ours is never a button', (other.match(/Otvoriť vo Firmony/g) ?? []).length === 0 && other.includes('href="https://evil.example/login"'))
  check('mail: an address in a sentence leaves the full stop outside the link', other.includes('href="https://firmony.io/podmienky"') && other.includes('podmienky</a>.'))
  check('mail: the inbox preview is the first sentence after the greeting', flat.includes('vo Firmony na Vás čaká nová správa'))
}
