import OBR, { buildImage, type Vector2 } from '@owlbear-rodeo/sdk'
import { ref } from 'vue'
import { makeCursorThumbnail } from '../cursorImage'
import type { TokenImage } from '../../types/character'
import { syncHpIndicator } from './hpIndicators'
import { deleteTokensForStatBlockIds } from './tokens'

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
// True during a repeated ("+ Encounter") session - lets the UI label the
// stop button "Done" instead of "Cancel", since some may already be
// placed and stopping isn't undoing them.
export const placingRepeats = ref(false)

interface PendingPlacement {
  name: string
  statBlockId: string
  tokenImage: TokenImage
  currentHp: number
  maxHp: number
}

// When set, a successful placement re-arms instead of ending the session -
// used for "+ Encounter", so the GM can keep clicking the map to drop a
// whole group (four goblins = four clicks) without re-opening the picker
// each time. Every spawned copy of the same template shares its
// tokenImage, so the cursor/tool never needs re-registering mid-session.
type Spawner = () => Promise<PendingPlacement | undefined>

let pending: PendingPlacement | undefined
let spawner: Spawner | undefined
let previousToolId: string | undefined
let unsubToolChange: (() => void) | undefined

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message
  try {
    return JSON.stringify(err, null, 2)
  } catch {
    return String(err)
  }
}

async function placeToken(placement: PendingPlacement, position: Vector2) {
  // One character, one token on this scene at a time - CLAUDE.md's "no
  // separate instances": currentHp lives on the character record, not
  // the token, so a second token for the same statBlockId would just be
  // a confusing duplicate marker, never a meaningfully different one.
  // Placing again relocates the existing token instead of adding a new
  // one.
  await deleteTokensForStatBlockIds([placement.statBlockId])

  const item = buildImage(placement.tokenImage.image, placement.tokenImage.grid)
    .position(position)
    .name(placement.name)
    .plainText(placement.name)
    .layer('CHARACTER')
    .metadata({ 'grindstone/statBlockId': placement.statBlockId })
    .build()

  await OBR.scene.items.addItems([item])
  await syncHpIndicator(placement.statBlockId, placement.currentHp, placement.maxHp)
}

// Registered on demand and torn down again as soon as the session ends -
// OBR.tool.create()/createMode() add a permanent, user-visible icon to
// its toolbars (the same mechanism as the built-in ruler/pointer tools),
// so leaving this registered between placements left a stray icon
// sitting in OBR's UI indefinitely.
async function teardown() {
  unsubToolChange?.()
  unsubToolChange = undefined
  try {
    await OBR.tool.removeMode(MODE_ID)
  } catch {
    // not registered - nothing to remove
  }
  try {
    await OBR.tool.remove(TOOL_ID)
  } catch {
    // not registered - nothing to remove
  }
}

async function endSession() {
  pending = undefined
  spawner = undefined
  placingCharacterName.value = undefined
  placingRepeats.value = false
  if (previousToolId) await OBR.tool.activateTool(previousToolId)
  await teardown()
}

async function register(cursorImageUrl: string) {
  await OBR.tool.create({
    id: TOOL_ID,
    icons: [{ icon: iconUrl, label: 'Place Grindstone character' }],
    defaultMode: MODE_ID,
  })

  await OBR.tool.createMode({
    id: MODE_ID,
    icons: [{ icon: iconUrl, label: 'Click the map to place' }],
    // Swaps the OS cursor to the character's own token art while armed,
    // so you can see what you're placing before you click - purely a
    // local browser cursor, not a scene item, so it's never visible to
    // other players and needs no cleanup beyond the tool/mode teardown.
    // Falls back to a crosshair if the browser rejects the image (most
    // enforce a cursor size cap, and token art isn't sized for that).
    cursors: [{ cursor: `url("${cursorImageUrl}") 32 32, crosshair` }],
    async onToolClick(_context, event) {
      if (!pending) return
      const placement = pending
      try {
        await placeToken(placement, event.pointerPosition)
      } catch (err) {
        console.error('Grindstone: failed to place token', err)
        alert(`Failed to place token: ${formatError(err)}`)
        await endSession()
        return
      }

      if (spawner) {
        const next = await spawner()
        if (next) {
          pending = next
          placingCharacterName.value = next.name
          return // stay armed for another click
        }
      }
      await endSession()
    },
    onKeyDown(_context, event) {
      if (event.key === 'Escape') void endSession()
    },
  })

  // Right-click and middle-click are reserved by OBR itself (pointer
  // ping / map pan) and never reach a custom tool's events at all, so
  // they can't cancel placement directly - the End button in the banner
  // and Escape are the actual ways out. This still fixes a real gap:
  // manually clicking a different tool (ruler, etc.) mid-placement used
  // to leave our state stuck instead of cleaning up.
  unsubToolChange = OBR.tool.onToolChange((id) => {
    if (pending && id !== TOOL_ID) void endSession()
  })
}

async function armSession(initial: PendingPlacement, sessionSpawner?: Spawner) {
  if (!OBR.isAvailable) {
    alert('Grindstone is not running inside Owlbear Rodeo, so there is no map to place on.')
    return
  }
  if (pending) await endSession()
  try {
    const cursorUrl = (await makeCursorThumbnail(initial.tokenImage.image.url)) ?? initial.tokenImage.image.url
    await register(cursorUrl)

    previousToolId = await OBR.tool.getActiveTool()
    pending = initial
    spawner = sessionSpawner
    placingCharacterName.value = initial.name
    placingRepeats.value = sessionSpawner !== undefined
    await OBR.tool.activateTool(TOOL_ID)
  } catch (err) {
    pending = undefined
    spawner = undefined
    placingCharacterName.value = undefined
    placingRepeats.value = false
    console.error('Grindstone: failed to start placement', err)
    alert(`Could not start placement: ${formatError(err)}`)
    await teardown()
  }
}

// tokenImage comes straight out of the Pinia store here (a reactive
// Proxy, since a character read from a store array is reactive all the
// way down) - postMessage's structured-clone algorithm can't serialize a
// Proxy ("#<Object> could not be cloned"), so strip it to a plain object
// before it reaches any SDK call.
function toPlain(placement: PendingPlacement): PendingPlacement {
  return JSON.parse(JSON.stringify(placement))
}

export async function beginPlacement(
  name: string,
  statBlockId: string,
  tokenImage: TokenImage,
  currentHp: number,
  maxHp: number,
) {
  await armSession(toPlain({ name, statBlockId, tokenImage, currentHp, maxHp }))
}

export async function beginRepeatedPlacement(
  spawnNext: () => Promise<
    { name: string; statBlockId: string; tokenImage: TokenImage; currentHp: number; maxHp: number } | undefined
  >,
) {
  const plainSpawner: Spawner = async () => {
    const next = await spawnNext()
    return next ? toPlain(next) : undefined
  }
  const first = await plainSpawner()
  if (!first) return
  await armSession(first, plainSpawner)
}

export async function cancelPlacement() {
  await endSession()
}
