<script setup lang="ts">
import type { NpcStatBlock, PlayerCharacter } from '../types/character'

const props = defineProps<{
  character: PlayerCharacter | NpcStatBlock
  isTemplate?: boolean
  showPlace?: boolean
  showSpawnEncounter?: boolean
  // Waiting for its map click - exists in the list but has no token yet.
  awaitingPlacement?: boolean
  // Small muted tag after the name, e.g. "not linked".
  note?: string
}>()
const emit = defineEmits<{
  view: []
  place: []
  spawnEncounter: []
}>()
</script>

<template>
  <div
    class="flex items-center gap-1 rounded-md border border-stone-200 px-2 py-1.5 text-sm hover:bg-stone-50"
    :class="{ 'opacity-40': awaitingPlacement }"
  >
    <button type="button" class="flex flex-1 items-center gap-2 text-left" @click="emit('view')">
      <img
        v-if="character.tokenImage"
        :src="character.tokenImage.image.url"
        alt=""
        class="h-8 w-8 shrink-0 rounded-full border border-stone-300 object-cover"
      />
      <div
        v-else
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-stone-300 text-xs text-stone-300"
      >
        ?
      </div>
      <span class="min-w-0 flex-1 truncate">
        {{ character.name }}<span v-if="isTemplate" class="ml-1 text-xs text-stone-400">(template)</span
        ><span v-if="note" class="ml-1 text-xs text-stone-400">({{ note }})</span
        ><span v-if="awaitingPlacement" class="ml-1 text-xs italic">(click map to place)</span>
      </span>
      <span class="shrink-0 text-xs text-stone-400">{{ character.currentHp }}/{{ character.maxHp }} HP</span>
    </button>
    <button
      v-if="showPlace"
      type="button"
      class="shrink-0 rounded px-2 py-1 text-xs font-medium text-stone-600 hover:bg-stone-100"
      @click="emit('place')"
    >
      Place
    </button>
    <button
      v-if="showSpawnEncounter"
      type="button"
      class="shrink-0 rounded px-2 py-1 text-xs font-medium text-stone-600 hover:bg-stone-100"
      @click="emit('spawnEncounter')"
    >
      + Encounter
    </button>
  </div>
</template>
