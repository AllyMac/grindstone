<script setup lang="ts">
import OBR from '@owlbear-rodeo/sdk'
import { computed, ref } from 'vue'
import { beginPlacement, beginRepeatedPlacement } from '../lib/obr/placementTool'
import { useCharactersStore } from '../stores/characters'
import type { NpcStatBlock, PlayerCharacter } from '../types/character'
import CharacterForm, { type CharacterFormValues } from './CharacterForm.vue'
import CharacterRow from './CharacterRow.vue'
import CharacterSheet from './CharacterSheet.vue'

const props = defineProps<{ isGm: boolean }>()

const store = useCharactersStore()

const activeTab = ref<'players' | 'npcs'>('players')
const search = ref('')

type Mode = { kind: 'list' } | { kind: 'create' } | { kind: 'edit'; id: string } | { kind: 'view'; id: string }
const mode = ref<Mode>({ kind: 'list' })
const formError = ref<string>()

function openCreate() {
  formError.value = undefined
  mode.value = { kind: 'create' }
}

function openEdit(id: string) {
  formError.value = undefined
  mode.value = { kind: 'edit', id }
}

function matches(name: string) {
  return name.toLowerCase().includes(search.value.trim().toLowerCase())
}

const filteredPlayers = computed(() => store.players.filter((p) => matches(p.name)))
const npcRoster = computed(() => store.npcs.filter((n) => !n.isEncounterCopy && matches(n.name)))
const activeEncounter = computed(() => store.npcs.filter((n) => n.isEncounterCopy && matches(n.name)))

function findCharacter(id: string): PlayerCharacter | NpcStatBlock | undefined {
  return store.players.find((p) => p.id === id) ?? store.npcs.find((n) => n.id === id)
}

function isNpc(character: PlayerCharacter | NpcStatBlock): character is NpcStatBlock {
  return 'isTemplate' in character
}

const editingCharacter = computed(() => (mode.value.kind === 'edit' ? findCharacter(mode.value.id) : undefined))
const viewingCharacter = computed(() => (mode.value.kind === 'view' ? findCharacter(mode.value.id) : undefined))

function toFormValues(character: PlayerCharacter | NpcStatBlock): CharacterFormValues {
  return {
    name: character.name,
    ac: character.ac,
    maxHp: character.maxHp,
    proficiencyBonus: character.proficiencyBonus,
    abilities: character.abilities,
    isTemplate: isNpc(character) ? character.isTemplate : false,
    tokenImage: character.tokenImage,
  }
}

function handleSubmit(values: CharacterFormValues) {
  const excludeId = mode.value.kind === 'edit' ? mode.value.id : undefined
  if (store.nameConflict(values.name, excludeId)) {
    formError.value = `"${values.name}" is already in use by another player or NPC.`
    return
  }
  formError.value = undefined

  // Don't wait on the room-metadata round trip to close the form - the
  // store already applies the change to local state synchronously, so
  // waiting here just leaves the form open (and inviting a double
  // submit) for as long as the network write takes.
  if (mode.value.kind === 'create') {
    if (activeTab.value === 'players') {
      void store.createPlayer(values)
    } else {
      void store.createNpc(values)
    }
  } else if (mode.value.kind === 'edit') {
    if (activeTab.value === 'players') {
      void store.updatePlayer(mode.value.id, values)
    } else {
      void store.updateNpc(mode.value.id, values)
    }
  }
  mode.value = { kind: 'list' }
}

async function handleDelete(id: string, kind: 'players' | 'npcs') {
  if (!confirm('Delete this character? This cannot be undone.')) return
  if (kind === 'players') {
    await store.deletePlayer(id)
  } else {
    await store.deleteNpc(id)
  }
  if (mode.value.kind === 'view' && mode.value.id === id) mode.value = { kind: 'list' }
}

async function handleUpdateHp(id: string, kind: 'players' | 'npcs', currentHp: number) {
  if (kind === 'players') {
    await store.updatePlayer(id, { currentHp })
  } else {
    await store.updateNpc(id, { currentHp })
  }
}

async function handleClearEncounter() {
  if (!confirm('Delete all current encounter copies? Named NPCs and templates are unaffected.')) return
  await store.clearEncounter()
}

