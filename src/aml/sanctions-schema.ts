// Schema step 87: the sanctions lists the app read last (aml/sanctions-store.ts). One row a list: when it was read, the
// day its publisher generated it, how many subjects it holds and the SHA-256 of what was kept in R2 (the proof of which
// list a screening used), and the last try with its error, so a list that could not be read is said, never hidden.
export const SANCTIONS_SCHEMA = [
  `CREATE TABLE sanction_lists (
    list TEXT PRIMARY KEY CHECK (list IN ('eu', 'un')),
    fetched_at INTEGER,
    generated TEXT,
    entries INTEGER,
    sha256 TEXT,
    tried_at INTEGER NOT NULL,
    error TEXT
  )`,
]
