<script setup lang="ts">
import OBR from '@owlbear-rodeo/sdk'
import { imagePickerMessage } from '../lib/obr/pickerError'
import { computed, ref, watch } from 'vue'
import { beginPlacement, beginRepeatedPlacement, unplacedStatBlockId } from '../lib/obr/placementTool'
import { proficiencyForLevel } from '../lib/dnd'
import { canEditCharacter } from '../lib/permissions'
import { useCharactersStore } from '../stores/characters'
import type { NpcStatBlock, PlayerCharacter } from '../types/character'
import CampaignPanel from './CampaignPanel.vue'
import CharacterForm, { type CharacterFormValues } from './CharacterForm.vue'
import CharacterPicker from './CharacterPicker.vue'
import CharacterRow from './CharacterRow.vue'
import CharacterSheet from './CharacterSheet.vue'
import OwnerLink from './OwnerLink.vue'
import PlayerSheet from './sheet/PlayerSheet.vue'

const props = defineProps<{ isGm: boolean; playerId?: string }>()

const store = useCharactersStore()

const activeTab = ref<'players' | 'npcs'>('players')
const search = ref('')

type Mode =
  | { kind: 'list' }
  | { kind: 'create' }
  | { kind: 'edit'; id: string }
  | { kind: 'view'; id: string }
  | { kind: 'campaign' }
  | { kind: 'choose' }
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

// A player's whole interface is their own character sheet - no roster,
// party list or NPCs. So what's shown is derived: the GM sees whatever
// `mode` says, a player is pinned to their sheet, its edit form, or the
// picker for claiming/switching/creating a character.
const ownCharacter = computed(() =>
  props.playerId ? store.players.find((p) => p.ownerId === props.playerId) : undefined,
)
const unclaimed = computed(() => store.players.filter((p) => !p.ownerId))

const view = computed<Mode>(() => {
  if (props.isGm) return mode.value
  const m = mode.value
  if (m.kind === 'create') return m
  const own = ownCharacter.value
  if (!own || m.kind === 'choose') return { kind: 'choose' }
  return m.kind === 'edit' ? { kind: 'edit', id: own.id } : { kind: 'view', id: own.id }
})

// Players are trusted to link themselves. If the name they joined the room
// with matches an unclaimed character, claim it for them - once per load,
// so it never fights a deliberate switch.
let autoMatched = false
watch(
  () => [props.isGm, props.playerId, store.ready, store.players] as const,
  async ([isGm, playerId, ready]) => {
    if (autoMatched || isGm || !playerId || !ready || !OBR.isAvailable) return
    autoMatched = true
    if (ownCharacter.value) return
    const name = (await OBR.player.getName()).trim().toLowerCase()
    if (!name) return
    const match = unclaimed.value.find((p) => p.name.trim().toLowerCase() === name)
    if (match) await store.assignOwner(match.id, playerId)
  },
  { immediate: true },
)

function claim(id: string) {
  if (!props.playerId) return
  void store.assignOwner(id, props.playerId)
  mode.value = { kind: 'list' }
}

function canEdit(character: PlayerCharacter | NpcStatBlock) {
  return canEditCharacter(character, { isGm: props.isGm, playerId: props.playerId })
}

const editingCharacter = computed(() => (view.value.kind === 'edit' ? findCharacter(view.value.id) : undefined))
const viewingCharacter = computed(() => (view.value.kind === 'view' ? findCharacter(view.value.id) : undefined))

function toFormValues(character: PlayerCharacter | NpcStatBlock): CharacterFormValues {
  return {
    name: character.name,
    ac: character.ac,
    maxHp: character.maxHp,
    proficiencyBonus: character.proficiencyBonus,
    abilities: character.abilities,
    isTemplate: isNpc(character) ? character.isTemplate : false,
    tokenImage: character.tokenImage,
    ...(isNpc(character)
      ? {}
      : {
          level: character.level,
          className: character.className,
          hitDie: character.hitDie,
          speed: character.speed,
        }),
  }
}

