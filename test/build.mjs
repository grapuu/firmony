// Local bundles only; runtime tests never invoke deploy or require Cloudflare credentials.
import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'
import { generateBuildMetadata } from '../scripts/build-metadata.mjs'
await generateBuildMetadata()
import '../scripts/build-security.mjs'
await build({ entryPoints: { index: 'src/index.tsx', stores: 'test/stores.entry.ts' }, bundle: true, format: 'esm', platform: 'neutral', mainFields: ['module', 'main'], logLevel: 'warning', outdir: '.wrangler/dist' })
// Only the test bundle exposes the ordered steps; the deployed entry point never exports them.
await build({ stdin: { contents: (await readFile('src/db.ts','utf8')) + '\nexport { MIGRATIONS as migrationSteps }\n', resolveDir: new URL('../src/',import.meta.url).pathname, loader: 'ts' }, bundle: true, format: 'esm', platform: 'neutral', mainFields: ['module','main'], outfile: '.wrangler/dist/schema.js', logLevel: 'warning' })
