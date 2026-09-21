<script setup lang="ts">
import { abilityModifier, type AbilityScores } from '../types/character'

defineProps<{
  modelValue: AbilityScores
  editable?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [AbilityScores] }>()

const abilityKeys: (keyof AbilityScores)[] = ['str', 'dex', 'con', 'int', 'wis', 'cha']
const labels: Record<keyof AbilityScores, string> = {
  str: 'STR',
  dex: 'DEX',
  con: 'CON',
  int: 'INT',
  wis: 'WIS',
  cha: 'CHA',
}

function formatModifier(score: number): string {
  const mod = abilityModifier(score)
  return mod >= 0 ? `+${mod}` : `${mod}`
}
</script>

<template>
  <div class="grid grid-cols-3 gap-2 sm:grid-cols-6">
    <div
      v-for="key in abilityKeys"
      :key="key"
      class="flex flex-col items-center rounded-md border border-line p-2"
    >
      <span class="text-xs font-semibold text-muted">{{ labels[key] }}</span>
      <input
        v-if="editable"
        type="number"
        class="w-full border-0 bg-transparent text-center text-lg font-semibold focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        :value="modelValue[key]"
        @input="emit('update:modelValue', { ...modelValue, [key]: Number(($event.target as HTMLInputElement).value) })"
      />
      <span v-else class="text-lg font-semibold">{{ modelValue[key] }}</span>
      <span class="text-xs text-muted">{{ formatModifier(modelValue[key]) }}</span>
    </div>
  </div>
</template>
