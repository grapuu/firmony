// The company's logo as an invoice's PDF embeds it, decoded once and kept beside the picture (the review of 26 October
// 2026: a PDF anyone may open must not decode a picture each time). The kept file sits in the company's folder of
// pictures, so the same deletions take it; a new logo has a new key and so a new kept file.
import { logoImage, type PdfImage } from './invoice-pdf'

const SUFFIX = '.pdfimage'

function pack(image: PdfImage | null): Uint8Array {
  const head = new TextEncoder().encode(
    JSON.stringify(image ? { filter: image.filter, width: image.width, height: image.height, colorSpace: image.colorSpace, data: image.data.length, alpha: image.alpha?.length ?? null } : { none: true }),
  )
  const out = new Uint8Array(4 + head.length + (image?.data.length ?? 0) + (image?.alpha?.length ?? 0))
  new DataView(out.buffer).setUint32(0, head.length)
  out.set(head, 4)
  if (image) {
    out.set(image.data, 4 + head.length)
    if (image.alpha) out.set(image.alpha, 4 + head.length + image.data.length)
  }
  return out
}

/** The kept image; undefined when the file is not one of ours (then it is made again). */
function unpack(bytes: Uint8Array): PdfImage | null | undefined {
  try {
    if (bytes.length < 4) return undefined
    const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0)
    if (length > 1024 || 4 + length > bytes.length) return undefined
    const head = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + length))) as Record<string, unknown>
    if (head.none === true) return null
    const data = Number(head.data)
    const alpha = head.alpha === null ? null : Number(head.alpha)
    if (!Number.isInteger(data) || (alpha !== null && !Number.isInteger(alpha)) || 4 + length + data + (alpha ?? 0) !== bytes.length) return undefined
    if (head.filter !== 'DCTDecode' && head.filter !== 'FlateDecode') return undefined
    if (head.colorSpace !== 'DeviceGray' && head.colorSpace !== 'DeviceRGB') return undefined
    const start = 4 + length
    return {
      filter: head.filter,
      width: Number(head.width),
      height: Number(head.height),
      colorSpace: head.colorSpace,
      data: bytes.slice(start, start + data),
      alpha: alpha === null ? null : bytes.slice(start + data, start + data + alpha),
    }
  } catch {
    return undefined
  }
}

/** The logo for a PDF: the kept decoding, else decoded now and kept. Null without a logo or for one the PDF cannot carry. */
export async function logoForPdf(files: R2Bucket | undefined, key: string | null): Promise<PdfImage | null> {
  if (!files || !key) return null
  const kept = await files.get(`${key}${SUFFIX}`).catch(() => null)
  if (kept) {
    const image = unpack(new Uint8Array(await kept.arrayBuffer()))
    if (image !== undefined) return image
  }
  const object = await files.get(key).catch(() => null)
  if (!object) return null
  const image = await logoImage(new Uint8Array(await object.arrayBuffer()))
  await files.put(`${key}${SUFFIX}`, pack(image), { httpMetadata: { contentType: 'application/octet-stream' } }).catch(() => null)
  return image
}

/** The kept decoding goes with its logo. */
export const keptLogoKey = (key: string): string => `${key}${SUFFIX}`
