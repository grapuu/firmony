import { build } from 'esbuild'
await build({
  entryPoints: ['client/free-invoice.ts'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2022'],
  minify: true,
  legalComments: 'eof',
  outfile: 'public/free-invoice.js',
})
