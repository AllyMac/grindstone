<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  applyImport,
  buildCampaignExport,
  downloadJson,
  parseCampaign,
  planImport,
  type ImportChoice,
  type ImportConflict,
  type ImportPlan,
} from '../lib/campaign'
import { useCharactersStore } from '../stores/characters'

const emit = defineEmits<{ close: [] }>()
const store = useCharactersStore()

type Stage =
  | { kind: 'idle' }
  | { kind: 'resolving'; plan: ImportPlan; choices: ImportChoice[]; index: number }
  | { kind: 'done'; summary: string[] }

const stage = ref<Stage>({ kind: 'idle' })
const error = ref<string>()
const notice = ref<string>()
const applyToAll = ref(false)

function exportCampaign() {
  error.value = undefined
  const data = buildCampaignExport(store.players, store.npcs)
  const date = new Date().toISOString().slice(0, 10)
  downloadJson(`grindstone-campaign-${date}.json`, data)
  notice.value = `Exported ${data.players.length} PC${data.players.length === 1 ? '' : 's'} and ${data.npcs.length} NPC${data.npcs.length === 1 ? '' : 's'} (encounter copies aren't included).`
}

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // so picking the same file again still fires
  if (!file) return

  error.value = undefined
  notice.value = undefined
  stage.value = { kind: 'idle' }

  const parsed = parseCampaign(await file.text())
  if (!parsed.ok) {
    error.value = parsed.error
    return
  }

  const plan = planImport(store.players, store.npcs, parsed.data)
  applyToAll.value = false
  if (plan.conflicts.length === 0) {
    await finish(plan, [])
  } else {
    stage.value = { kind: 'resolving', plan, choices: [], index: 0 }
  }
}

async function finish(plan: ImportPlan, choices: ImportChoice[]) {
  const result = applyImport(store.players, store.npcs, plan, choices)
  await store.importCharacters(result.players, result.npcs)

  const c = result.counts
  const lines = [
    c.added && `${c.added} added`,
    c.identical && `${c.identical} already up to date`,
    c.overwritten && `${c.overwritten} overwritten`,
    c.asNew && `${c.asNew} imported as new`,
    c.kept && `${c.kept} kept as they were`,
    c.ignored && `${c.ignored} ignored (encounter copies or repeats)`,
  ].filter((line): line is string => Boolean(line))
  stage.value = { kind: 'done', summary: lines.length ? lines : ['Nothing to import.'] }
}

const current = computed<ImportConflict | undefined>(() =>
  stage.value.kind === 'resolving' ? stage.value.plan.conflicts[stage.value.index] : undefined,
)

async function choose(choice: ImportChoice) {
  const s = stage.value
  if (s.kind !== 'resolving') return
  const { conflicts } = s.plan

  if (applyToAll.value) {
    // Overwrite isn't possible for every conflict (a name match in the
    // other list) - those fall back to keeping what's already there.
    const rest = conflicts.slice(s.index).map((c) => (choice === 'overwrite' && !c.canOverwrite ? 'keep' : choice))
    await finish(s.plan, [...s.choices, ...rest])
    return
  }

  const choices = [...s.choices, choice]
  if (choices.length >= conflicts.length) await finish(s.plan, choices)
  else stage.value = { ...s, choices, index: s.index + 1 }
}

function describe(c: ImportConflict['existing']) {
  return `${c.name} — AC ${c.ac}, HP ${c.currentHp}/${c.maxHp}`
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center justify-between">
      <h2 class="text-sm font-semibold text-fg">Backup &amp; restore</h2>
      <button type="button" class="text-sm text-muted hover:underline" @click="emit('close')">← Back</button>
    </div>

    <template v-if="stage.kind !== 'resolving'">
      <div class="flex flex-col gap-1 rounded-md border border-line p-3 text-sm">
        <h3 class="font-medium">Export</h3>
        <p class="text-xs text-muted">
          Saves every PC and NPC to a campaign.json file - a backup, or a way to move to another room.
        </p>
        <button
          type="button"
          class="mt-1 self-start rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:brightness-110"
          @click="exportCampaign"
        >
          Export campaign.json
        </button>
      </div>

      <div class="flex flex-col gap-1 rounded-md border border-line p-3 text-sm">
        <h3 class="font-medium">Import</h3>
        <p class="text-xs text-muted">
          Anything new is added; if something clashes with what's already here, you'll be asked what to do.
        </p>
        <label
          class="mt-1 cursor-pointer self-start rounded-md border border-line px-3 py-1.5 text-xs font-medium text-fg hover:bg-hover"
        >
          Choose campaign.json…
          <input type="file" accept=".json,application/json" class="hidden" @change="onFile" />
        </label>
      </div>

      <p v-if="notice" class="rounded-md border border-success/40 bg-success/15 px-2 py-1.5 text-sm text-success">
        {{ notice }}
      </p>
      <p v-if="error" class="rounded-md border border-danger/40 bg-danger/15 px-2 py-1.5 text-sm text-danger">
        {{ error }}
      </p>

      <div v-if="stage.kind === 'done'" class="rounded-md border border-success/40 bg-success/15 px-3 py-2 text-sm text-success">
        <p class="font-medium">Import finished</p>
        <ul class="list-inside list-disc text-xs">
          <li v-for="line in stage.summary" :key="line">{{ line }}</li>
        </ul>
      </div>
    </template>

    <template v-else-if="current">
      <div class="flex items-center justify-between text-xs text-muted">
        <span>Conflict {{ stage.index + 1 }} of {{ stage.plan.conflicts.length }}</span>
        <span class="uppercase">{{ current.kind === 'player' ? 'PC' : current.kind }}</span>
      </div>

      <p class="text-sm">
        <template v-if="current.reason === 'same-id'">
          <strong>{{ current.imported.name }}</strong> is already here, but it's been edited since this file was made.
        </template>
        <template v-else>
          <strong>{{ current.imported.name }}</strong> has the same name as something already here - it might be the
          same one, or just a coincidence.
        </template>
      </p>

      <div class="flex flex-col gap-1 text-xs">
        <div class="rounded-md border border-line px-2 py-1.5"><span class="font-semibold">Current:</span> {{ describe(current.existing) }}</div>
        <div class="rounded-md border border-warn/40 bg-warn/15 px-2 py-1.5"><span class="font-semibold">Imported:</span> {{ describe(current.imported) }}</div>
      </div>

      <label v-if="stage.index === 0 && stage.plan.conflicts.length > 1" class="flex items-center gap-2 text-xs text-fg">
        <input v-model="applyToAll" type="checkbox" />
        Apply my choice to all {{ stage.plan.conflicts.length }} conflicts
      </label>

      <div class="flex flex-wrap gap-2">
        <button type="button" class="rounded-md border border-line px-3 py-1.5 text-xs font-medium hover:bg-hover" @click="choose('keep')">
          Keep current
        </button>
        <button
          type="button"
          class="rounded-md border border-line px-3 py-1.5 text-xs font-medium hover:bg-hover disabled:opacity-40"
          :disabled="!current.canOverwrite"
          :title="current.canOverwrite ? '' : 'The matching entry is in a different list, so it can\'t be replaced'"
          @click="choose('overwrite')"
        >
          Overwrite
        </button>
        <button type="button" class="rounded-md border border-line px-3 py-1.5 text-xs font-medium hover:bg-hover" @click="choose('new')">
          Import as new
        </button>
      </div>
    </template>
  </div>
</template>
