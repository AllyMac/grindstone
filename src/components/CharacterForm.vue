<script setup lang="ts">
import OBR from '@owlbear-rodeo/sdk'
import { imagePickerMessage } from '../lib/obr/pickerError'
import { reactive } from 'vue'
import { HIT_DICE } from '../lib/dnd'
import type { AbilityScores, TokenImage } from '../types/character'
import AbilityScoreGrid from './AbilityScoreGrid.vue'

export interface CharacterFormValues {
  name: string
  ac: number
  maxHp: number
  proficiencyBonus: number
  abilities: AbilityScores
  isTemplate: boolean
  tokenImage?: TokenImage
  // PCs only (the full sheet); proficiency is derived from level.
  level?: number
  className?: string
  hitDie?: number
  speed?: number
}

const props = defineProps<{
  kind: 'player' | 'npc'
  initial?: CharacterFormValues
  errorMessage?: string
}>()
const emit = defineEmits<{
  submit: [CharacterFormValues]
  cancel: []
}>()

const form = reactive<CharacterFormValues>(
  props.initial
    ? {
        ...props.initial,
        ...(props.kind === 'player'
          ? { level: props.initial.level ?? 1, hitDie: props.initial.hitDie ?? 8, speed: props.initial.speed ?? 30 }
          : {}),
      }
    : {
        name: '',
        ac: 10,
        maxHp: 10,
        proficiencyBonus: 2,
        isTemplate: false,
        ...(props.kind === 'player' ? { level: 1, className: '', hitDie: 8, speed: 30 } : {}),
        abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      },
)

async function chooseTokenImage() {
  if (!OBR.isAvailable) {
    alert("Token images come from Owlbear's asset library, which isn't available outside Owlbear Rodeo.")
    return
  }
  try {
    const [picked] = await OBR.assets.downloadImages(false, form.name, 'CHARACTER')
    if (picked) form.tokenImage = { image: picked.image, grid: picked.grid }
  } catch (err) {
    console.error('Grindstone: failed to choose token image', err)
    alert(imagePickerMessage(err))
  }
}

function submit() {
  if (!form.name.trim()) return
  emit('submit', { ...form, name: form.name.trim() })
}
</script>

<template>
  <form class="flex flex-col gap-3" @submit.prevent="submit">
    <label class="flex flex-col gap-1 text-sm">
      Name
      <input v-model="form.name" type="text" required class="rounded-md border border-line px-2 py-1" />
    </label>

    <div class="flex flex-col gap-1 text-sm">
      <span>Token image</span>
      <div class="flex items-center gap-2">
        <img
          v-if="form.tokenImage"
          :src="form.tokenImage.image.url"
          alt=""
          class="h-10 w-10 rounded-full border border-line object-cover"
        />
        <div v-else class="flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-line text-xs text-faint">
          ?
        </div>
        <button
          type="button"
          class="rounded-md border border-line px-2 py-1 text-xs font-medium text-fg hover:bg-hover"
          @click="chooseTokenImage"
        >
          {{ form.tokenImage ? 'Change' : 'Choose image…' }}
        </button>
      </div>
    </div>

    <div class="grid grid-cols-3 gap-2">
      <label class="flex flex-col gap-1 text-sm">
        AC
        <input v-model.number="form.ac" type="number" class="rounded-md border border-line px-2 py-1" />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        Max HP
        <input v-model.number="form.maxHp" type="number" class="rounded-md border border-line px-2 py-1" />
      </label>
      <label v-if="kind === 'npc'" class="flex flex-col gap-1 text-sm">
        Prof. bonus
        <input v-model.number="form.proficiencyBonus" type="number" class="rounded-md border border-line px-2 py-1" />
      </label>
      <label v-else class="flex flex-col gap-1 text-sm">
        Speed
        <input v-model.number="form.speed" type="number" min="0" class="rounded-md border border-line px-2 py-1" />
      </label>
    </div>

    <div v-if="kind === 'player'" class="grid grid-cols-3 gap-2">
      <label class="flex flex-col gap-1 text-sm">
        Level
        <input v-model.number="form.level" type="number" min="1" max="20" class="rounded-md border border-line px-2 py-1" />
      </label>
      <label class="col-span-2 flex flex-col gap-1 text-sm">
        Class
        <input v-model="form.className" type="text" class="rounded-md border border-line px-2 py-1" />
      </label>
      <label class="col-span-3 flex flex-col gap-1 text-sm">
        Hit die
        <select v-model.number="form.hitDie" class="rounded-md px-2 py-1">
          <option v-for="d in HIT_DICE" :key="d" :value="d">d{{ d }}</option>
        </select>
      </label>
    </div>

    <AbilityScoreGrid v-model="form.abilities" editable />

    <label
      v-if="kind === 'npc'"
      class="flex items-start gap-2 rounded-md border border-warn/40 bg-warn/15 p-2 text-sm"
    >
      <input v-model="form.isTemplate" type="checkbox" class="mt-1" />
      <span>
        <strong>Reusable template</strong> — spawns a fresh, independent copy each time it's added to an
        encounter (generic mooks like "Goblin"). Leave unchecked for a named, recurring NPC that persists
        between appearances, like a player character. Picking wrong is awkward to unwind later.
      </span>
    </label>

    <p v-if="errorMessage" class="rounded-md border border-danger/40 bg-danger/15 px-2 py-1.5 text-sm text-danger">
      {{ errorMessage }}
    </p>

    <div class="flex justify-end gap-2 pt-2">
      <button type="button" class="rounded-md px-3 py-1.5 text-sm text-fg hover:bg-hover" @click="emit('cancel')">
        Cancel
      </button>
      <button type="submit" class="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:brightness-110">
        {{ props.initial ? 'Save' : 'Create' }}
      </button>
    </div>
  </form>
</template>
