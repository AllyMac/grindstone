<script setup lang="ts">
import OBR from '@owlbear-rodeo/sdk'
import { onMounted, onUnmounted, ref } from 'vue'
import CharacterManager from './components/CharacterManager.vue'
import { onSelectedStatBlockChange } from './lib/obr/selection'
import { useCharactersStore } from './stores/characters'

const store = useCharactersStore()
const connected = ref(false)
const isGm = ref(true)
const manager = ref<InstanceType<typeof CharacterManager>>()

let unsubSelection: (() => void) | undefined

onMounted(async () => {
  await store.load()

  if (OBR.isAvailable) {
    OBR.onReady(async () => {
      isGm.value = (await OBR.player.getRole()) === 'GM'
      connected.value = true
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

    <CharacterManager ref="manager" :is-gm="isGm" />
  </div>
</template>
