// A ZIP archive written as a stream (APPNOTE 6.3.10), stored without compression: the documents are photos and PDFs,
// which are compressed already, and storing keeps the Worker's time low. Each file is held whole while it is written
// (a document is 15 MB at most), so its size and CRC-32 stand in its local header and no data descriptor is needed.
// Names are plain ASCII: a name with other letters shows garbled in some systems' built-in unzippers. Without ZIP64,
// an archive holds 65 535 files and 4 GB; what would go past either is named in a note at its end instead.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = (CRC_TABLE[(c ^ (bytes[i] as number)) & 0xff] as number) ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** A name inside the archive: letters without their accents, and nothing but letters, digits and . _ - / ( ). */
export function zipName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split('/')
    .map((part) =>
      part
        .replace(/[^A-Za-z0-9._() -]+/g, '_')
        .replace(/\s+/g, ' ')
        .replace(/_+/g, '_')
        .trim()
        .replace(/^\.+/, '_')
        .slice(0, 120),
    )
    .filter((part) => part !== '')
    .join('/')
}

export interface ZipEntry {
  name: string
  /** The moment the file stands for, in seconds; written as the wall time in Bratislava. */
  when: number
  /** The file's bytes, read when its turn comes; null leaves it out. */
  data: () => Promise<Uint8Array | null>
}

const LIMIT_BYTES = 0xffffffff - 64 * 1024 * 1024
const LIMIT_FILES = 65_000

function dosParts(seconds: number): { time: number; date: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bratislava', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(seconds * 1000))
      .map((p) => [p.type, p.value]),
  )
  const year = Number(parts.year)
  if (!Number.isFinite(year) || year < 1980) return { time: 0, date: (0 << 9) | (1 << 5) | 1 }
  return {
    time: (Number(parts.hour) << 11) | (Number(parts.minute) << 5) | Math.floor(Number(parts.second) / 2),
    date: ((Math.min(year, 2107) - 1980) << 9) | (Number(parts.month) << 5) | Number(parts.day),
  }
}

function localHeader(name: Uint8Array, crc: number, size: number, when: { time: number; date: number }): Uint8Array {
  const out = new Uint8Array(30 + name.length)
  const v = new DataView(out.buffer)
  v.setUint32(0, 0x04034b50, true)
  v.setUint16(4, 20, true)
  v.setUint16(6, 0, true)
  v.setUint16(8, 0, true)
  v.setUint16(10, when.time, true)
  v.setUint16(12, when.date, true)
  v.setUint32(14, crc, true)
  v.setUint32(18, size, true)
  v.setUint32(22, size, true)
  v.setUint16(26, name.length, true)
  v.setUint16(28, 0, true)
  out.set(name, 30)
  return out
}

function centralHeader(name: Uint8Array, crc: number, size: number, when: { time: number; date: number }, offset: number): Uint8Array {
  const out = new Uint8Array(46 + name.length)
  const v = new DataView(out.buffer)
  v.setUint32(0, 0x02014b50, true)
  v.setUint16(4, 20, true)
  v.setUint16(6, 20, true)
  v.setUint16(8, 0, true)
  v.setUint16(10, 0, true)
  v.setUint16(12, when.time, true)
  v.setUint16(14, when.date, true)
  v.setUint32(16, crc, true)
  v.setUint32(20, size, true)
  v.setUint32(24, size, true)
  v.setUint16(28, name.length, true)
  v.setUint16(30, 0, true)
  v.setUint16(32, 0, true)
  v.setUint16(34, 0, true)
  v.setUint16(36, 0, true)
  v.setUint32(38, 0, true)
  v.setUint32(42, offset, true)
  out.set(name, 46)
  return out
}

function endRecord(count: number, size: number, offset: number): Uint8Array {
  const out = new Uint8Array(22)
  const v = new DataView(out.buffer)
  v.setUint32(0, 0x06054b50, true)
  v.setUint16(8, count, true)
  v.setUint16(10, count, true)
  v.setUint32(12, size, true)
  v.setUint32(16, offset, true)
  return out
}

/** One name per file: a second "x.pdf" becomes "x (2).pdf". */
export function uniqueName(name: string, taken: Set<string>): string {
  const base = name || 'subor'
  const dot = base.lastIndexOf('.')
  const ext = dot > base.lastIndexOf('/') + 1 ? dot : -1
  let candidate = base
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = ext > 0 ? `${base.slice(0, ext)} (${n})${base.slice(ext)}` : `${base} (${n})`
  taken.add(candidate.toLowerCase())
  return candidate
}

async function* chunks(entries: AsyncIterable<ZipEntry> | Iterable<ZipEntry>, overflowNote: (names: string[]) => string): AsyncGenerator<Uint8Array> {
  const encoder = new TextEncoder()
  const central: Uint8Array[] = []
  const taken = new Set<string>()
  const left: string[] = []
  let offset = 0
  for await (const entry of entries) {
    const name = uniqueName(zipName(entry.name), taken)
    if (left.length > 0 || central.length >= LIMIT_FILES) {
      left.push(name)
      continue
    }
    const data = await entry.data()
    if (!data) {
      taken.delete(name.toLowerCase())
      continue
    }
    const nameBytes = encoder.encode(name)
    if (offset + 30 + nameBytes.length + data.length > LIMIT_BYTES) {
      left.push(name)
      continue
    }
    const crc = crc32(data)
    const when = dosParts(entry.when)
    const header = localHeader(nameBytes, crc, data.length, when)
    central.push(centralHeader(nameBytes, crc, data.length, when, offset))
    yield header
    if (data.length > 0) yield data
    offset += header.length + data.length
  }
  if (left.length > 0) {
    const note = encoder.encode(overflowNote(left))
    const nameBytes = encoder.encode(uniqueName('CHYBAJUCE-SUBORY.txt', taken))
    const crc = crc32(note)
    const when = dosParts(Math.floor(Date.now() / 1000))
    const header = localHeader(nameBytes, crc, note.length, when)
    central.push(centralHeader(nameBytes, crc, note.length, when, offset))
    yield header
    yield note
    offset += header.length + note.length
  }
  let size = 0
  for (const record of central) {
    yield record
    size += record.length
  }
  yield endRecord(central.length, size, offset)
}

/** The archive as a stream; files are read one at a time, as the stream is read. */
export function zipStream(entries: AsyncIterable<ZipEntry> | Iterable<ZipEntry>, overflowNote: (names: string[]) => string = (names) => names.join('\n')): ReadableStream<Uint8Array> {
  const iterator = chunks(entries, overflowNote)
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await iterator.next()
        if (done) controller.close()
        else controller.enqueue(value)
      } catch (err) {
        controller.error(err)
      }
    },
    async cancel() {
      await iterator.return(undefined)
    },
  })
}
