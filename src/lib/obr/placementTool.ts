import OBR, { buildImage, type Vector2 } from '@owlbear-rodeo/sdk'
import { ref } from 'vue'
import type { TokenImage } from '../../types/character'

const TOOL_ID = 'rodeo.owlbear.grindstone/place-tool'
const MODE_ID = 'rodeo.owlbear.grindstone/place-mode'

// A root-relative "/icon.svg" resolves against the page's own current
// location (works on localhost AND under GitHub Pages' /grindstone/
// subpath) - unlike manifest.json's icon field, which OBR resolves
// against the origin instead (see the manifest.json history for why
// that one needs full absolute URLs generated at deploy time instead).
const iconUrl = new URL('icon.svg', document.baseURI).href

// Exposed so the UI can show "click the map to place <name>" - there's
// no other feedback once the tool is armed, since the click itself
// happens outside our popover entirely.
export const placingCharacterName = ref<string>()

interface PendingPlacement {
  name: string
  statBlockId: string
  tokenImage: TokenImage
}

let registered: Promise<void> | undefined
let pending: PendingPlacement | undefined
let previousToolId: string | undefined

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message
  try {
    return JSON.stringify(err, null, 2)
  } catch {
    return String(err)
  }
}

async function placeToken(placement: PendingPlacement, position: Vector2) {
  const item = buildImage(placement.tokenImage.image, placement.tokenImage.grid)
    .position(position)
    .name(placement.name)
    .plainText(placement.name)
    .layer('CHARACTER')
    .metadata({ 'grindstone/statBlockId': placement.statBlockId })
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
      const placement = pending
      pending = undefined
      placingCharacterName.value = undefined
      try {
        await placeToken(placement, event.pointerPosition)
      } catch (err) {
        console.error('Grindstone: failed to place token', err)
        alert(`Failed to place token: ${formatError(err)}`)
      } finally {
        if (previousToolId) await OBR.tool.activateTool(previousToolId)
      }
    },
  })
}

export async function beginPlacement(name: string, statBlockId: string, tokenImage: TokenImage) {
  if (!OBR.isAvailable) {
    alert('Grindstone is not running inside Owlbear Rodeo, so there is no map to place on.')
    return
  }
  try {
    if (!registered) registered = register()
    await registered

    previousToolId = await OBR.tool.getActiveTool()
    pending = { name, statBlockId, tokenImage }
    placingCharacterName.value = name
    await OBR.tool.activateTool(TOOL_ID)
  } catch (err) {
    pending = undefined
    placingCharacterName.value = undefined
    console.error('Grindstone: failed to start placement', err)
    alert(`Could not start placement: ${formatError(err)}`)
  }
}

export async function cancelPlacement() {
  pending = undefined
  placingCharacterName.value = undefined
  if (previousToolId) await OBR.tool.activateTool(previousToolId)
}
