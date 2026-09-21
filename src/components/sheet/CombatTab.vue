<script setup lang="ts">
import type { PlayerCharacter } from '../../types/character'
import VitalsRow from '../VitalsRow.vue'
import StatStrip from './StatStrip.vue'

const props = defineProps<{ character: PlayerCharacter; editable: boolean }>()
const emit = defineEmits<{ patch: [Partial<PlayerCharacter>]; 'update-hp': [number] }>()

const saves = () => props.character.deathSaves ?? { successes: 0, failures: 0 }

// Tapping the dot you're already at steps back, so a mis-tap is undoable.
function setSaves(kind: 'successes' | 'failures', count: number) {
  if (!props.editable) return
  const current = saves()
  emit('patch', { deathSaves: { ...current, [kind]: current[kind] === count ? count - 1 : count } })
}

function resetSaves() {
  emit('patch', { deathSaves: { successes: 0, failures: 0 } })
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <VitalsRow :character="character" :editable-hp="editable" @update-hp="(hp) => emit('update-hp', hp)" />
    <StatStrip :character="character" />

    <div class="flex flex-col gap-2 rounded-md border border-line p-3">
      <div class="flex items-center justify-between">
        <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">Death saves</h3>
        <button v-if="editable" type="button" class="text-xs text-muted hover:underline" @click="resetSaves">Reset</button>
      </div>
      <div v-for="kind in (['successes', 'failures'] as const)" :key="kind" class="flex items-center justify-between text-sm">
        <span class="capitalize">{{ kind }}</span>
        <div class="flex gap-2">
          <button
            v-for="n in 3"
            :key="n"
            type="button"
            class="h-6 w-6 rounded-full border"
            :class="[
              saves()[kind] >= n ? (kind === 'successes' ? 'border-success bg-success' : 'border-danger bg-danger') : 'border-line',
              editable ? '' : 'pointer-events-none',
            ]"
            :aria-label="`${kind} ${n}`"
            @click="setSaves(kind, n)"
          />
        </div>
      </div>
    </div>

    <div class="rounded-md border border-dashed border-line p-4 text-center text-sm text-muted">
      Weapons and attack bonuses will appear here once the Armory is built.
    </div>
  </div>
</template>
