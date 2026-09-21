<script setup lang="ts">
import type { PlayerCharacter } from '../types/character'
import CharacterRow from './CharacterRow.vue'

// A player's way onto a sheet: claim an unclaimed character, or make a new
// one. `canCancel` is set when they already have a character (switching).
defineProps<{ unclaimed: PlayerCharacter[]; canCancel: boolean }>()
const emit = defineEmits<{ pick: [id: string]; create: []; cancel: [] }>()
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center justify-between">
      <h2 class="text-sm font-semibold text-fg">Which PC is yours?</h2>
      <button v-if="canCancel" type="button" class="text-sm text-muted hover:underline" @click="emit('cancel')">
        ← Back
      </button>
    </div>

    <p v-if="unclaimed.length === 0" class="text-sm text-faint">No unclaimed PCs - make yours below.</p>
    <ul class="flex flex-col gap-1">
      <li v-for="character in unclaimed" :key="character.id">
        <CharacterRow :character="character" @view="emit('pick', character.id)" />
      </li>
    </ul>

    <button
      type="button"
      class="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:brightness-110"
      @click="emit('create')"
    >
      + Create a new PC
    </button>
  </div>
</template>
