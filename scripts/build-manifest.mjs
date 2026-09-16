// Owlbear Rodeo resolves manifest.json's icon/popover paths against the
// site's origin root, not the manifest file's own directory - so root-
// relative paths (correct for local dev, served at origin root) resolve
// to the wrong place once deployed to a GitHub Pages project site
// (served under /<repo>/). This rewrites them into absolute URLs anchored
// at the deployed base URL, run once at build time so the committed
// public/manifest.json can stay simple for local dev.
import { readFileSync, writeFileSync } from 'node:fs'

const baseUrl = process.argv[2]
if (!baseUrl) {
  console.error('Usage: node scripts/build-manifest.mjs <base-url>')
  process.exit(1)
}

const base = baseUrl.replace(/\/$/, '')
const toAbsolute = (path) => base + path

const manifest = JSON.parse(readFileSync('public/manifest.json', 'utf-8'))
manifest.icon = toAbsolute(manifest.icon)
manifest.action.icon = toAbsolute(manifest.action.icon)
manifest.action.popover = toAbsolute(manifest.action.popover)

writeFileSync('dist/manifest.json', JSON.stringify(manifest, null, 2) + '\n')
