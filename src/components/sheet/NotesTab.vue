<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Feature, PlayerCharacter } from '../../types/character'

const props = defineProps<{ character: PlayerCharacter; editable: boolean }>()
const emit = defineEmits<{ patch: [Partial<PlayerCharacter>] }>()

// Typed fields commit on change (blur), not per keystroke, so each save is
// one room write rather than one per letter.
const FIELDS = [
  { key: 'race', label: 'Race' },
  { key: 'alignment', label: 'Alignment' },
  { key: 'background', label: 'Background' },
] as const

function setField(key: (typeof FIELDS)[number]['key'] | 'notes', event: Event) {
  emit('patch', { [key]: (event.target as HTMLInputElement | HTMLTextAreaElement).value.trim() })
}

const features = computed(() => props.character.features ?? [])
const adding = ref(false)
const draft = ref({ title: '', text: '' })
const editingId = ref<string>()

function startAdd() {
  draft.value = { title: '', text: '' }
  editingId.value = undefined
  adding.value = true
}

function startEdit(feature: Feature) {
  draft.value = { title: feature.title, text: feature.text }
  editingId.value = feature.id
  adding.value = true
}

function saveFeature() {
  const title = draft.value.title.trim()
  if (!title) return
  const text = draft.value.text.trim()
  emit('patch', {
    features: editingId.value
      ? features.value.map((f) => (f.id === editingId.value ? { ...f, title, text } : f))
      : [...features.value, { id: crypto.randomUUID(), title, text }],
  })
  adding.value = false
}

function deleteFeature(id: string) {
  if (!confirm('Delete this feature?')) return
  emit('patch', { features: features.value.filter((f) => f.id !== id) })
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="grid grid-cols-1 gap-2">
      <label v-for="f in FIELDS" :key="f.key" class="flex flex-col gap-1 rounded-md border border-line p-2">
        <span class="text-xs text-muted">{{ f.label }}</span>
        <input v-if="editable" type="text" :value="character[f.key] ?? ''" class="rounded px-2 py-1 text-sm" @change="setField(f.key, $event)" />
        <span v-else class="text-sm">{{ character[f.key] || '-' }}</span>
      </label>
    </div>

    <div class="flex flex-col gap-2">
      <div class="flex items-center justify-between">
        <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">Features &amp; traits</h3>
        <button v-if="editable && !adding" type="button" class="text-xs text-accent hover:underline" @click="startAdd">+ Add</button>
      </div>

      <form v-if="adding" class="flex flex-col gap-2 rounded-md border border-line p-2" @submit.prevent="saveFeature">
        <input v-model="draft.title" type="text" placeholder="Title" required class="rounded px-2 py-1 text-sm" />
        <textarea v-model="draft.text" rows="4" placeholder="What it does" class="rounded px-2 py-1 text-sm" />
        <div class="flex justify-end gap-2">
          <button type="button" class="rounded-md px-3 py-1 text-sm hover:bg-hover" @click="adding = false">Cancel</button>
          <button type="submit" class="rounded-md bg-accent px-3 py-1 text-sm font-medium text-accent-fg hover:brightness-110">Save</button>
        </div>
      </form>

      <p v-if="features.length === 0 && !adding" class="text-sm text-muted">No features yet.</p>
      <details v-for="feature in features" :key="feature.id" class="group rounded-md border border-line" open>
        <summary class="flex items-center justify-between px-3 py-2 text-sm font-medium">
          {{ feature.title }}
          <span class="text-xs text-muted group-open:rotate-180">▾</span>
        </summary>
        <div class="flex flex-col gap-2 px-3 pb-3">
          <p class="whitespace-pre-line text-sm text-muted">{{ feature.text }}</p>
          <div v-if="editable" class="flex justify-end gap-3 text-xs">
            <button type="button" class="text-danger hover:underline" @click="deleteFeature(feature.id)">Delete</button>
            <button type="button" class="text-accent hover:underline" @click="startEdit(feature)">Edit</button>
          </div>
        </div>
      </details>
    </div>

    <label class="flex flex-col gap-1 rounded-md border border-line p-2">
      <span class="text-xs text-muted">Notes</span>
      <textarea
        v-if="editable"
        rows="6"
        :value="character.notes ?? ''"
        placeholder="Anything else worth remembering"
        class="rounded px-2 py-1 text-sm"
        @change="setField('notes', $event)"
      />
      <p v-else class="whitespace-pre-line text-sm">{{ character.notes || '-' }}</p>
    </label>
  </div>
</template>
