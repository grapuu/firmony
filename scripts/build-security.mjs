import { build } from 'esbuild'
await build({
  entryPoints: ['client/security.ts'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2022'],
  minify: true,
  legalComments: 'eof',
  outfile: 'public/security.js',
})

// Mony's corner (client/mony.ts): the same bundle rules, its own file, loaded only by the pages that show Mony.
await build({
  entryPoints: ['client/mony.ts'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2022'],
  minify: true,
  legalComments: 'eof',
  outfile: 'public/mony.js',
})

// The check that a page is the current Firmony (client/fresh.ts): on every page of the site and the app.
await build({
  entryPoints: ['client/fresh.ts'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2022'],
  minify: true,
  legalComments: 'eof',
  outfile: 'public/fresh.js',
})