async function handlePlace(character: PlayerCharacter | NpcStatBlock) {
  // Placing a template spawns its own encounter copy each click (same
  // as "+ Encounter") - the token links to the copy, never the template
  // itself.
  if (isNpc(character) && character.isTemplate) {
    await handleSpawnAndPlace(character)
    return
  }
  if (!character.tokenImage) {
    alert('Set a token image for this character first (Edit → Token image) before placing it on the map.')
    return
  }
  await beginPlacement(character.name, character.id, character.tokenImage, character.currentHp, character.maxHp)
}

async function handleSpawnAndPlace(template: NpcStatBlock) {
  if (!template.tokenImage) {
    alert('Set a token image for this template first (Edit → Token image) before placing it on the map.')
    return
  }
  // Stays armed after each click so the GM can drop a whole group (four
  // goblins = four clicks) without reopening the picker each time -
  // Escape or the Cancel banner ends the session.
  await beginRepeatedPlacement(async () => {
    const copy = await store.spawnEncounterCopy(template.id)
    if (!copy?.tokenImage) return undefined
    return { name: copy.name, statBlockId: copy.id, tokenImage: copy.tokenImage, currentHp: copy.currentHp, maxHp: copy.maxHp }
  })
}

async function handleChangeImage(character: PlayerCharacter | NpcStatBlock) {
  if (!OBR.isAvailable) {
    alert("Token images come from Owlbear's asset library, which isn't available outside Owlbear Rodeo.")
    return
  }
  try {
    const [picked] = await OBR.assets.downloadImages(false, character.name, 'CHARACTER')
    if (!picked) return
    const tokenImage = { image: picked.image, grid: picked.grid }
    if (isNpc(character)) {
      await store.updateNpc(character.id, { tokenImage })
    } else {
      await store.updatePlayer(character.id, { tokenImage })
    }
  } catch (err) {
    console.error('Grindstone: failed to change token image', err)
    alert('Could not open the image picker.')
  }
}

function showCharacter(kind: 'players' | 'npcs', id: string) {
  activeTab.value = kind
  mode.value = { kind: 'view', id }
}

defineExpose({ showCharacter })
</script>

