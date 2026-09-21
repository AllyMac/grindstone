<script setup lang="ts">
import { ref } from 'vue'
import type { PlayerCharacter } from '../../types/character'
import CombatTab from './CombatTab.vue'
import InventoryTab from './InventoryTab.vue'
import NotesTab from './NotesTab.vue'
import SpellsTab from './SpellsTab.vue'
import StatsTab from './StatsTab.vue'

// The full sheet for PCs (NPCs keep the compact stat block). Tabs mirror the
// usual phone character-sheet layout.
defineProps<{ character: PlayerCharacter; editable: boolean }>()
const emit = defineEmits<{ patch: [Partial<PlayerCharacter>]; 'update-hp': [number] }>()

const TABS = [
  { key: 'stats', label: 'Stats' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'combat', label: 'Combat' },
  { key: 'spells', label: 'Spells' },
  { key: 'notes', label: 'Notes' },
] as const
const tab = ref<(typeof TABS)[number]['key']>('stats')
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex rounded-md bg-hover p-1 text-xs">
      <button
        v-for="t in TABS"
        :key="t.key"
        type="button"
        class="flex-1 rounded px-1 py-1.5 font-medium"
        :class="tab === t.key ? 'bg-accent text-accent-fg' : 'text-muted hover:bg-hover'"
        @click="tab = t.key"
      >
        {{ t.label }}
      </button>
    </div>

    <StatsTab v-if="tab === 'stats'" :character="character" :editable="editable" @patch="(p) => emit('patch', p)" @update-hp="(hp) => emit('update-hp', hp)" />
    <InventoryTab v-else-if="tab === 'inventory'" :character="character" :editable="editable" @patch="(p) => emit('patch', p)" />
    <CombatTab v-else-if="tab === 'combat'" :character="character" :editable="editable" @patch="(p) => emit('patch', p)" @update-hp="(hp) => emit('update-hp', hp)" />
    <SpellsTab v-else-if="tab === 'spells'" :character="character" :editable="editable" @patch="(p) => emit('patch', p)" />
    <NotesTab v-else :character="character" :editable="editable" @patch="(p) => emit('patch', p)" />
  </div>
</template>
