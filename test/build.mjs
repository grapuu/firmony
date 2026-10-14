// Local bundles only; runtime tests never invoke deploy or require Cloudflare credentials.
import { build } from 'esbuild'
await build({ entryPoints: { index: 'src/index.tsx', stores: 'test/stores.entry.ts' }, bundle: true, format: 'esm', platform: 'neutral', mainFields: ['module', 'main'], logLevel: 'warning', outdir: '.wrangler/dist' })
