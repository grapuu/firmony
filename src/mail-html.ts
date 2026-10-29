// The look of every email (his word of 29 October 2026: "do toho mailu ešte treba dať naše logo"). The outbox keeps a
// message as plain text, which stays its text part; this makes the HTML part from the same words when it is sent, so
// nothing in it can say more than the text does. The head is the glass F beside the name (public/art/mail-logo.png,
// made by `scripts/art.py mail`), loaded from the site: a mail program shows a PNG, and the name is in the picture
// because an email cannot load our typeface. A line that is only a link to Firmony becomes a button with the address
// under it, so the reader sees where it leads; any other address is a plain link. Styles are inline because mail
// programs drop a stylesheet; the site's own rule against inline styles is for pages under our CSP, not for email.
import { BRAND, OPERATOR } from './config'
import { typeset } from './format'

const IMPRINT = `${BRAND.name} je služba spoločnosti`
const LOGO = { src: `${BRAND.origin}/art/mail-logo.png`, width: 190, height: 48 }
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
const INK = '#0d1330'
const TEXT = '#2b3150'
const MUTED = '#6b7190'
const BLUE = '#1c2ef0'
const MIST = '#f5f6fb'
const LINE = '#e5e8f1'

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/** Text as the site sets it (a one-letter word or a number never ends a line), made safe for HTML. */
const words = (s: string) => escape(typeset(s))

/** An address in running text, without the full stop, comma or bracket that ends the sentence after it. */
const URL = /https?:\/\/[^\s<>"']+/g
function linked(line: string): string {
  let out = ''
  let at = 0
  for (const m of line.matchAll(URL)) {
    let url = m[0]
    const tail = /[.,;:!?)\]]+$/.exec(url)?.[0] ?? ''
    url = url.slice(0, url.length - tail.length)
    out += words(line.slice(at, m.index)) + `<a href="${escape(url)}" style="color:${BLUE};text-decoration:underline;word-break:break-all">${escape(url)}</a>${escape(tail)}`
    at = (m.index ?? 0) + m[0].length
  }
  return out + words(line.slice(at))
}

/** A line that is one of our addresses and nothing else. */
const ours = (line: string) => /^https?:\/\/\S+$/.test(line) && (line === BRAND.origin || line.startsWith(`${BRAND.origin}/`))

function button(url: string): string {
  const href = escape(url)
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 6px"><tr><td style="border-radius:12px;background:${BLUE}">` +
    `<a href="${href}" style="display:inline-block;padding:14px 26px;font-family:${FONT};font-size:16px;font-weight:600;line-height:20px;color:#ffffff;text-decoration:none;border-radius:12px">Otvoriť vo Firmony</a>` +
    `</td></tr></table>` +
    `<p style="margin:0 0 20px;font-size:13px;line-height:1.5;color:${MUTED};word-break:break-all"><a href="${href}" style="color:${MUTED};text-decoration:underline">${href}</a></p>`
  )
}

/** The HTML part of a message whose text part is `body`. */
export function mailHtml(subject: string, body: string): string {
  const paragraphs = body
    .replace(/\r\n/g, '\n')
    .split(/\n[ \t]*\n/)
    .map((p) => p.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim() !== ''))
    .filter((p) => p.length > 0)
    // The text part ends with who we are (an email is a business letter); the HTML says it once, in its footer.
    .filter((p) => !p.join(' ').trim().startsWith(IMPRINT))
  // What the inbox shows beside the subject: the first sentence after the greeting, not the logo's name.
  const preview = (paragraphs[1] ?? paragraphs[0] ?? []).join(' ').slice(0, 140)
  const blocks = paragraphs
    .map((lines) =>
      lines.length === 1 && ours(lines[0]!.trim())
        ? button(lines[0]!.trim())
        : `<p style="margin:0 0 16px">${lines.map(linked).join('<br>')}</p>`,
    )
    .join('')
  return [
    '<!doctype html>',
    '<html lang="sk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">',
    `<title>${escape(subject)}</title></head>`,
    `<body style="margin:0;padding:0;background:${MIST};-webkit-text-size-adjust:100%">`,
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${MIST}">${escape(preview)}</div>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${MIST}"><tr><td align="center" style="padding:28px 12px 32px">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">`,
    `<tr><td style="padding:0 6px 18px"><a href="${BRAND.origin}" style="text-decoration:none"><img src="${LOGO.src}" width="${LOGO.width}" height="${LOGO.height}" alt="${BRAND.name}" style="display:block;border:0;outline:none;width:${LOGO.width}px;height:${LOGO.height}px;font-family:${FONT};font-size:22px;font-weight:700;color:${BLUE}"></a></td></tr>`,
    `<tr><td style="background:#ffffff;border:1px solid ${LINE};border-radius:18px;padding:30px 28px 18px;font-family:${FONT};font-size:16px;line-height:1.6;color:${TEXT}">`,
    `<div style="color:${TEXT}">${blocks}</div>`,
    '</td></tr>',
    `<tr><td style="padding:18px 8px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${MUTED}">`,
    `<strong style="color:${INK};font-weight:600">${BRAND.name}</strong> · <a href="${BRAND.origin}" style="color:${MUTED}">${escape(BRAND.origin.replace(/^https:\/\//, ''))}</a> · <a href="mailto:${BRAND.email}" style="color:${MUTED}">${BRAND.email}</a><br>`,
    `${escape(`${OPERATOR.name}, ${OPERATOR.street}, ${OPERATOR.postalCity}, IČO ${OPERATOR.companyId}, zapísaná ${OPERATOR.registeredIn}`)}`,
    '</td></tr></table>',
    '</td></tr></table>',
    '</body></html>',
  ].join('\n')
}
