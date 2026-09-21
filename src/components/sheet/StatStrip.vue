<script setup lang="ts">
import { hitDiceText, initiative, passivePerception, signed } from '../../lib/dnd'
import type { PlayerCharacter } from '../../types/character'

defineProps<{ character: PlayerCharacter }>()
</script>

<template>
  <div class="grid grid-cols-4 gap-2 text-center">
    <div>
      <div class="text-[11px] uppercase text-muted">Speed</div>
      <div class="text-lg font-semibold">{{ character.speed ?? '-' }}</div>
    </div>
    <div>
      <div class="text-[11px] uppercase text-muted">Initiative</div>
      <div class="text-lg font-semibold">{{ signed(initiative(character)) }}</div>
    </div>
    <div>
      <div class="text-[11px] uppercase text-muted">Hit dice</div>
      <div class="text-lg font-semibold">{{ hitDiceText(character) }}</div>
    </div>
    <div>
      <div class="text-[11px] uppercase text-muted">Passive Perc.</div>
      <div class="text-lg font-semibold">{{ passivePerception(character) }}</div>
    </div>
  </div>
</template>
