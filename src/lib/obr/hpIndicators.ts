import OBR, { buildPath, buildShape, Command, type BoundingBox, type PathCommand } from '@owlbear-rodeo/sdk'

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

// A rounded-end bar ("pill") as a single path, drawn in local coordinates
// from (0,0) to (width,height) - OBR's shapes have no rounded rectangle,
// and stacking circles onto rectangles would double up the track's
// translucency wherever they overlap. Each corner is a cubic Bézier
// quarter-circle (0.5523 is the standard control-point ratio for that).
function pillCommands(width: number, height: number): PathCommand[] {
  const r = Math.min(height / 2, width / 2)
  const k = r * 0.5522847498
  return [
    [Command.MOVE, r, 0],
    [Command.LINE, width - r, 0],
    [Command.CUBIC, width - r + k, 0, width, r - k, width, r],
    [Command.LINE, width, height - r],
    [Command.CUBIC, width, height - r + k, width - r + k, height, width - r, height],
    [Command.LINE, r, height],
    [Command.CUBIC, r - k, height, 0, height - r + k, 0, height - r],
    [Command.LINE, 0, r],
    [Command.CUBIC, 0, r - k, r - k, 0, r, 0],
    [Command.CLOSE],
  ]
}

function buildHealthBar(statBlockId: string, tokenId: string, bounds: BoundingBox, currentHp: number, maxHp: number) {
  // Rectangles are top-left anchored (unlike our image tokens, which we
  // explicitly centered via grid.offset) - position is the corner, not
  // the middle. Getting this wrong doesn't just shift the bar by a
  // fixed amount, it makes the fill's offset compound with fillWidth,
  // drifting further left the lower HP gets - exactly what showed up
  // live. The pill paths are placed the same way (position = their
  // top-left, commands drawn from 0,0), and track and fill share one
  // corner so the fill is always flush against the track's left edge.
  const trackWidth = bounds.width
  // Rounded ends only read at a bit more height than the old flat bar.
  const trackHeight = Math.max(6, bounds.height * 0.1)
  const gap = trackHeight
  const top = bounds.min.y - gap - trackHeight
  const left = bounds.min.x
  const fraction = Math.max(0, Math.min(1, currentHp / maxHp))
  const fillWidth = Math.max(1, trackWidth * fraction)

  const track = buildPath()
    .commands(pillCommands(trackWidth, trackHeight))
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

  const fill = buildPath()
    .commands(pillCommands(fillWidth, trackHeight))
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

// Skull outline in a 100x100 box: rounded cranium, squared-off jaw.
const SKULL: PathCommand[] = [
  [Command.MOVE, 20, 50],
  [Command.CUBIC, 20, 26, 34, 10, 50, 10],
  [Command.CUBIC, 66, 10, 80, 26, 80, 50],
  [Command.CUBIC, 80, 57, 76, 62, 71, 64],
  [Command.LINE, 71, 80],
  [Command.CUBIC, 71, 84, 68, 87, 64, 87],
  [Command.LINE, 36, 87],
  [Command.CUBIC, 32, 87, 29, 84, 29, 80],
  [Command.LINE, 29, 64],
  [Command.CUBIC, 24, 62, 20, 57, 20, 50],
  [Command.CLOSE],
]
const NOSE: PathCommand[] = [
  [Command.MOVE, 50, 58],
  [Command.LINE, 44, 70],
  [Command.LINE, 56, 70],
  [Command.CLOSE],
]
// A thin slit between teeth, x = left edge.
const tooth = (x: number): PathCommand[] => [
  [Command.MOVE, x, 75],
  [Command.LINE, x + 2.4, 75],
  [Command.LINE, x + 2.4, 87],
  [Command.LINE, x, 87],
  [Command.CLOSE],
]

// Path coordinates are relative to the item's own top-left, so scaling a
// 100x100 design to the token is just multiplying every number.
function scaled(commands: PathCommand[], k: number): PathCommand[] {
  return commands.map(([code, ...args]) => [code, ...args.map((n) => n * k)] as PathCommand)
}

function buildDeathMarker(statBlockId: string, tokenId: string, bounds: BoundingBox) {
  // Darkened, muted token + crimson ring + bone-white skull. There's no
  // grayscale/filter on an image item, so a dark translucent disc is the
  // closest way to drain the art's colour. Everything is built from
  // things already proven live: circles are center-anchored, paths are
  // placed by their top-left corner, and nothing is rotated (rotation
  // pivots on the corner, which is what wrecked the earlier X).
  const diameter = Math.min(bounds.width, bounds.height) * 0.9
  const center = bounds.center
  const meta = (role: string) => ({ [HP_BAR_FOR_KEY]: statBlockId, [HP_BAR_ROLE_KEY]: role })

  const size = diameter * 0.6
  const k = size / 100
  // The skull box is centered horizontally; vertically its drawn content
  // (y 10-87) is centered on 48.5, not 50.
  const origin = { x: center.x - size / 2, y: center.y - size * 0.485 }

  const circle = (at: { x: number; y: number }, across: number, z: number, role: string) =>
    buildShape()
      .shapeType('CIRCLE')
      .width(across)
      .height(across)
      .position(at)
      .attachedTo(tokenId)
      .disableAttachmentBehavior(['ROTATION'])
      .disableHit(true)
      .locked(true)
      .layer('ATTACHMENT')
      .zIndex(z)
      .metadata(meta(role))

  const path = (commands: PathCommand[], z: number, role: string) =>
    buildPath()
      .commands(scaled(commands, k))
      .position(origin)
      .attachedTo(tokenId)
      .disableAttachmentBehavior(['ROTATION'])
      .disableHit(true)
      .locked(true)
      .layer('ATTACHMENT')
      .zIndex(z)
      .metadata(meta(role))

  const dark = '#1c1917'
  // Deliberately below 1 so the skull and ring sit into the token rather
  // than glaring off it - the bone and the crimson were the brightest
  // things on the map. Features fade a little less than the bone so the
  // eyes and teeth still read.
  const RING_OPACITY = 0.65
  const BONE_OPACITY = 0.75
  const FEATURE_OPACITY = 0.85
  const eyeRadius = 8.5 * k
  const eye = (x: number) =>
    circle({ x: origin.x + x * k, y: origin.y + 48 * k }, eyeRadius * 2, 2, 'death-eye')
      .fillColor(dark)
      .fillOpacity(FEATURE_OPACITY)
      .strokeWidth(0)
      .build()

  return [
    circle(center, diameter, 0, 'death')
      .fillColor(dark)
      .fillOpacity(0.6)
      .strokeColor('#991b1b')
      .strokeOpacity(RING_OPACITY)
      .strokeWidth(Math.max(2, diameter * 0.05))
      .build(),
    path(SKULL, 1, 'death-skull')
      .fillColor('#e7e5e4')
      .fillOpacity(BONE_OPACITY)
      .strokeColor(dark)
      .strokeOpacity(BONE_OPACITY)
      .strokeWidth(Math.max(1, size * 0.03))
      .build(),
    eye(38),
    eye(62),
    path(NOSE, 2, 'death-nose').fillColor(dark).fillOpacity(FEATURE_OPACITY).strokeWidth(0).build(),
    ...[41, 49, 57].map((x) => path(tooth(x), 2, 'death-tooth').fillColor(dark).fillOpacity(FEATURE_OPACITY).strokeWidth(0).build()),
  ]
}

async function doSync(statBlockId: string, currentHp: number, maxHp: number): Promise<void> {
  const [token, existing] = await Promise.all([findToken(statBlockId), findIndicatorItems(statBlockId)])

  if (existing.length > 0) await OBR.scene.items.deleteItems(existing.map((item) => item.id))
  if (!token || maxHp <= 0 || currentHp >= maxHp) return // not placed, or at full health - nothing to show

  const bounds = await OBR.scene.items.getItemBounds([token.id])
  const items = currentHp <= 0 ? buildDeathMarker(statBlockId, token.id, bounds) : buildHealthBar(statBlockId, token.id, bounds, currentHp, maxHp)
  await OBR.scene.items.addItems(items)
}

// Brings every token on the current scene in line with its character's
// HP. Bars are only ever redrawn when HP changes or a token is placed, so
// tokens that predate the feature (or sit on a scene loaded later) would
// otherwise never get one - and a bar left behind after its token was
// removed (stray items from earlier testing) would never go away.
export async function reconcileHpIndicators(
  lookup: (statBlockId: string) => { currentHp: number; maxHp: number } | undefined,
): Promise<void> {
  if (!OBR.isAvailable || !(await OBR.scene.isReady())) return
  try {
    const items = await OBR.scene.items.getItems()
    const tokenIds = new Set<string>()
    for (const item of items) {
      const id = item.metadata['grindstone/statBlockId']
      if (typeof id === 'string') tokenIds.add(id)
    }

    const orphans = items.filter((item) => {
      const barFor = item.metadata[HP_BAR_FOR_KEY]
      return typeof barFor === 'string' && !tokenIds.has(barFor)
    })
    if (orphans.length > 0) await OBR.scene.items.deleteItems(orphans.map((item) => item.id))

    await Promise.all(
      [...tokenIds].map((id) => {
        const character = lookup(id)
        return character ? syncHpIndicator(id, character.currentHp, character.maxHp) : undefined
      }),
    )
  } catch (err) {
    console.error('Grindstone: failed to reconcile HP indicators', err)
  }
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