function handleSubmit(values: CharacterFormValues) {
  const current = view.value
  const excludeId = current.kind === 'edit' ? current.id : undefined
  if (store.nameConflict(values.name, excludeId)) {
    formError.value = `"${values.name}" is already in use by another PC or NPC.`
    return
  }
  formError.value = undefined

  // Don't wait on the room-metadata round trip to close the form - the
  // store already applies the change to local state synchronously, so
  // waiting here just leaves the form open (and inviting a double
  // submit) for as long as the network write takes.
  // isTemplate is NPC-only: leaking it onto a PC would make it look like an
  // NPC (the two are told apart by that field's presence). A PC's
  // proficiency follows from their level.
  const { isTemplate: _isTemplate, ...pcValues } = values
  if (pcValues.level) pcValues.proficiencyBonus = proficiencyForLevel(pcValues.level)

  if (current.kind === 'create') {
    if (activeTab.value === 'players') {
      // A player creating a character is creating their own.
      void store.createPlayer(pcValues, props.isGm ? undefined : props.playerId)
    } else {
      void store.createNpc(values)
    }
  } else if (current.kind === 'edit') {
    if (activeTab.value === 'players') {
      void store.updatePlayer(current.id, pcValues)
    } else {
      void store.updateNpc(current.id, values)
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
  await beginRepeatedPlacement(
    async () => {
      const copy = await store.spawnEncounterCopy(template.id)
      if (!copy?.tokenImage) return undefined
      return { name: copy.name, statBlockId: copy.id, tokenImage: copy.tokenImage, currentHp: copy.currentHp, maxHp: copy.maxHp }
    },
    // The next copy is spawned ahead of its click, so ending the session
    // leaves one that never got a token - remove it.
    (id) => store.deleteNpc(id),
  )
}

async function handleChangeImage(character: PlayerCharacter | NpcStatBlock) {
  if (!canEdit(character)) return
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
    alert(imagePickerMessage(err))
  }
}

function showCharacter(kind: 'players' | 'npcs', id: string) {
  if (!props.isGm) return
  activeTab.value = kind
  mode.value = { kind: 'view', id }
}

defineExpose({ showCharacter })
</script>

<template>
  <div class="flex flex-col gap-3 p-3">
    <div v-if="props.isGm" class="flex rounded-md bg-hover p-1 text-sm">
      <button
        type="button"
        class="flex-1 rounded px-2 py-1 font-medium"
        :class="activeTab === 'players' ? 'bg-accent text-accent-fg' : 'text-muted hover:bg-hover'"
        @click="activeTab = 'players'; mode = { kind: 'list' }"
      >
        PCs
      </button>
      <button
        type="button"
        class="flex-1 rounded px-2 py-1 font-medium"
        :class="activeTab === 'npcs' ? 'bg-accent text-accent-fg' : 'text-muted hover:bg-hover'"
        @click="activeTab = 'npcs'; mode = { kind: 'list' }"
      >
        NPCs
      </button>
    </div>

    <template v-if="view.kind === 'create' || view.kind === 'edit'">
      <h2 class="text-sm font-semibold text-fg">
        {{ view.kind === 'create' ? 'New' : 'Edit' }} {{ activeTab === 'players' ? 'PC' : 'NPC' }}
      </h2>
      <CharacterForm
        :kind="activeTab === 'players' ? 'player' : 'npc'"
        :initial="editingCharacter ? toFormValues(editingCharacter) : undefined"
        :error-message="formError"
        @submit="handleSubmit"
        @cancel="mode = { kind: 'list' }"
      />
    </template>

    <CampaignPanel v-else-if="view.kind === 'campaign'" @close="mode = { kind: 'list' }" />

    <template v-else-if="view.kind === 'view' && viewingCharacter">
      <div class="flex items-center justify-between">
        <button v-if="props.isGm" type="button" class="text-sm text-muted hover:underline" @click="mode = { kind: 'list' }">← Back</button>
        <button v-else type="button" class="text-sm text-muted hover:underline" @click="mode = { kind: 'choose' }">
          Switch PC
        </button>
        <div class="flex gap-2">
          <button
            v-if="canEdit(viewingCharacter)"
            type="button"
            class="text-sm text-fg hover:underline"
            @click="openEdit(viewingCharacter!.id)"
          >
            Edit
          </button>
          <button
            v-if="props.isGm"
            type="button"
            class="text-sm text-danger hover:underline"
            @click="handleDelete(viewingCharacter!.id, activeTab)"
          >
            Delete
          </button>
        </div>
      </div>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <button
            v-if="canEdit(viewingCharacter)"
            type="button"
            title="Change image"
            class="group relative h-10 w-10 shrink-0 rounded-full"
            @click="handleChangeImage(viewingCharacter!)"
          >
            <img
              v-if="viewingCharacter.tokenImage"
              :src="viewingCharacter.tokenImage.image.url"
              alt=""
              class="h-10 w-10 rounded-full border border-line object-cover"
            />
            <div
              v-else
              class="flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-line text-xs text-faint"
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
              class="h-10 w-10 shrink-0 rounded-full border border-line object-cover"
            />
            <div
              v-else
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dashed border-line text-xs text-faint"
            >
              ?
            </div>
          </template>
          <h2 class="text-lg font-semibold">{{ viewingCharacter.name }}</h2>
        </div>
        <button
          type="button"
          class="rounded-md border border-line px-2 py-1 text-xs font-medium text-fg hover:bg-hover"
          @click="handlePlace(viewingCharacter!)"
        >
          Place on map
        </button>
      </div>
      <CharacterSheet
        v-if="isNpc(viewingCharacter)"
        :character="viewingCharacter"
        :editable-hp="canEdit(viewingCharacter)"
        @update-hp="(hp) => handleUpdateHp(viewingCharacter!.id, activeTab, hp)"
      />
      <PlayerSheet
        v-else
        :character="viewingCharacter"
        :editable="canEdit(viewingCharacter)"
        @patch="(patch) => store.updatePlayer(viewingCharacter!.id, patch)"
        @update-hp="(hp) => handleUpdateHp(viewingCharacter!.id, 'players', hp)"
      />
      <OwnerLink v-if="props.isGm && activeTab === 'players'" :character="viewingCharacter as PlayerCharacter" />
    </template>

    <CharacterPicker
      v-else-if="view.kind === 'choose'"
      :unclaimed="unclaimed"
      :can-cancel="!!ownCharacter"
      @pick="claim"
      @create="openCreate"
      @cancel="mode = { kind: 'list' }"
    />

    <template v-else>
      <div class="flex gap-2">
        <input
          v-model="search"
          type="search"
          placeholder="Search..."
          class="flex-1 rounded-md border border-line px-2 py-1 text-sm"
        />
        <button
          v-if="props.isGm"
          type="button"
          class="rounded-md bg-accent px-3 py-1 text-sm font-medium text-accent-fg hover:brightness-110"
          @click="openCreate"
        >
          + New
        </button>
        <button
          v-if="props.isGm"
          type="button"
          class="rounded-md border border-line px-2 py-1 text-sm text-fg hover:bg-hover"
          title="Export or import campaign.json"
          @click="mode = { kind: 'campaign' }"
        >
          Backup
        </button>
      </div>

      <template v-if="activeTab === 'players'">
        <p v-if="filteredPlayers.length === 0" class="text-sm text-faint">No PCs yet.</p>
        <ul class="flex flex-col gap-1">
          <li v-for="player in filteredPlayers" :key="player.id">
            <CharacterRow
              :character="player"
              :note="player.ownerId ? undefined : 'not linked'"
              show-place
              @view="mode = { kind: 'view', id: player.id }"
              @place="handlePlace(player)"
            />
          </li>
        </ul>
      </template>

      <template v-else>
        <div class="flex flex-col gap-1">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">Roster</h3>
          <p v-if="npcRoster.length === 0" class="text-sm text-faint">No NPCs yet.</p>
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
            <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">Active encounter</h3>
            <button
              v-if="props.isGm && activeEncounter.length > 0"
              type="button"
              class="text-xs text-danger hover:underline"
              @click="handleClearEncounter"
            >
              Clear encounter
            </button>
          </div>
          <p v-if="activeEncounter.length === 0" class="text-sm text-faint">Nothing in the current encounter.</p>
          <ul class="flex flex-col gap-1">
            <li v-for="npc in activeEncounter" :key="npc.id">
              <CharacterRow
                :character="npc"
                show-place
                :awaiting-placement="npc.id === unplacedStatBlockId"
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
