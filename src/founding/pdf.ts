// The founder's contract as a PDF to sign: the text fixed when it was given (foundings.contract_text, whose SHA-256 the
// signature is checked against), its articles as headings, and the hash printed at its end so that the designated person
// can see that the signed file is this text and no other.
import { pdfText, type PdfBlock } from '../app/pdf'
import { BRAND } from '../config'
import { FORMATION_CONTRACT_TITLE } from '../content/formation-contract'

export function foundingContractPdf(text: string, hash: string, vs: string): string {
  const blocks: PdfBlock[] = []
  for (const line of text.split('\n')) {
    if (line === FORMATION_CONTRACT_TITLE) blocks.push({ kind: 'title', text: line })
    else if (/^\d+\. /.test(line) || /^Príloha/.test(line)) blocks.push({ kind: 'heading', text: line })
    else if (line.trim() !== '') blocks.push({ kind: 'text', text: line })
  }
  blocks.push(
    { kind: 'heading', text: 'Odtlačok zmluvy' },
    { kind: 'text', text: `SHA-256 textu zmluvy: ${hash}` },
    { kind: 'text', text: 'Podpíšte tento súbor kvalifikovaným elektronickým podpisom (napríklad v aplikácii D.Signer na slovensko.sk) a nahrajte podpísaný súbor v prihláške. Alebo ho vytlačte, podpíšte a sken nahrajte; totožnosť Vám potom overíme na krátkom osobnom stretnutí, kde si prevezmeme aj originál.' },
  )
  return pdfText({ title: `${BRAND.name}: ${FORMATION_CONTRACT_TITLE}`, header: { left: `${BRAND.name} | Založenie s. r. o.`, right: `VS ${vs}` }, blocks })
}
