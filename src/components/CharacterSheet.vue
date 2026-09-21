<script setup lang="ts">
import type { CharacterBase } from '../types/character'
import AbilityScoreGrid from './AbilityScoreGrid.vue'
import VitalsRow from './VitalsRow.vue'

// The compact stat block - what NPCs get. PCs use the full tabbed sheet.
defineProps<{
  character: CharacterBase
  editableHp?: boolean
}>()
const emit = defineEmits<{ 'update-hp': [number] }>()
</script>

<template>
  <div class="flex flex-col gap-3">
    <VitalsRow :character="character" :editable-hp="editableHp" @update-hp="(hp) => emit('update-hp', hp)" />
    <AbilityScoreGrid :model-value="character.abilities" />
  </div>
</template>
