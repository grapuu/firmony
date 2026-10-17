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
