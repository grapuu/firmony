// Local synthetic authenticators. Signatures are real P-256 signatures; the Worker runs the real verifier.
import { createHash, randomBytes, webcrypto } from 'node:crypto'
const bytes = (v) => Buffer.from(v)
const b64 = (v) => bytes(v).toString('base64url')
const sha = (v) => createHash('sha256').update(v).digest()
function cbor(v) {
  const head = (type, n) =>
    n < 24 ? Buffer.from([(type << 5) | n]) : n < 256 ? Buffer.from([(type << 5) | 24, n]) : Buffer.from([(type << 5) | 25, n >> 8, n & 255])
  if (typeof v === 'number') return head(v < 0 ? 1 : 0, v < 0 ? -v - 1 : v)
  if (typeof v === 'string') {
    const b = bytes(v)
    return Buffer.concat([head(3, b.length), b])
  }
  if (v instanceof Map) return Buffer.concat([head(5, v.size), ...[...v].flatMap(([k, x]) => [cbor(k), cbor(x)])])
  if (v instanceof Uint8Array) return Buffer.concat([head(2, v.length), v])
  throw new Error('Unsupported fixture CBOR')
}
const der = (signature) => {
  const integer = (part) => {
    let b = bytes(part)
    while (b.length > 1 && b[0] === 0) b = b.subarray(1)
    if (b[0] & 128) b = Buffer.concat([Buffer.from([0]), b])
    return Buffer.concat([Buffer.from([2, b.length]), b])
  }
  const b = bytes(signature),
    body = Buffer.concat([integer(b.subarray(0, 32)), integer(b.subarray(32))])
  return Buffer.concat([Buffer.from([48, body.length]), body])
}
export async function authenticator() {
  const keys = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const jwk = await webcrypto.subtle.exportKey('jwk', keys.publicKey),
    id = randomBytes(32)
  const publicKey = cbor(
    new Map([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, bytes(Buffer.from(jwk.x, 'base64url'))],
      [-3, bytes(Buffer.from(jwk.y, 'base64url'))],
    ]),
  )
  let userHandle,
    counter = 0
  return {
    id: b64(id),
    async register(options, { origin = 'https://firmony.ai', uv = true, up = true, crossOrigin = false, challenge = options.challenge } = {}) {
      userHandle = options.user.id
      const client = bytes(
        JSON.stringify({
          type: 'webauthn.create',
          challenge,
          origin,
          crossOrigin,
        }),
      )
      const count = Buffer.alloc(4)
      count.writeUInt32BE(counter)
      const length = Buffer.alloc(2)
      length.writeUInt16BE(id.length)
      const authData = Buffer.concat([sha(options.rp.id), Buffer.from([0x40 | (uv ? 4 : 0) | (up ? 1 : 0)]), count, Buffer.alloc(16), length, id, publicKey])
      return {
        id: b64(id),
        rawId: b64(id),
        type: 'public-key',
        authenticatorAttachment: 'platform',
        clientExtensionResults: {},
        response: {
          clientDataJSON: b64(client),
          attestationObject: b64(
            cbor(
              new Map([
                ['fmt', 'none'],
                ['authData', authData],
                ['attStmt', new Map()],
              ]),
            ),
          ),
          transports: ['internal'],
        },
      }
    },
    async authenticate(
      options,
      { origin = 'https://firmony.ai', uv = true, challenge = options.challenge, signCount, wrongSignature = false, crossOrigin = false } = {},
    ) {
      const client = bytes(
        JSON.stringify({
          type: 'webauthn.get',
          challenge,
          origin,
          crossOrigin,
        }),
      )
      const count = Buffer.alloc(4)
      count.writeUInt32BE(signCount ?? ++counter)
      const authData = Buffer.concat([sha(options.rpId), Buffer.from([uv ? 5 : 1]), count])
      const signed = await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.privateKey, Buffer.concat([authData, sha(client)]))
      const signature = der(signed)
      if (wrongSignature) signature[signature.length - 1] ^= 1
      return {
        id: b64(id),
        rawId: b64(id),
        type: 'public-key',
        authenticatorAttachment: 'platform',
        clientExtensionResults: {},
        response: {
          clientDataJSON: b64(client),
          authenticatorData: b64(authData),
          signature: b64(signature),
          userHandle,
        },
      }
    },
  }
}
export function jsonClient(mf, site, cookie, ip = '203.0.113.240') {
  return async (path, payload, options = {}) => {
    const body = JSON.stringify(payload)
    return mf.dispatchFetch(`${site}${path}`, {
      method: 'POST',
      body,
      redirect: 'manual',
      headers: {
        'content-type': 'application/json',
        'content-length': String(Buffer.byteLength(body)),
        'cf-connecting-ip': ip,
        origin: site,
        cookie,
        ...(options.headers ?? {}),
      },
    })
  }
}
export const TEST_BOOTSTRAP = randomBytes(32).toString('base64url')
