<script setup lang="ts">
import OBR from '@owlbear-rodeo/sdk'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import CharacterManager from './components/CharacterManager.vue'
import { reconcileHpIndicators, syncHpIndicator } from './lib/obr/hpIndicators'
import { cancelPlacement, placingCharacterName, placingRepeats } from './lib/obr/placementTool'
import { onSelectedStatBlockChange } from './lib/obr/selection'
import { useCharactersStore } from './stores/characters'

const store = useCharactersStore()
const connected = ref(false)
// Inside OBR, nobody is a GM until OBR says so - defaulting to GM would
// flash the GM interface at players before their role arrives. Outside
// OBR (plain local dev) there's no role to wait for, so keep everything
// open.
const isGm = ref(!OBR.isAvailable)
const playerId = ref<string>()
const roleReady = computed(() => !OBR.isAvailable || connected.value)
const manager = ref<InstanceType<typeof CharacterManager>>()

let unsubSelection: (() => void) | undefined
let unsubSceneReady: (() => void) | undefined

// GM only: every connected client's popover runs this, and several of
// them rewriting the same bars at once would just race each other.
function reconcileBars() {
  if (!isGm.value) return
  void reconcileHpIndicators((id) => {
    const character = store.players.find((p) => p.id === id) ?? store.npcs.find((n) => n.id === id)
    return character && { currentHp: character.currentHp, maxHp: character.maxHp }
  })
}

// Redraws HP bars whenever a character's HP changes, wherever the change
// came from - the GM's own edit, or a player's edit of their own sheet
// arriving through room metadata. Only the GM's client does the drawing:
// players may not be allowed to write scene items, and several clients
// racing to rewrite the same bars would be worse than one.
const hpByCharacter = computed(
  () => new Map([...store.players, ...store.npcs].map((c) => [c.id, `${c.currentHp}/${c.maxHp}`] as const)),
)
watch(hpByCharacter, (next, previous) => {
  if (!isGm.value || !OBR.isAvailable) return
  for (const [id, value] of next) {
    // Not-seen-before means a fresh load or a new character - the load
    // reconcile covers the former and a new character has no token yet.
    if (!previous.has(id) || previous.get(id) === value) continue
    const character = store.players.find((p) => p.id === id) ?? store.npcs.find((n) => n.id === id)
    if (character) void syncHpIndicator(id, character.currentHp, character.maxHp)
  }
})

onMounted(async () => {
  await store.load()

  if (OBR.isAvailable) {
    OBR.onReady(async () => {
      isGm.value = (await OBR.player.getRole()) === 'GM'
      playerId.value = OBR.player.id
      connected.value = true

      // Covers tokens placed before HP bars existed, and a scene that
      // finishes loading (or is switched to) after the popover opened.
      reconcileBars()
      unsubSceneReady = OBR.scene.onReadyChange((ready) => {
        if (ready) reconcileBars()
      })
    })

    // Tapping a placed token is a shortcut to select its character in
    // the popover - see CLAUDE.md "One character sheet, no separate
    // instances".
    unsubSelection = onSelectedStatBlockChange((statBlockId) => {
      // Players only ever see their own sheet, so there's nothing to jump to.
      if (!statBlockId || !isGm.value) return
      if (store.players.some((p) => p.id === statBlockId)) {
        manager.value?.showCharacter('players', statBlockId)
      } else if (store.npcs.some((n) => n.id === statBlockId)) {
        manager.value?.showCharacter('npcs', statBlockId)
      }
    })
  }
})

onUnmounted(() => {
  store.dispose()
  unsubSelection?.()
  unsubSceneReady?.()
})
</script>

<template>
  <div class="flex min-h-screen flex-col bg-stone-50 text-stone-700">
    <header class="flex items-center justify-between border-b border-stone-200 px-3 py-2">
      <h1 class="text-sm font-semibold">Grindstone</h1>
      <span class="text-xs" :class="connected ? 'text-green-600' : 'text-stone-400'">
        {{ connected ? (isGm ? 'GM' : 'Player') : OBR.isAvailable ? 'Connecting…' : 'Not in Owlbear Rodeo' }}
      </span>
    </header>

    <div v-if="placingCharacterName" class="flex items-center justify-between gap-2 bg-amber-100 px-3 py-2 text-xs text-amber-900">
      <span>
        Click the map to place <strong>{{ placingCharacterName }}</strong>
        <template v-if="placingRepeats"> - keep clicking to add more</template>
      </span>
      <button
        type="button"
        class="rounded border border-amber-400 px-3 py-1 font-semibold hover:bg-amber-200"
        @click="cancelPlacement"
      >
        {{ placingRepeats ? 'Done' : 'Cancel' }}
      </button>
    </div>

    <CharacterManager v-if="roleReady" ref="manager" :is-gm="isGm" :player-id="playerId" />
  </div>
</template>
