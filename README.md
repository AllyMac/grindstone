# Grindstone

An [Owlbear Rodeo](https://www.owlbear.rodeo/) extension that automates D&D
5e combat math for a home group — stat blocks, weapon attacks, and AoE
spells with automatic targeting and roll resolution.

See [CLAUDE.md](./CLAUDE.md) for the full project spec, architecture, and
roadmap.

## Development

```sh
npm install
npm run dev
```

Then add the printed localhost URL's `manifest.json` (e.g.
`http://localhost:5173/manifest.json`) as a custom extension in an Owlbear
Rodeo room (room settings → extensions → developer mode).

## Deployment

Pushes to `main` build and deploy automatically to GitHub Pages via
[.github/workflows/deploy.yml](./.github/workflows/deploy.yml).
