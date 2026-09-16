<script setup lang="ts">
import type { CharacterBase } from '../types/character'
import AbilityScoreGrid from './AbilityScoreGrid.vue'

const props = defineProps<{
  character: CharacterBase
  editableHp?: boolean
}>()
const emit = defineEmits<{ 'update-hp': [number] }>()

function adjustHp(delta: number) {
  const next = Math.max(0, Math.min(props.character.maxHp, props.character.currentHp + delta))
  emit('update-hp', next)
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="grid grid-cols-3 gap-2 text-sm">
      <div class="rounded-md border border-stone-200 p-2 text-center">
        <div class="text-xs text-stone-500">AC</div>
        <div class="text-lg font-semibold">{{ character.ac }}</div>
      </div>
      <div class="rounded-md border border-stone-200 p-2 text-center">
        <div class="text-xs text-stone-500">HP</div>
        <div class="flex items-center justify-center gap-1">
          <button
            v-if="editableHp"
            type="button"
            class="rounded px-1.5 text-stone-500 hover:bg-stone-100"
            @click="adjustHp(-1)"
          >
            −
          </button>
          <span class="text-lg font-semibold">{{ character.currentHp }} / {{ character.maxHp }}</span>
          <button
            v-if="editableHp"
            type="button"
            class="rounded px-1.5 text-stone-500 hover:bg-stone-100"
            @click="adjustHp(1)"
          >
            +
          </button>
        </div>
      </div>
      <div class="rounded-md border border-stone-200 p-2 text-center">
        <div class="text-xs text-stone-500">Prof.</div>
        <div class="text-lg font-semibold">+{{ character.proficiencyBonus }}</div>
      </div>
    </div>

    <AbilityScoreGrid :model-value="character.abilities" />
  </div>
</template>
