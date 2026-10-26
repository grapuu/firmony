// Schema step 83 only (26 October 2026): first-party analytics in daily sums. Earlier steps stay byte for byte.
// No table here holds an address, a whole user agent, a whole referring address, an e-mail or a name: the site's
// rows are counters of a day, the routes' rows counters of a day and a route, and the usage rows say which part of
// the app a signed-in person used that day (by the user's id, kept 13 months, see `purge` in db.ts).
// No foreign keys: a company or a person deleted by the retention workflow never waits for these rows.
export const ANALYTICS_SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS analytics_site (
    day TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('path', 'referrer', 'campaign', 'device', 'bot', 'internal', 'error')),
    key TEXT NOT NULL CHECK (length(key) BETWEEN 1 AND 200),
    n INTEGER NOT NULL DEFAULT 0 CHECK (n >= 0),
    PRIMARY KEY (day, kind, key)
  )`,
  `CREATE TABLE IF NOT EXISTS analytics_routes (
    day TEXT NOT NULL,
    side TEXT NOT NULL CHECK (side IN ('client', 'team')),
    method TEXT NOT NULL CHECK (method IN ('GET', 'POST')),
    route TEXT NOT NULL CHECK (length(route) BETWEEN 1 AND 160),
    n INTEGER NOT NULL DEFAULT 0,
    s2 INTEGER NOT NULL DEFAULT 0,
    s3 INTEGER NOT NULL DEFAULT 0,
    s4 INTEGER NOT NULL DEFAULT 0,
    s5 INTEGER NOT NULL DEFAULT 0,
    ms INTEGER NOT NULL DEFAULT 0,
    h0 INTEGER NOT NULL DEFAULT 0,
    h1 INTEGER NOT NULL DEFAULT 0,
    h2 INTEGER NOT NULL DEFAULT 0,
    h3 INTEGER NOT NULL DEFAULT 0,
    h4 INTEGER NOT NULL DEFAULT 0,
    h5 INTEGER NOT NULL DEFAULT 0,
    h6 INTEGER NOT NULL DEFAULT 0,
    h7 INTEGER NOT NULL DEFAULT 0,
    h8 INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, side, method, route)
  )`,
  `CREATE TABLE IF NOT EXISTS analytics_usage (
    day TEXT NOT NULL,
    user_id TEXT NOT NULL,
    company_id TEXT NOT NULL,
    side TEXT NOT NULL CHECK (side IN ('client', 'team')),
    feature TEXT NOT NULL CHECK (length(feature) BETWEEN 1 AND 40),
    n INTEGER NOT NULL DEFAULT 0,
    last_at INTEGER NOT NULL,
    PRIMARY KEY (day, user_id, company_id, side, feature)
  )`,
  'CREATE INDEX IF NOT EXISTS analytics_usage_company ON analytics_usage (company_id, side, day)',
  // The dashboard counts business events of a period by their action (the events table had no such index).
  'CREATE INDEX IF NOT EXISTS events_action_at ON events (action, at)',
]
