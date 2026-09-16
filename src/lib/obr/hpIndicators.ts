import OBR, { buildShape, type BoundingBox } from '@owlbear-rodeo/sdk'

// A floating health bar (attached to the token, so it follows it around
// automatically) once a character isn't at full HP, and a red circle
// overlay once they hit 0 - nothing shown at full health. Attachment behaviors
// default to on, so DELETE means these get cleaned up automatically
// when the token itself is deleted; ROTATION is explicitly disabled so
// the bar/marker stay level even if the token is rotated to face a
// direction.
const HP_BAR_FOR_KEY = 'grindstone/hpBarFor'
const HP_BAR_ROLE_KEY = 'grindstone/hpBarRole'

async function findToken(statBlockId: string) {
  const items = await OBR.scene.items.getItems((item) => item.metadata['grindstone/statBlockId'] === statBlockId)
  return items[0]
}

async function findIndicatorItems(statBlockId: string) {
  return OBR.scene.items.getItems((item) => item.metadata[HP_BAR_FOR_KEY] === statBlockId)
}

function hpColor(fraction: number): string {
  if (fraction > 0.5) return '#16a34a' // green-600
  if (fraction > 0.25) return '#d97706' // amber-600
  return '#dc2626' // red-600
}

function buildHealthBar(statBlockId: string, tokenId: string, bounds: BoundingBox, currentHp: number, maxHp: number) {
  // Shapes are top-left anchored (unlike our image tokens, which we
  // explicitly centered via grid.offset) - position is the corner, not
  // the middle. Getting this wrong doesn't just shift the bar by a
  // fixed amount, it makes the fill's offset compound with fillWidth,
  // drifting further left the lower HP gets - exactly what showed up
  // live. Track and fill share the same top-left corner so the fill is
  // always flush against the track's left edge.
  const trackWidth = bounds.width
  const trackHeight = Math.max(4, bounds.height * 0.08)
  const gap = trackHeight
  const top = bounds.min.y - gap - trackHeight
  const left = bounds.min.x
  const fraction = Math.max(0, Math.min(1, currentHp / maxHp))
  const fillWidth = Math.max(1, trackWidth * fraction)

  const track = buildShape()
    .shapeType('RECTANGLE')
    .width(trackWidth)
    .height(trackHeight)
    .position({ x: left, y: top })
    .attachedTo(tokenId)
    .disableAttachmentBehavior(['ROTATION'])
    .disableHit(true)
    .locked(true)
    .layer('ATTACHMENT')
    // Explicit, so the fill is guaranteed to paint above the track -
    // without this, which of the two wins when both are added in the
    // same batch isn't guaranteed, and a dark track painting over the
    // fill looked exactly like a bar gone randomly solid-dark.
    .zIndex(0)
    .fillColor('#1c1917')
    .fillOpacity(0.85)
    .strokeWidth(0)
    .metadata({ [HP_BAR_FOR_KEY]: statBlockId, [HP_BAR_ROLE_KEY]: 'track' })
    .build()

  const fill = buildShape()
    .shapeType('RECTANGLE')
    .width(fillWidth)
    .height(trackHeight)
    .position({ x: left, y: top })
    .attachedTo(tokenId)
    .disableAttachmentBehavior(['ROTATION'])
    .disableHit(true)
    .locked(true)
    .layer('ATTACHMENT')
    .zIndex(1)
    .fillColor(hpColor(fraction))
    .fillOpacity(1)
    .strokeWidth(0)
    .metadata({ [HP_BAR_FOR_KEY]: statBlockId, [HP_BAR_ROLE_KEY]: 'fill' })
    .build()

  return [track, fill]
}

function buildDeathMarker(statBlockId: string, tokenId: string, bounds: BoundingBox) {
  // A rotated-rectangle X turned out lopsided live - rotation pivots on
  // the shape's own top-left corner, not its center, so two rectangles
  // rotated ±45° around mismatched points don't cross symmetrically.
  // A plain circle sidesteps rotation entirely (rotating a circle is a
  // no-op). Unlike RECTANGLE (top-left anchored, confirmed by the health
  // bar above), a CIRCLE's position is its own center - offsetting it
  // like the rectangle pushed the circle a full radius up-left of the
  // token instead of centering it, exactly what showed up live.
  const diameter = Math.min(bounds.width, bounds.height) * 0.9
  const position = bounds.center

  const marker = buildShape()
    .shapeType('CIRCLE')
    .width(diameter)
    .height(diameter)
    .position(position)
    .attachedTo(tokenId)
    .disableAttachmentBehavior(['ROTATION'])
    .disableHit(true)
    .locked(true)
    .layer('ATTACHMENT')
    .fillColor('#dc2626')
    .fillOpacity(0.55)
    .strokeColor('#7f1d1d')
    .strokeOpacity(1)
    .strokeWidth(Math.max(2, diameter * 0.04))
    .metadata({ [HP_BAR_FOR_KEY]: statBlockId, [HP_BAR_ROLE_KEY]: 'death' })
    .build()

  return [marker]
}

async function doSync(statBlockId: string, currentHp: number, maxHp: number): Promise<void> {
  const [token, existing] = await Promise.all([findToken(statBlockId), findIndicatorItems(statBlockId)])

  if (existing.length > 0) await OBR.scene.items.deleteItems(existing.map((item) => item.id))
  if (!token || maxHp <= 0 || currentHp >= maxHp) return // not placed, or at full health - nothing to show

  const bounds = await OBR.scene.items.getItemBounds([token.id])
  const items = currentHp <= 0 ? buildDeathMarker(statBlockId, token.id, bounds) : buildHealthBar(statBlockId, token.id, bounds, currentHp, maxHp)
  await OBR.scene.items.addItems(items)
}

// Each sync is delete-then-add across several round trips, so two syncs
// for the same character overlapping (e.g. clicking the HP -/+ buttons
// quickly) can race: both read "existing" before either has added
// anything, so both add their own track+fill, doubling up two dark
// tracks stacked reads as solid black, hiding the fill entirely. Queuing
// per statBlockId makes overlapping calls run strictly one at a time.
const queues = new Map<string, Promise<void>>()

export async function syncHpIndicator(statBlockId: string, currentHp: number, maxHp: number): Promise<void> {
  if (!OBR.isAvailable) return
  const previous = queues.get(statBlockId) ?? Promise.resolve()
  const next = previous
    .then(() => doSync(statBlockId, currentHp, maxHp))
    .catch((err) => {
      console.error('Grindstone: failed to sync HP indicator', err)
    })
  queues.set(statBlockId, next)
  await next
}
