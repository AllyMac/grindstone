<script setup lang="ts">
import { ABILITIES, SKILLS, saveBonus, signed, skillBonus, mod } from '../../lib/dnd'
import type { AbilityKey, PlayerCharacter, SkillKey, SkillProficiency } from '../../types/character'
import VitalsRow from '../VitalsRow.vue'
import StatStrip from './StatStrip.vue'

const props = defineProps<{ character: PlayerCharacter; editable: boolean }>()
const emit = defineEmits<{ patch: [Partial<PlayerCharacter>]; 'update-hp': [number] }>()

function toggleSave(ability: AbilityKey) {
  if (!props.editable) return
  const current = props.character.saveProficiencies ?? []
  emit('patch', {
    saveProficiencies: current.includes(ability) ? current.filter((a) => a !== ability) : [...current, ability],
  })
}

// none -> proficient -> expertise -> none
function cycleSkill(skill: SkillKey) {
  if (!props.editable) return
  const order: (SkillProficiency | undefined)[] = [undefined, 'proficient', 'expertise']
  const next = order[(order.indexOf(props.character.skillProficiencies?.[skill]) + 1) % order.length]
  const skills = { ...props.character.skillProficiencies }
  if (next) skills[skill] = next
  else delete skills[skill]
  emit('patch', { skillProficiencies: skills })
}

const stars = (level?: SkillProficiency) => (level === 'expertise' ? '★★' : level === 'proficient' ? '★' : '')
</script>

<template>
  <div class="flex flex-col gap-4">
    <p v-if="character.level || character.className" class="text-sm text-muted">
      <template v-if="character.level">Level {{ character.level }} </template>{{ character.className }}
    </p>

    <VitalsRow :character="character" :editable-hp="editable" @update-hp="(hp) => emit('update-hp', hp)" />
    <StatStrip :character="character" />

    <div class="grid grid-cols-3 gap-2">
      <div v-for="a in ABILITIES" :key="a.key" class="flex flex-col items-center gap-1 rounded-md border border-line p-2">
        <span class="text-xs font-semibold text-muted">{{ a.label }}</span>
        <span class="text-2xl font-semibold leading-none">{{ signed(mod(character, a.key)) }}</span>
        <span class="text-xs text-muted">{{ character.abilities[a.key] }}</span>
        <button
          type="button"
          class="mt-1 w-full rounded border px-1 py-0.5 text-xs"
          :class="[
            character.saveProficiencies?.includes(a.key) ? 'border-accent text-accent' : 'border-line text-muted',
            editable ? 'hover:bg-hover' : 'pointer-events-none',
          ]"
          :title="editable ? 'Tap to toggle save proficiency' : undefined"
          @click="toggleSave(a.key)"
        >
          Save {{ signed(saveBonus(character, a.key)) }}
        </button>
      </div>
    </div>

    <div class="flex flex-col gap-2">
      <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">Skills</h3>
      <p v-if="editable" class="text-xs text-faint">Tap a skill to cycle: none, proficient ★, expertise ★★.</p>
      <div class="grid grid-cols-1 gap-1 sm:grid-cols-2">
        <button
          v-for="skill in SKILLS"
          :key="skill.key"
          type="button"
          class="flex items-center gap-2 rounded-md border border-line px-2 py-1.5 text-left text-sm"
          :class="editable ? 'hover:bg-hover' : 'pointer-events-none'"
          @click="cycleSkill(skill.key)"
        >
          <span class="w-8 text-xs text-accent">{{ stars(character.skillProficiencies?.[skill.key]) }}</span>
          <span class="flex-1 truncate">{{ skill.label }}</span>
          <span class="text-xs uppercase text-faint">{{ skill.ability }}</span>
          <span class="w-8 text-right font-semibold tabular-nums">{{ signed(skillBonus(character, skill.key)) }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
