import OBR from '@owlbear-rodeo/sdk'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { db, replaceTable } from '../lib/db'
import { getRoomList, onRoomListChange, setRoomList } from '../lib/obr/roomList'
import type { AbilityScores, NpcStatBlock, PlayerCharacter } from '../types/character'

const PLAYERS_KEY = 'grindstone/players'
const NPCS_KEY = 'grindstone/npcs'

export interface NewCharacterInput {
  name: string
  ac: number
  maxHp: number
  abilities: AbilityScores
  proficiencyBonus: number
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

    const [roomPlayers, roomNpcs] = await Promise.all([
      getRoomList<PlayerCharacter>(PLAYERS_KEY),
      getRoomList<NpcStatBlock>(NPCS_KEY),
    ])
    applyPlayers(roomPlayers)
    applyNpcs(roomNpcs)
    ready.value = true

    unsubPlayers = onRoomListChange<PlayerCharacter>(PLAYERS_KEY, applyPlayers)
    unsubNpcs = onRoomListChange<NpcStatBlock>(NPCS_KEY, applyNpcs)
  }

  function dispose() {
    unsubPlayers?.()
    unsubNpcs?.()
  }

  async function savePlayers(next: PlayerCharacter[]) {
    applyPlayers(next)
    await setRoomList(PLAYERS_KEY, next)
  }

  async function saveNpcs(next: NpcStatBlock[]) {
    applyNpcs(next)
    await setRoomList(NPCS_KEY, next)
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
    await savePlayers(players.value.map((p) => (p.id === id ? { ...p, ...patch, id } : p)))
  }

  async function updateNpc(id: string, patch: Partial<NpcStatBlock>) {
    await saveNpcs(npcs.value.map((n) => (n.id === id ? { ...n, ...patch, id } : n)))
  }

  async function deletePlayer(id: string) {
    await savePlayers(players.value.filter((p) => p.id !== id))
  }

  async function deleteNpc(id: string) {
    await saveNpcs(npcs.value.filter((n) => n.id !== id))
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
    await saveNpcs(npcs.value.filter((n) => !n.isEncounterCopy))
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
  }
})
