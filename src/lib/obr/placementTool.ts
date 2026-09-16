import OBR, { buildImage, type Vector2 } from '@owlbear-rodeo/sdk'
import { ref } from 'vue'

const TOOL_ID = 'rodeo.owlbear.grindstone/place-tool'
const MODE_ID = 'rodeo.owlbear.grindstone/place-mode'

// A root-relative "/icon.svg" resolves against the page's own current
// location (works on localhost AND under GitHub Pages' /grindstone/
// subpath) - unlike manifest.json's icon field, which OBR resolves
// against the origin instead (see the manifest.json history for why
// that one needs full absolute URLs generated at deploy time instead).
const iconUrl = new URL('icon.svg', document.baseURI).href

// Placeholder token art until per-character image upload exists
// (CharacterBase.imageUrl is reserved for that). addItems validates
// image.url against a real, network-fetchable resource under 2048
// characters - a generated data URI fails both the length cap for
// anything non-trivial AND doesn't actually render (OBR's scene
// renderer loads it over the network, not inline), so this reuses our
// own hosted icon and relies on the item's text label for
// distinguishing characters instead of per-character art.
const TOKEN_SIZE = 48

// Exposed so the UI can show "click the map to place <name>" - there's
// no other feedback once the tool is armed, since the click itself
// happens outside our popover entirely.
export const placingCharacterName = ref<string>()

let registered: Promise<void> | undefined
let pendingStatBlockId: string | undefined
let previousToolId: string | undefined

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message
  try {
    return JSON.stringify(err, null, 2)
  } catch {
    return String(err)
  }
}

async function placeToken(name: string, statBlockId: string, position: Vector2) {
  const item = buildImage(
    { url: iconUrl, mime: 'image/svg+xml', width: TOKEN_SIZE, height: TOKEN_SIZE },
    { offset: { x: TOKEN_SIZE / 2, y: TOKEN_SIZE / 2 }, dpi: TOKEN_SIZE },
  )
    .position(position)
    .name(name)
    .plainText(name)
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
      if (!pendingStatBlockId || !placingCharacterName.value) return
      const name = placingCharacterName.value
      const statBlockId = pendingStatBlockId
      pendingStatBlockId = undefined
      placingCharacterName.value = undefined
      try {
        await placeToken(name, statBlockId, event.pointerPosition)
      } catch (err) {
        console.error('Grindstone: failed to place token', err)
        alert(`Failed to place token: ${formatError(err)}`)
      } finally {
        if (previousToolId) await OBR.tool.activateTool(previousToolId)
      }
    },
  })
}

export async function beginPlacement(name: string, statBlockId: string) {
  if (!OBR.isAvailable) {
    alert('Grindstone is not running inside Owlbear Rodeo, so there is no map to place on.')
    return
  }
  try {
    if (!registered) registered = register()
    await registered

    previousToolId = await OBR.tool.getActiveTool()
    pendingStatBlockId = statBlockId
    placingCharacterName.value = name
    await OBR.tool.activateTool(TOOL_ID)
  } catch (err) {
    pendingStatBlockId = undefined
    placingCharacterName.value = undefined
    console.error('Grindstone: failed to start placement', err)
    alert(`Could not start placement: ${formatError(err)}`)
  }
}

export async function cancelPlacement() {
  pendingStatBlockId = undefined
  placingCharacterName.value = undefined
  if (previousToolId) await OBR.tool.activateTool(previousToolId)
}
