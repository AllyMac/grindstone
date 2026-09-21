import OBR from '@owlbear-rodeo/sdk'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { db, replaceTable } from '../lib/db'
import {
  diffCharacters,
  getRoomCharacters,
  migrateLegacyLayout,
  onRoomCharactersChange,
  writeRoomPatch,
} from '../lib/obr/roomCharacters'
import { deleteTokensForStatBlockIds } from '../lib/obr/tokens'
import type { AbilityScores, NpcStatBlock, PlayerCharacter, TokenImage } from '../types/character'

export interface NewCharacterInput {
  name: string
  ac: number
  maxHp: number
  abilities: AbilityScores
  proficiencyBonus: number
  tokenImage?: TokenImage
}

// Extra fields only PCs have (see the full character sheet).
export type NewPlayerInput = NewCharacterInput & Pick<PlayerCharacter, 'level' | 'className' | 'hitDie' | 'speed'>

export const useCharactersStore = defineStore('characters', () => {
  const players = ref<PlayerCharacter[]>([])
  const npcs = ref<NpcStatBlock[]>([])
  const ready = ref(false)

  let unsubscribe: (() => void) | undefined

  function applyPlayers(value: PlayerCharacter[]) {
    players.value = value
    void replaceTable(db.players, value)
  }

  function applyNpcs(value: NpcStatBlock[]) {
    npcs.value = value
    void replaceTable(db.npcs, value)
  }

  async function load() {
    // Paint instantly from the offline cache, then reconcile against room
    // metadata (the source of truth) once it's available.
    const [cachedPlayers, cachedNpcs] = await Promise.all([db.players.toArray(), db.npcs.toArray()])
    if (cachedPlayers.length) players.value = cachedPlayers
    if (cachedNpcs.length) npcs.value = cachedNpcs

    if (!OBR.isAvailable) {
      ready.value = true
      return
    }

    await new Promise<void>((resolve) => OBR.onReady(() => resolve()))

    try {
      const room = await getRoomCharacters()
      applyPlayers(room.players)
      applyNpcs(room.npcs)
    } catch (err) {
      // Leave the cached values in place rather than wiping the UI to
      // empty over a fetch failure - room metadata is still the source
      // of truth, but only once we've actually managed to read it.
      console.error('Grindstone: failed to load room metadata, keeping cached data', err)
      alert(`Failed to load from Owlbear Rodeo - showing locally cached data instead: ${formatError(err)}`)
    }
    ready.value = true

    unsubscribe = onRoomCharactersChange((room) => {
      applyPlayers(room.players)
      applyNpcs(room.npcs)
    })

    // One-off move from the old shared lists to per-character keys. Only
    // the GM's client does it, so two clients don't both rewrite them.
    try {
      if ((await OBR.player.getRole()) === 'GM') await migrateLegacyLayout()
    } catch (err) {
      console.error('Grindstone: failed to migrate room data to per-character keys', err)
    }
  }

  function dispose() {
    unsubscribe?.()
  }

  function formatError(err: unknown): string {
    if (err instanceof Error) return err.message
    try {
      return JSON.stringify(err, null, 2)
    } catch {
      return String(err)
    }
  }

  // Writes only the keys that changed (see roomCharacters.ts), so saving
  // one sheet can't overwrite someone else's simultaneous edit to another.
  async function savePlayers(next: PlayerCharacter[]) {
    const patch = diffCharacters(
      { players: players.value, npcs: npcs.value },
      { players: next, npcs: npcs.value },
    )
    applyPlayers(next)
    try {
      await writeRoomPatch(patch)
    } catch (err) {
      console.error('Grindstone: failed to save players to room metadata', err)
      alert(`Failed to save to Owlbear Rodeo - your changes are only local for now and may not survive a refresh: ${formatError(err)}`)
    }
  }

  async function saveNpcs(next: NpcStatBlock[]) {
    const patch = diffCharacters(
      { players: players.value, npcs: npcs.value },
      { players: players.value, npcs: next },
    )
    applyNpcs(next)
    try {
      await writeRoomPatch(patch)
    } catch (err) {
      console.error('Grindstone: failed to save NPCs to room metadata', err)
      alert(`Failed to save to Owlbear Rodeo - your changes are only local for now and may not survive a refresh: ${formatError(err)}`)
    }
  }

  function baseCharacter(input: NewCharacterInput) {
    return {
      id: crypto.randomUUID(),
      name: input.name,
      ac: input.ac,
      maxHp: input.maxHp,
      currentHp: input.maxHp,
      abilities: input.abilities,
      proficiencyBonus: input.proficiencyBonus,
      weaponIds: [],
      spellsKnown: [],
      tokenImage: input.tokenImage,
    }
  }

  // With an ownerId (a player making their own character) the new sheet is
  // linked straight away, moving that player off any character they had.
  async function createPlayer(input: NewPlayerInput, ownerId?: string) {
    const character: PlayerCharacter = {
      ...baseCharacter(input),
      level: input.level,
      className: input.className,
      hitDie: input.hitDie,
      speed: input.speed,
    }
    if (ownerId) character.ownerId = ownerId
    const others = ownerId
      ? players.value.map((p) => {
          if (p.ownerId !== ownerId) return p
          const { ownerId: _previous, ...rest } = p
          return rest
        })
      : players.value
    await savePlayers([...others, character])
    return character
  }

  async function createNpc(input: NewCharacterInput & { isTemplate: boolean }) {
    const character: NpcStatBlock = {
      ...baseCharacter(input),
      isTemplate: input.isTemplate,
      isEncounterCopy: false,
    }
    await saveNpcs([...npcs.value, character])
    return character
  }

  // HP bars are not redrawn from here: with players editing their own
  // HP, the change may originate on a client that isn't allowed to write
  // scene items. App.vue's GM-side watcher redraws them from any HP
  // change instead, wherever it came from.
  async function updatePlayer(id: string, patch: Partial<PlayerCharacter>) {
    await savePlayers(players.value.map((p) => (p.id === id ? { ...p, ...patch, id } : p)))
  }

  async function updateNpc(id: string, patch: Partial<NpcStatBlock>) {
    await saveNpcs(npcs.value.map((n) => (n.id === id ? { ...n, ...patch, id } : n)))
  }

  // Links a character to a connected player (or unlinks with undefined).
  // A player has one character, so linking moves them off any other one -
  // done in a single write so there's never a moment with two.
  async function assignOwner(characterId: string, ownerId: string | undefined) {
    await savePlayers(
      players.value.map((p) => {
        const { ownerId: _previous, ...rest } = p
        if (p.id === characterId) return ownerId ? { ...rest, ownerId } : rest
        return ownerId && p.ownerId === ownerId ? rest : p
      }),
    )
  }

  async function deletePlayer(id: string) {
    await savePlayers(players.value.filter((p) => p.id !== id))
    await deleteTokensForStatBlockIds([id])
  }

  async function deleteNpc(id: string) {
    await saveNpcs(npcs.value.filter((n) => n.id !== id))
    await deleteTokensForStatBlockIds([id])
  }

  // "Goblin" -> "Goblin 2" -> "Goblin 3" ... counted against currently
  // active encounter copies sharing the same base name (not the template
  // itself - templates never appear in target lists).
  function nextEncounterName(baseName: string): string {
    const strip = (name: string) => name.replace(/\s+\d+$/, '')
    const base = strip(baseName)
    const activeCopies = npcs.value.filter((n) => n.isEncounterCopy && strip(n.name) === base)
    if (activeCopies.length === 0) return base
    let n = 2
    while (activeCopies.some((e) => e.name === `${base} ${n}`)) n++
    return `${base} ${n}`
  }

  async function spawnEncounterCopy(templateId: string) {
    const template = npcs.value.find((n) => n.id === templateId)
    if (!template) return undefined
    const copy: NpcStatBlock = {
      ...template,
      id: crypto.randomUUID(),
      name: nextEncounterName(template.name),
      isTemplate: false,
      isEncounterCopy: true,
      currentHp: template.maxHp,
    }
    await saveNpcs([...npcs.value, copy])
    return copy
  }

  async function clearEncounter() {
    const encounterCopyIds = npcs.value.filter((n) => n.isEncounterCopy).map((n) => n.id)
    await saveNpcs(npcs.value.filter((n) => !n.isEncounterCopy))
    await deleteTokensForStatBlockIds(encounterCopyIds)
  }

  // Campaign import hands over the already-merged lists, so this is one
  // write per list rather than one per imported entry.
  async function importCharacters(nextPlayers: PlayerCharacter[], nextNpcs: NpcStatBlock[]) {
    await savePlayers(nextPlayers)
    await saveNpcs(nextNpcs)
  }

  // Players and non-copy NPCs (templates + named NPCs) share one namespace,
  // so target lists and token placement never have to disambiguate two
  // "Aragorn"s. Encounter copies are exempt - nextEncounterName() already
  // keeps those unique among themselves, and a copy is meant to share its
  // template's base name.
  function nameConflict(name: string, excludeId?: string): boolean {
    const target = name.trim().toLowerCase()
    const pool: { id: string; name: string }[] = [...players.value, ...npcs.value.filter((n) => !n.isEncounterCopy)]
    return pool.some((c) => c.id !== excludeId && c.name.trim().toLowerCase() === target)
  }

  return {
    players,
    npcs,
    ready,
    load,
    dispose,
    createPlayer,
    createNpc,
    updatePlayer,
    updateNpc,
    deletePlayer,
    deleteNpc,
    spawnEncounterCopy,
    clearEncounter,
    importCharacters,
    assignOwner,
    nameConflict,
  }
})
