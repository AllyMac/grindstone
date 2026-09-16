<script setup lang="ts">
import OBR from '@owlbear-rodeo/sdk'
import { onMounted, onUnmounted, ref } from 'vue'
import CharacterManager from './components/CharacterManager.vue'
import { useCharactersStore } from './stores/characters'

const store = useCharactersStore()
const connected = ref(false)
const isGm = ref(true)

onMounted(async () => {
  await store.load()

  if (OBR.isAvailable) {
    OBR.onReady(async () => {
      isGm.value = (await OBR.player.getRole()) === 'GM'
      connected.value = true
    })
  }
})

onUnmounted(() => {
  store.dispose()
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

    <CharacterManager :is-gm="isGm" />
  </div>
</template>
