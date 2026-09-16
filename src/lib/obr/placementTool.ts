import OBR, { buildImage, type Vector2 } from '@owlbear-rodeo/sdk'
import { generateTokenImage } from '../tokenImage'

const TOOL_ID = 'rodeo.owlbear.grindstone/place-tool'
const MODE_ID = 'rodeo.owlbear.grindstone/place-mode'

// A root-relative "/icon.svg" resolves against the page's own current
// location (works on localhost AND under GitHub Pages' /grindstone/
// subpath) - unlike manifest.json's icon field, which OBR resolves
// against the origin instead (see the manifest.json history for why
// that one needs full absolute URLs generated at deploy time instead).
const iconUrl = new URL('icon.svg', document.baseURI).href

let registered: Promise<void> | undefined
let pending: { name: string; statBlockId: string } | undefined
let previousToolId: string | undefined

async function placeToken(name: string, statBlockId: string, position: Vector2) {
  const image = generateTokenImage(name)
  const item = buildImage(
    { url: image.url, mime: 'image/png', width: image.width, height: image.height },
    { offset: { x: image.width / 2, y: image.height / 2 }, dpi: image.width },
  )
    .position(position)
    .name(name)
    .layer('CHARACTER')
    .metadata({ 'grindstone/statBlockId': statBlockId })
    .build()

  await OBR.scene.items.addItems([item])
}

async function register() {
  await OBR.tool.create({
    id: TOOL_ID,
    icons: [{ icon: iconUrl, label: 'Place Grindstone character' }],
    defaultMode: MODE_ID,
  })

  await OBR.tool.createMode({
    id: MODE_ID,
    icons: [{ icon: iconUrl, label: 'Click the map to place' }],
    async onToolClick(_context, event) {
      if (!pending) return
      const { name, statBlockId } = pending
      pending = undefined
      await placeToken(name, statBlockId, event.pointerPosition)
      if (previousToolId) await OBR.tool.activateTool(previousToolId)
    },
  })
}

export async function beginPlacement(name: string, statBlockId: string) {
  if (!OBR.isAvailable) return
  if (!registered) registered = register()
  await registered

  previousToolId = await OBR.tool.getActiveTool()
  pending = { name, statBlockId }
  await OBR.tool.activateTool(TOOL_ID)
}
