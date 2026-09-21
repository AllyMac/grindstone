<script setup lang="ts">
import OBR from '@owlbear-rodeo/sdk'
import { onMounted, onUnmounted, ref } from 'vue'
import CharacterManager from './components/CharacterManager.vue'
import { reconcileHpIndicators } from './lib/obr/hpIndicators'
import { cancelPlacement, placingCharacterName, placingRepeats } from './lib/obr/placementTool'
import { onSelectedStatBlockChange } from './lib/obr/selection'
import { useCharactersStore } from './stores/characters'

const store = useCharactersStore()
const connected = ref(false)
const isGm = ref(true)
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

onMounted(async () => {
  await store.load()

  if (OBR.isAvailable) {
    OBR.onReady(async () => {
      isGm.value = (await OBR.player.getRole()) === 'GM'
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
      if (!statBlockId) return
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

    <CharacterManager ref="manager" :is-gm="isGm" />
  </div>
</template>
