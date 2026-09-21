import type { NpcStatBlock, PlayerCharacter } from '../types/character'

// Phase 1 scope: players and npcs only. weapons/spells join the file in
// Phases 3/4 - additive, so an older file just lacks those arrays.
export const CAMPAIGN_VERSION = 1

export interface CampaignExport {
  version: number
  exportedAt: string
  players: PlayerCharacter[]
  npcs: NpcStatBlock[]
}

type Character = PlayerCharacter | NpcStatBlock

export type ImportChoice = 'keep' | 'overwrite' | 'new'

export interface ImportConflict {
  kind: 'player' | 'npc'
  imported: Character
  existing: Character
  // Same id = definitely the same record, edited since the export.
  // Same name only = a guess that they're the same entity.
  reason: 'same-id' | 'same-name'
  // A same-name match in the *other* list can't be overwritten - that
  // would move a record between lists - so only keep/new are offered.
  canOverwrite: boolean
}

export interface ImportPlan {
  addPlayers: PlayerCharacter[]
  addNpcs: NpcStatBlock[]
  identical: number
  // Encounter copies in the file, and repeats of an id/name already seen
  // earlier in the same file - neither is worth importing.
  ignored: number
  conflicts: ImportConflict[]
}

export interface ImportResult {
  players: PlayerCharacter[]
  npcs: NpcStatBlock[]
  overwrittenIds: string[]
  counts: { added: number; identical: number; overwritten: number; asNew: number; kept: number; ignored: number }
}

// Store data is reactive all the way down and can't cross postMessage or
// IndexedDB as-is (see roomList.ts), and a plain copy is what we want to
// compare and export anyway.
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

const norm = (name: string) => name.trim().toLowerCase()

// ownerId is a player id from whichever room the file came from - it means
// nothing in a different room, so it never travels with an export/import.
function withoutOwner<T extends Character>(character: T): T {
  const copy = clone(character) as T & { ownerId?: string }
  delete copy.ownerId
  return copy
}

export function buildCampaignExport(players: PlayerCharacter[], npcs: NpcStatBlock[]): CampaignExport {
  return {
    version: CAMPAIGN_VERSION,
    exportedAt: new Date().toISOString(),
    players: players.map(withoutOwner),
    // Encounter copies are disposable by design (Clear Encounter deletes
    // them) - not part of the library being backed up.
    npcs: npcs.filter((n) => !n.isEncounterCopy).map(withoutOwner),
  }
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha']

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

function checkCharacter(x: unknown, where: string, isNpc: boolean): string | undefined {
  if (typeof x !== 'object' || x === null) return `${where} isn't an object`
  const c = x as Record<string, unknown>
  if (typeof c.id !== 'string' || !c.id) return `${where} has no id`
  if (typeof c.name !== 'string' || !c.name.trim()) return `${where} has no name`
  const label = `${where} "${c.name}"`
  for (const key of ['ac', 'maxHp', 'currentHp', 'proficiencyBonus']) {
    if (!isNum(c[key])) return `${label} has an invalid ${key}`
  }
  const abilities = c.abilities as Record<string, unknown> | undefined
  if (typeof abilities !== 'object' || abilities === null || !ABILITY_KEYS.every((k) => isNum(abilities[k]))) {
    return `${label} has invalid ability scores`
  }
  if (!Array.isArray(c.weaponIds) || !Array.isArray(c.spellsKnown)) return `${label} is missing weaponIds/spellsKnown`
  if (c.tokenImage !== undefined) {
    const t = c.tokenImage as { image?: { url?: unknown }; grid?: { dpi?: unknown } }
    if (typeof t?.image?.url !== 'string' || !isNum(t?.grid?.dpi)) return `${label} has an invalid tokenImage`
  }
  if (isNpc && (typeof c.isTemplate !== 'boolean' || typeof c.isEncounterCopy !== 'boolean')) {
    return `${label} is missing isTemplate/isEncounterCopy`
  }
  return undefined
}

export function parseCampaign(text: string): { ok: true; data: CampaignExport } | { ok: false; error: string } {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: "That file isn't valid JSON." }
  }
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: "That file isn't a campaign export." }
  const file = raw as Record<string, unknown>

  if (!isNum(file.version)) return { ok: false, error: "That file isn't a campaign export (no version)." }
  if (file.version > CAMPAIGN_VERSION) {
    return { ok: false, error: `That file is from a newer version of Grindstone (v${file.version}), which this one can't read.` }
  }
  if (!Array.isArray(file.players) || !Array.isArray(file.npcs)) {
    return { ok: false, error: 'That file is missing its players/npcs lists.' }
  }

  for (const [i, p] of file.players.entries()) {
    const problem = checkCharacter(p, `Player #${i + 1}`, false)
    if (problem) return { ok: false, error: problem }
  }
  for (const [i, n] of file.npcs.entries()) {
    const problem = checkCharacter(n, `NPC #${i + 1}`, true)
    if (problem) return { ok: false, error: problem }
  }

  return { ok: true, data: file as unknown as CampaignExport }
}