<template>
  <div class="flex flex-col gap-3 p-3">
    <div class="flex rounded-md bg-stone-100 p-1 text-sm">
      <button
        type="button"
        class="flex-1 rounded px-2 py-1 font-medium"
        :class="activeTab === 'players' ? 'bg-white shadow-sm' : 'text-stone-500'"
        @click="activeTab = 'players'; mode = { kind: 'list' }"
      >
        Players
      </button>
      <button
        type="button"
        class="flex-1 rounded px-2 py-1 font-medium"
        :class="activeTab === 'npcs' ? 'bg-white shadow-sm' : 'text-stone-500'"
        @click="activeTab = 'npcs'; mode = { kind: 'list' }"
      >
        NPCs
      </button>
    </div>

    <template v-if="mode.kind === 'create' || mode.kind === 'edit'">
      <h2 class="text-sm font-semibold text-stone-700">
        {{ mode.kind === 'create' ? 'New' : 'Edit' }} {{ activeTab === 'players' ? 'player' : 'NPC' }}
      </h2>
      <CharacterForm
        :kind="activeTab === 'players' ? 'player' : 'npc'"
        :initial="editingCharacter ? toFormValues(editingCharacter) : undefined"
        :error-message="formError"
        @submit="handleSubmit"
        @cancel="mode = { kind: 'list' }"
      />
    </template>

    <template v-else-if="mode.kind === 'view' && viewingCharacter">
      <div class="flex items-center justify-between">
        <button type="button" class="text-sm text-stone-500 hover:underline" @click="mode = { kind: 'list' }">← Back</button>
        <div class="flex gap-2" v-if="props.isGm">
          <button type="button" class="text-sm text-stone-600 hover:underline" @click="openEdit(viewingCharacter!.id)">
            Edit
          </button>
          <button
            type="button"
            class="text-sm text-red-600 hover:underline"
            @click="handleDelete(viewingCharacter!.id, activeTab)"
          >
            Delete
          </button>
        </div>
      </div>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <button
            v-if="props.isGm"
            type="button"
            title="Change image"
            class="group relative h-10 w-10 shrink-0 rounded-full"
            @click="handleChangeImage(viewingCharacter!)"
          >
            <img
              v-if="viewingCharacter.tokenImage"
              :src="viewingCharacter.tokenImage.image.url"
              alt=""
              class="h-10 w-10 rounded-full border border-stone-300 object-cover"
            />
            <div
              v-else
              class="flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-stone-300 text-xs text-stone-300"
            >
              ?
            </div>
            <span
              class="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-[10px] font-medium text-white opacity-0 group-hover:opacity-100"
            >
              Edit
            </span>
          </button>
          <template v-else>
            <img
              v-if="viewingCharacter.tokenImage"
              :src="viewingCharacter.tokenImage.image.url"
              alt=""
              class="h-10 w-10 shrink-0 rounded-full border border-stone-300 object-cover"
            />
            <div
              v-else
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dashed border-stone-300 text-xs text-stone-300"
            >
              ?
            </div>
          </template>
          <h2 class="text-lg font-semibold">{{ viewingCharacter.name }}</h2>
        </div>
        <button
          type="button"
          class="rounded-md border border-stone-300 px-2 py-1 text-xs font-medium text-stone-600 hover:bg-stone-100"
          @click="handlePlace(viewingCharacter!)"
        >
          Place on map
        </button>
      </div>
      <CharacterSheet
        :character="viewingCharacter"
        :editable-hp="props.isGm"
        @update-hp="(hp) => handleUpdateHp(viewingCharacter!.id, activeTab, hp)"
      />
    </template>

    <template v-else>
      <div class="flex gap-2">
        <input
          v-model="search"
          type="search"
          placeholder="Search..."
          class="flex-1 rounded-md border border-stone-300 px-2 py-1 text-sm"
        />
        <button
          v-if="props.isGm"
          type="button"
          class="rounded-md bg-stone-700 px-3 py-1 text-sm font-medium text-white hover:bg-stone-800"
          @click="openCreate"
        >
          + New
        </button>
      </div>

      <template v-if="activeTab === 'players'">
        <p v-if="filteredPlayers.length === 0" class="text-sm text-stone-400">No players yet.</p>
        <ul class="flex flex-col gap-1">
          <li v-for="player in filteredPlayers" :key="player.id">
            <CharacterRow
              :character="player"
              show-place
              @view="mode = { kind: 'view', id: player.id }"
              @place="handlePlace(player)"
            />
          </li>
        </ul>
      </template>

      <template v-else>
        <div class="flex flex-col gap-1">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-stone-400">Roster</h3>
          <p v-if="npcRoster.length === 0" class="text-sm text-stone-400">No NPCs yet.</p>
          <ul class="flex flex-col gap-1">
            <li v-for="npc in npcRoster" :key="npc.id">
              <CharacterRow
                :character="npc"
                :is-template="npc.isTemplate"
                :show-place="!npc.isTemplate"
                :show-spawn-encounter="npc.isTemplate && props.isGm"
                @view="mode = { kind: 'view', id: npc.id }"
                @place="handlePlace(npc)"
                @spawn-encounter="handleSpawnAndPlace(npc)"
              />
            </li>
          </ul>
        </div>

        <div class="flex flex-col gap-1">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-stone-400">Active encounter</h3>
            <button
              v-if="props.isGm && activeEncounter.length > 0"
              type="button"
              class="text-xs text-red-600 hover:underline"
              @click="handleClearEncounter"
            >
              Clear encounter
            </button>
          </div>
          <p v-if="activeEncounter.length === 0" class="text-sm text-stone-400">Nothing in the current encounter.</p>
          <ul class="flex flex-col gap-1">
            <li v-for="npc in activeEncounter" :key="npc.id">
              <CharacterRow
                :character="npc"
                show-place
                @view="mode = { kind: 'view', id: npc.id }"
                @place="handlePlace(npc)"
              />
            </li>
          </ul>
        </div>
      </template>
    </template>
  </div>
</template>
