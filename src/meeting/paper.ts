// The photo of the contract both signed at a meeting (team.tsx keeps it under the order): for the designated person and,
// in the app, for the client.
import { sniffPaper } from '../app/papers'
import { bytesHash } from '../aml/store'
import type { Order } from '../order'

/** The photo of a contract signed at a meeting, checked against what was kept, shown as it was taken. */
export async function paperPhoto(files: R2Bucket, order: Order): Promise<Response> {
  const object = order.paperKey ? await files.get(order.paperKey) : null
  if (!object) return new Response('Not found', { status: 404 })
  const bytes = new Uint8Array(await object.arrayBuffer())
  const type = sniffPaper(bytes)
  if (!type || !order.paperSha256 || (await bytesHash(bytes)) !== order.paperSha256) return new Response('Originál sa nepodarilo overiť.', { status: 409 })
  return new Response(bytes, { headers: { 'Content-Type': type.type, 'Content-Disposition': `inline; filename="zmluva.${type.ext}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox" } })
}