// Key order and undefined-vs-missing shouldn't count as a difference.
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ao = a as Record<string, unknown>
  const bo = b as Record<string, unknown>
  for (const key of new Set([...Object.keys(ao), ...Object.keys(bo)])) {
    if (ao[key] === undefined && bo[key] === undefined) continue
    if (!deepEqual(ao[key], bo[key])) return false
  }
  return true
}

export function planImport(currentPlayers: PlayerCharacter[], currentNpcs: NpcStatBlock[], file: CampaignExport): ImportPlan {
  const players = clone(currentPlayers)
  const npcs = clone(currentNpcs)
  const playerIds = new Set(players.map((p) => p.id))
  const allCurrent: Character[] = [...players, ...npcs]
  // Players and non-copy NPCs share one name namespace (see nameConflict
  // in the store), so name matches are checked across both.
  const namePool: Character[] = [...players, ...npcs.filter((n) => !n.isEncounterCopy)]

  const plan: ImportPlan = { addPlayers: [], addNpcs: [], identical: 0, ignored: 0, conflicts: [] }
  const seenIds = new Set<string>()
  const seenNames = new Set<string>()

  const consider = (kind: 'player' | 'npc', imported: Character) => {
    if (seenIds.has(imported.id) || seenNames.has(norm(imported.name))) {
      plan.ignored++
      return
    }
    seenIds.add(imported.id)
    seenNames.add(norm(imported.name))

    const byId = allCurrent.find((c) => c.id === imported.id)
    if (byId) {
      if (deepEqual(withoutOwner(byId), imported)) plan.identical++
      else {
        plan.conflicts.push({
          kind,
          imported,
          existing: byId,
          reason: 'same-id',
          canOverwrite: playerIds.has(byId.id) === (kind === 'player'),
        })
      }
      return
    }

    const byName = namePool.find((c) => norm(c.name) === norm(imported.name))
    if (byName) {
      plan.conflicts.push({
        kind,
        imported,
        existing: byName,
        reason: 'same-name',
        canOverwrite: playerIds.has(byName.id) === (kind === 'player'),
      })
      return
    }

    if (kind === 'player') plan.addPlayers.push(imported as PlayerCharacter)
    else plan.addNpcs.push(imported as NpcStatBlock)
  }

  for (const p of file.players) consider('player', withoutOwner(p))
  for (const n of file.npcs) {
    if (n.isEncounterCopy) plan.ignored++
    else consider('npc', withoutOwner(n))
  }
  return plan
}

export function applyImport(
  currentPlayers: PlayerCharacter[],
  currentNpcs: NpcStatBlock[],
  plan: ImportPlan,
  choices: ImportChoice[],
): ImportResult {
  const players = clone(currentPlayers)
  const npcs = clone(currentNpcs)
  players.push(...plan.addPlayers)
  npcs.push(...plan.addNpcs)

  const taken = new Set<string>([...players, ...npcs.filter((n) => !n.isEncounterCopy)].map((c) => norm(c.name)))
  const importedName = (base: string) => {
    let name = `${base} (imported)`
    for (let i = 2; taken.has(norm(name)); i++) name = `${base} (imported ${i})`
    taken.add(norm(name))
    return name
  }

  const counts = { added: plan.addPlayers.length + plan.addNpcs.length, identical: plan.identical, overwritten: 0, asNew: 0, kept: 0, ignored: plan.ignored }
  const overwrittenIds: string[] = []

  plan.conflicts.forEach((conflict, i) => {
    const choice = choices[i] ?? 'keep'
    if (choice === 'keep') {
      counts.kept++
    } else if (choice === 'overwrite' && conflict.canOverwrite) {
      // Keeps the *existing* id so any token already on the map stays
      // linked - for a same-id conflict that's the same id anyway.
      const replacement: Character = { ...conflict.imported, id: conflict.existing.id }
      // The file never carries ownerId (see withoutOwner), so replacing
      // the record would silently unlink the player from their character.
      const linkedTo = (conflict.existing as PlayerCharacter).ownerId
      if (conflict.kind === 'player' && linkedTo) (replacement as PlayerCharacter).ownerId = linkedTo
      const list: Character[] = conflict.kind === 'player' ? players : npcs
      const at = list.findIndex((c) => c.id === conflict.existing.id)
      if (at >= 0) list[at] = replacement
      overwrittenIds.push(conflict.existing.id)
      counts.overwritten++
    } else if (choice === 'new') {
      const copy = { ...conflict.imported, id: crypto.randomUUID(), name: importedName(conflict.imported.name) }
      if (conflict.kind === 'player') players.push(copy as PlayerCharacter)
      else npcs.push(copy as NpcStatBlock)
      counts.asNew++
    } else {
      counts.kept++
    }
  })

  return { players, npcs, overwrittenIds, counts }
}
