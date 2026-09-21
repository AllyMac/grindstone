import OBR from '@owlbear-rodeo/sdk'
import type { NpcStatBlock, PlayerCharacter } from '../../types/character'

// Room metadata layout. One key per player and per active-encounter NPC, so
// two people saving different sheets at the same moment write different
// keys and can't overwrite each other (a single shared list would - the
// later write replaces the whole list). Templates and named NPCs are only
// ever written by the GM, so they stay together in one list.
//
//   grindstone/p/<id>   PlayerCharacter
//   grindstone/e/<id>   NpcStatBlock with isEncounterCopy
//   grindstone/npcs     NpcStatBlock[] (templates + named NPCs)
//   grindstone/players  legacy single list, migrated away by the GM's client
const PLAYER_PREFIX = 'grindstone/p/'
const ENCOUNTER_PREFIX = 'grindstone/e/'
const NPC_ROSTER_KEY = 'grindstone/npcs'
const LEGACY_PLAYERS_KEY = 'grindstone/players'

export interface Characters {
  players: PlayerCharacter[]
  npcs: NpcStatBlock[]
}

type Metadata = Record<string, unknown>

function list<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function withPrefix<T>(metadata: Metadata, prefix: string): T[] {
  return Object.entries(metadata)
    .filter(([key]) => key.startsWith(prefix))
    .map(([, value]) => value as T)
}

// Merges by id with the per-character keys winning, so a half-migrated room
// (some entries still in the old lists) reads correctly.
function mergeById<T extends { id: string }>(preferred: T[], fallback: T[]): T[] {
  const seen = new Set(preferred.map((c) => c.id))
  return [...preferred, ...fallback.filter((c) => !seen.has(c.id))]
}

// An older edit form leaked NPC-only fields onto PCs, and a PC is told from
// an NPC by whether `isTemplate` exists - so scrub them on the way in.
function cleanPlayer(player: PlayerCharacter): PlayerCharacter {
  const { isTemplate: _t, isEncounterCopy: _e, ...rest } = player as PlayerCharacter & {
    isTemplate?: boolean
    isEncounterCopy?: boolean
  }
  return rest
}

export function readCharacters(metadata: Metadata): Characters {
  const players = mergeById(withPrefix<PlayerCharacter>(metadata, PLAYER_PREFIX), list<PlayerCharacter>(metadata[LEGACY_PLAYERS_KEY]))
  return {
    players: players.map(cleanPlayer),
    npcs: mergeById(withPrefix<NpcStatBlock>(metadata, ENCOUNTER_PREFIX), list<NpcStatBlock>(metadata[NPC_ROSTER_KEY])),
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

function diffKeys<T extends { id: string }>(prefix: string, prev: T[], next: T[], patch: Metadata) {
  const before = new Map(prev.map((c) => [c.id, c]))
  for (const c of next) {
    if (!same(before.get(c.id), c)) patch[prefix + c.id] = c
  }
  const after = new Set(next.map((c) => c.id))
  for (const c of prev) {
    // undefined removes the key from room metadata.
    if (!after.has(c.id)) patch[prefix + c.id] = undefined
  }
}

// Only what changed between `prev` and `next` - a save touching one player
// writes one key.
export function diffCharacters(prev: Characters, next: Characters): Metadata {
  const patch: Metadata = {}
  diffKeys(PLAYER_PREFIX, prev.players, next.players, patch)
  diffKeys(
    ENCOUNTER_PREFIX,
    prev.npcs.filter((n) => n.isEncounterCopy),
    next.npcs.filter((n) => n.isEncounterCopy),
    patch,
  )
  const roster = (npcs: NpcStatBlock[]) => npcs.filter((n) => !n.isEncounterCopy)
  if (!same(roster(prev.npcs), roster(next.npcs))) patch[NPC_ROSTER_KEY] = roster(next.npcs)
  return patch
}

export async function getRoomCharacters(): Promise<Characters> {
  return readCharacters(await OBR.room.getMetadata())
}

export async function writeRoomPatch(patch: Metadata): Promise<void> {
  if (Object.keys(patch).length === 0) return
  // Callers pass data straight out of a Pinia store, whose reactive Proxies
  // can't cross postMessage (see roomList.ts) - clone each value, keeping
  // explicit undefined (a delete) which a whole-object JSON clone would drop.
  const plain: Metadata = {}
  for (const [key, value] of Object.entries(patch)) {
    plain[key] = value === undefined ? undefined : JSON.parse(JSON.stringify(value))
  }
  await OBR.room.setMetadata(plain)
}

export function onRoomCharactersChange(callback: (characters: Characters) => void): () => void {
  return OBR.room.onMetadataChange((metadata) => callback(readCharacters(metadata)))
}

// GM's client only: moves anything still in the old shared lists onto its
// own key. Safe to run repeatedly - a no-op once nothing is left.
export async function migrateLegacyLayout(): Promise<void> {
  const metadata = await OBR.room.getMetadata()
  const legacyPlayers = list<PlayerCharacter>(metadata[LEGACY_PLAYERS_KEY])
  const roster = list<NpcStatBlock>(metadata[NPC_ROSTER_KEY])
  const copies = roster.filter((n) => n.isEncounterCopy)
  if (metadata[LEGACY_PLAYERS_KEY] === undefined && copies.length === 0) return

  const patch: Metadata = {}
  for (const p of legacyPlayers) {
    if (metadata[PLAYER_PREFIX + p.id] === undefined) patch[PLAYER_PREFIX + p.id] = p
  }
  for (const c of copies) {
    if (metadata[ENCOUNTER_PREFIX + c.id] === undefined) patch[ENCOUNTER_PREFIX + c.id] = c
  }
  patch[LEGACY_PLAYERS_KEY] = undefined
  if (copies.length > 0) patch[NPC_ROSTER_KEY] = roster.filter((n) => !n.isEncounterCopy)
  await writeRoomPatch(patch)
}
