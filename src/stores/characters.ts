import OBR from '@owlbear-rodeo/sdk'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { db, replaceTable } from '../lib/db'
import { syncHpIndicator } from '../lib/obr/hpIndicators'
import { getRoomList, onRoomListChange, setRoomList } from '../lib/obr/roomList'
import { deleteTokensForStatBlockIds } from '../lib/obr/tokens'
import type { AbilityScores, NpcStatBlock, PlayerCharacter, TokenImage } from '../types/character'

const PLAYERS_KEY = 'grindstone/players'
const NPCS_KEY = 'grindstone/npcs'

export interface NewCharacterInput {
  name: string
  ac: number
  maxHp: number
  abilities: AbilityScores
  proficiencyBonus: number
  tokenImage?: TokenImage
}

export const useCharactersStore = defineStore('characters', () => {
  const players = ref<PlayerCharacter[]>([])
  const npcs = ref<NpcStatBlock[]>([])
  const ready = ref(false)

  let unsubPlayers: (() => void) | undefined
  let unsubNpcs: (() => void) | undefined

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
      const [roomPlayers, roomNpcs] = await Promise.all([
        getRoomList<PlayerCharacter>(PLAYERS_KEY),
        getRoomList<NpcStatBlock>(NPCS_KEY),
      ])
      applyPlayers(roomPlayers)
      applyNpcs(roomNpcs)
    } catch (err) {
      // Leave the cached values in place rather than wiping the UI to
      // empty over a fetch failure - room metadata is still the source
      // of truth, but only once we've actually managed to read it.
      console.error('Grindstone: failed to load room metadata, keeping cached data', err)
      alert(`Failed to load from Owlbear Rodeo - showing locally cached data instead: ${formatError(err)}`)
    }
    ready.value = true

    unsubPlayers = onRoomListChange<PlayerCharacter>(PLAYERS_KEY, applyPlayers)
    unsubNpcs = onRoomListChange<NpcStatBlock>(NPCS_KEY, applyNpcs)
  }

  function dispose() {
    unsubPlayers?.()
    unsubNpcs?.()
  }

  function formatError(err: unknown): string {
    if (err instanceof Error) return err.message
    try {
      return JSON.stringify(err, null, 2)
    } catch {
      return String(err)
    }
  }

  async function savePlayers(next: PlayerCharacter[]) {
    applyPlayers(next)
    try {
      await setRoomList(PLAYERS_KEY, next)
    } catch (err) {
      console.error('Grindstone: failed to save players to room metadata', err)
      alert(`Failed to save to Owlbear Rodeo - your changes are only local for now and may not survive a refresh: ${formatError(err)}`)
    }
  }

  async function saveNpcs(next: NpcStatBlock[]) {
    applyNpcs(next)
    try {
      await setRoomList(NPCS_KEY, next)
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

  async function createPlayer(input: NewCharacterInput) {
    const character: PlayerCharacter = baseCharacter(input)
    await savePlayers([...players.value, character])
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

  async function updatePlayer(id: string, patch: Partial<PlayerCharacter>) {
    let updated: PlayerCharacter | undefined
    await savePlayers(
      players.value.map((p) => {
        if (p.id !== id) return p
        updated = { ...p, ...patch, id }
        return updated
      }),
    )
    if (updated && ('currentHp' in patch || 'maxHp' in patch)) {
      void syncHpIndicator(id, updated.currentHp, updated.maxHp)
    }
  }

  async function updateNpc(id: string, patch: Partial<NpcStatBlock>) {
    let updated: NpcStatBlock | undefined
    await saveNpcs(
      npcs.value.map((n) => {
        if (n.id !== id) return n
        updated = { ...n, ...patch, id }
        return updated
      }),
    )
    if (updated && ('currentHp' in patch || 'maxHp' in patch)) {
      void syncHpIndicator(id, updated.currentHp, updated.maxHp)
    }
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
    nameConflict,
  }
})
