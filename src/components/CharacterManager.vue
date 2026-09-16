<script setup lang="ts">
import { computed, ref } from 'vue'
import { useCharactersStore } from '../stores/characters'
import type { NpcStatBlock, PlayerCharacter } from '../types/character'
import CharacterForm, { type CharacterFormValues } from './CharacterForm.vue'
import CharacterSheet from './CharacterSheet.vue'

const props = defineProps<{ isGm: boolean }>()

const store = useCharactersStore()

const activeTab = ref<'players' | 'npcs'>('players')
const search = ref('')

type Mode = { kind: 'list' } | { kind: 'create' } | { kind: 'edit'; id: string } | { kind: 'view'; id: string }
const mode = ref<Mode>({ kind: 'list' })

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
  }
}

async function handleSubmit(values: CharacterFormValues) {
  if (mode.value.kind === 'create') {
    if (activeTab.value === 'players') {
      await store.createPlayer(values)
    } else {
      await store.createNpc(values)
    }
  } else if (mode.value.kind === 'edit') {
    if (activeTab.value === 'players') {
      await store.updatePlayer(mode.value.id, values)
    } else {
      await store.updateNpc(mode.value.id, values)
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
        @submit="handleSubmit"
        @cancel="mode = { kind: 'list' }"
      />
    </template>

    <template v-else-if="mode.kind === 'view' && viewingCharacter">
      <div class="flex items-center justify-between">
        <button type="button" class="text-sm text-stone-500 hover:underline" @click="mode = { kind: 'list' }">← Back</button>
        <div class="flex gap-2" v-if="props.isGm">
          <button type="button" class="text-sm text-stone-600 hover:underline" @click="mode = { kind: 'edit', id: viewingCharacter!.id }">
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
      <h2 class="text-lg font-semibold">{{ viewingCharacter.name }}</h2>
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
          @click="mode = { kind: 'create' }"
        >
          + New
        </button>
      </div>

      <template v-if="activeTab === 'players'">
        <p v-if="filteredPlayers.length === 0" class="text-sm text-stone-400">No players yet.</p>
        <ul class="flex flex-col gap-1">
          <li v-for="player in filteredPlayers" :key="player.id">
            <button
              type="button"
              class="flex w-full items-center justify-between rounded-md border border-stone-200 px-3 py-2 text-left text-sm hover:bg-stone-50"
              @click="mode = { kind: 'view', id: player.id }"
            >
              <span>{{ player.name }}</span>
              <span class="text-stone-400">{{ player.currentHp }}/{{ player.maxHp }} HP</span>
            </button>
          </li>
        </ul>
      </template>

      <template v-else>
        <div class="flex flex-col gap-1">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-stone-400">Roster</h3>
          <p v-if="npcRoster.length === 0" class="text-sm text-stone-400">No NPCs yet.</p>
          <ul class="flex flex-col gap-1">
            <li v-for="npc in npcRoster" :key="npc.id">
              <div class="flex items-center gap-1 rounded-md border border-stone-200 px-3 py-2 text-sm hover:bg-stone-50">
                <button type="button" class="flex flex-1 items-center justify-between text-left" @click="mode = { kind: 'view', id: npc.id }">
                  <span>{{ npc.name }}<span v-if="npc.isTemplate" class="ml-1 text-xs text-stone-400">(template)</span></span>
                  <span class="text-stone-400">{{ npc.currentHp }}/{{ npc.maxHp }} HP</span>
                </button>
                <button
                  v-if="npc.isTemplate && props.isGm"
                  type="button"
                  class="shrink-0 rounded px-2 py-1 text-xs font-medium text-stone-600 hover:bg-stone-100"
                  @click="store.spawnEncounterCopy(npc.id)"
                >
                  + Encounter
                </button>
              </div>
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
              <button
                type="button"
                class="flex w-full items-center justify-between rounded-md border border-stone-200 px-3 py-2 text-left text-sm hover:bg-stone-50"
                @click="mode = { kind: 'view', id: npc.id }"
              >
                <span>{{ npc.name }}</span>
                <span class="text-stone-400">{{ npc.currentHp }}/{{ npc.maxHp }} HP</span>
              </button>
            </li>
          </ul>
        </div>
      </template>
    </template>
  </div>
</template>
