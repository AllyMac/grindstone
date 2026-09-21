<script setup lang="ts">
import type { CharacterBase } from '../types/character'

const props = defineProps<{
  character: CharacterBase
  editableHp?: boolean
}>()
const emit = defineEmits<{ 'update-hp': [number] }>()

function adjustHp(delta: number) {
  const next = Math.max(0, Math.min(props.character.maxHp, props.character.currentHp + delta))
  emit('update-hp', next)
}

// Commits on blur/Enter rather than per keystroke, so typing "12" doesn't
// write 1 first. Out-of-range values clamp like the +/- buttons do (there
// is no temp HP to go above max), and junk reverts to what it was.
function commitHp(event: Event) {
  const input = event.target as HTMLInputElement
  const typed = Number.parseInt(input.value, 10)
  const next = Number.isNaN(typed) ? props.character.currentHp : Math.max(0, Math.min(props.character.maxHp, typed))
  input.value = String(next) // covers a clamp that leaves the prop unchanged
  if (next !== props.character.currentHp) emit('update-hp', next)
}
</script>

<template>
  <!-- HP spans two columns and its number sits in a fixed-width field, so
       the -/+ buttons stay put whether HP is 1, 12 or 123 - a value
       wrapping onto a second line used to shove them around mid-click. -->
  <div class="grid grid-cols-4 gap-2 text-sm">
    <div class="rounded-md border border-line p-2 text-center">
      <div class="text-xs text-muted">AC</div>
      <div class="text-lg font-semibold">{{ character.ac }}</div>
    </div>
    <div class="col-span-2 rounded-md border border-line p-2 text-center">
      <div class="text-xs text-muted">HP</div>
      <div class="flex items-center justify-center gap-1">
        <button
          v-if="editableHp"
          type="button"
          class="flex h-7 w-7 items-center justify-center rounded-md border border-line text-lg leading-none text-fg hover:bg-hover"
          @click="adjustHp(-1)"
        >
          −
        </button>
        <input
          v-if="editableHp"
          type="number"
          inputmode="numeric"
          min="0"
          :max="character.maxHp"
          :value="character.currentHp"
          aria-label="Current HP"
          class="w-14 rounded border border-transparent bg-transparent text-center text-lg font-semibold tabular-nums hover:border-line focus:border-line focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          @focus="($event.target as HTMLInputElement).select()"
          @keydown.enter="($event.target as HTMLInputElement).blur()"
          @change="commitHp"
        />
        <span v-else class="text-lg font-semibold tabular-nums">{{ character.currentHp }}</span>
        <span class="whitespace-nowrap text-lg font-semibold text-muted">/ {{ character.maxHp }}</span>
        <button
          v-if="editableHp"
          type="button"
          class="flex h-7 w-7 items-center justify-center rounded-md border border-line text-lg leading-none text-fg hover:bg-hover"
          @click="adjustHp(1)"
        >
          +
        </button>
      </div>
    </div>
    <div class="rounded-md border border-line p-2 text-center">
      <div class="text-xs text-muted">Prof.</div>
      <div class="text-lg font-semibold">+{{ character.proficiencyBonus }}</div>
    </div>
  </div>
</template>
