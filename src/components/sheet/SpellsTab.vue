<script setup lang="ts">
import { computed, ref } from 'vue'
import { ABILITIES, signed, spellAttackBonus, spellSaveDc } from '../../lib/dnd'
import type { AbilityKey, PlayerCharacter } from '../../types/character'

const props = defineProps<{ character: PlayerCharacter; editable: boolean }>()
const emit = defineEmits<{ patch: [Partial<PlayerCharacter>] }>()

const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const ordinal = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][n] ?? 'th'}`

// Always 9 entries so a level can be indexed without checks.
const slots = computed(() => LEVELS.map((_, i) => props.character.spellSlots?.[i] ?? { max: 0, used: 0 }))
const activeLevels = computed(() => LEVELS.filter((n) => slots.value[n - 1].max > 0))
const editingSlots = ref(false)

function saveSlots(next: { max: number; used: number }[]) {
  emit('patch', { spellSlots: next })
}

function setSlot(level: number, patch: Partial<{ max: number; used: number }>) {
  const next = slots.value.map((s) => ({ ...s }))
  const slot = next[level - 1]
  Object.assign(slot, patch)
  slot.max = Math.max(0, slot.max)
  slot.used = Math.max(0, Math.min(slot.max, slot.used))
  saveSlots(next)
}

function setMax(level: number, event: Event) {
  const value = Number.parseInt((event.target as HTMLInputElement).value, 10)
  setSlot(level, { max: Number.isNaN(value) ? 0 : value })
}

const restoreAll = () => saveSlots(slots.value.map((s) => ({ ...s, used: 0 })))

function setAbility(event: Event) {
  const value = (event.target as HTMLSelectElement).value as AbilityKey | ''
  emit('patch', { spellcastingAbility: value || undefined })
}

const dc = computed(() => spellSaveDc(props.character))
const attack = computed(() => spellAttackBonus(props.character))
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="grid grid-cols-3 gap-2 text-center">
      <div class="rounded-md border border-line p-2">
        <div class="text-xs text-muted">Save DC</div>
        <div class="text-lg font-semibold">{{ dc ?? '-' }}</div>
      </div>
      <div class="rounded-md border border-line p-2">
        <div class="text-xs text-muted">Attack</div>
        <div class="text-lg font-semibold">{{ attack === undefined ? '-' : signed(attack) }}</div>
      </div>
      <label class="flex flex-col rounded-md border border-line p-2">
        <span class="text-xs text-muted">Casting stat</span>
        <select v-if="editable" :value="character.spellcastingAbility ?? ''" class="rounded px-1 py-0.5 text-sm" @change="setAbility">
          <option value="">None</option>
          <option v-for="a in ABILITIES" :key="a.key" :value="a.key">{{ a.label }}</option>
        </select>
        <span v-else class="text-lg font-semibold uppercase">{{ character.spellcastingAbility ?? '-' }}</span>
      </label>
    </div>

    <div class="flex flex-col gap-2">
      <div class="flex items-center justify-between">
        <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">Spell slots</h3>
        <div v-if="editable" class="flex gap-3 text-xs">
          <button type="button" class="text-muted hover:underline" @click="restoreAll">Restore all</button>
          <button type="button" class="text-accent hover:underline" @click="editingSlots = !editingSlots">
            {{ editingSlots ? 'Done' : 'Edit slots' }}
          </button>
        </div>
      </div>

      <p v-if="activeLevels.length === 0 && !editingSlots" class="text-sm text-muted">No spell slots.</p>

      <div v-if="!editingSlots" class="flex flex-col gap-1">
        <div v-for="n in activeLevels" :key="n" class="flex items-center justify-between rounded-md border border-line px-3 py-2">
          <span class="text-sm">{{ ordinal(n) }} level</span>
          <div class="flex items-center gap-2">
            <button
              v-if="editable"
              type="button"
              class="flex h-7 w-7 items-center justify-center rounded-md border border-line text-lg leading-none hover:bg-hover"
              :disabled="slots[n - 1].used >= slots[n - 1].max"
              title="Use a slot"
              @click="setSlot(n, { used: slots[n - 1].used + 1 })"
            >
              −
            </button>
            <span class="w-14 text-center text-lg font-semibold tabular-nums">
              {{ slots[n - 1].max - slots[n - 1].used }} / {{ slots[n - 1].max }}
            </span>
            <button
              v-if="editable"
              type="button"
              class="flex h-7 w-7 items-center justify-center rounded-md border border-line text-lg leading-none hover:bg-hover"
              :disabled="slots[n - 1].used <= 0"
              title="Recover a slot"
              @click="setSlot(n, { used: slots[n - 1].used - 1 })"
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div v-else class="grid grid-cols-3 gap-2">
        <label v-for="n in LEVELS" :key="n" class="flex flex-col items-center gap-1 rounded-md border border-line p-2 text-xs text-muted">
          {{ ordinal(n) }}
          <input
            type="number"
            min="0"
            :value="slots[n - 1].max"
            class="w-full rounded px-1 py-0.5 text-center text-base text-fg"
            @change="setMax(n, $event)"
          />
        </label>
      </div>
    </div>

    <div class="rounded-md border border-dashed border-line p-4 text-center text-sm text-muted">
      Cantrips and spells will be added here once the Spellbook is built.
    </div>
  </div>
</template>
