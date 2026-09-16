<script setup lang="ts">
import OBR from '@owlbear-rodeo/sdk'
import { onMounted, ref } from 'vue'

const connected = ref(false)
const roomId = ref('')
const playerRole = ref<'GM' | 'PLAYER' | ''>('')

onMounted(() => {
  if (!OBR.isAvailable) return

  OBR.onReady(async () => {
    roomId.value = OBR.room.id
    playerRole.value = await OBR.player.getRole()
    connected.value = true
  })
})
</script>

<template>
  <div class="flex min-h-screen flex-col items-center justify-center gap-2 bg-stone-50 p-4 text-center text-stone-700">
    <h1 class="text-lg font-semibold">Grindstone</h1>
    <p v-if="connected" class="text-sm">
      Connected to room <span class="font-mono">{{ roomId }}</span> as {{ playerRole }}
    </p>
    <p v-else-if="OBR.isAvailable" class="text-sm text-stone-500">Waiting for Owlbear Rodeo…</p>
    <p v-else class="text-sm text-stone-500">Not running inside Owlbear Rodeo.</p>
  </div>
</template>
