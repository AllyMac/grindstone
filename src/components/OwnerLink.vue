<script setup lang="ts">
import OBR, { type Player } from '@owlbear-rodeo/sdk'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useCharactersStore } from '../stores/characters'
import type { PlayerCharacter } from '../types/character'

const props = defineProps<{ character: PlayerCharacter }>()
const store = useCharactersStore()

// Only players currently in the room can be picked - that's what the
// party API reports. A link to someone who's since left is kept, just
// shown as offline.
const party = ref<Player[]>([])
let unsubscribe: (() => void) | undefined

onMounted(async () => {
  if (!OBR.isAvailable) return
  party.value = await OBR.party.getPlayers()
  unsubscribe = OBR.party.onChange((players) => (party.value = players))
})
onUnmounted(() => unsubscribe?.())

const linkedPlayer = computed(() => party.value.find((p) => p.id === props.character.ownerId))

// Which character each player is already linked to, so the picker can say
// so - choosing them moves the link rather than duplicating it.
function otherCharacterFor(playerId: string) {
  return store.players.find((c) => c.ownerId === playerId && c.id !== props.character.id)
}

function onChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  void store.assignOwner(props.character.id, value || undefined)
}
</script>

<template>
  <div class="flex flex-col gap-1 rounded-md border border-line p-2 text-sm">
    <label class="text-xs text-muted" for="owner-link">Played by</label>
    <select
      id="owner-link"
      class="rounded-md border border-line bg-surface px-2 py-1"
      :value="character.ownerId ?? ''"
      :disabled="!OBR.isAvailable"
      @change="onChange"
    >
      <option value="">Not linked</option>
      <option v-if="character.ownerId && !linkedPlayer" :value="character.ownerId">Linked player (not in the room)</option>
      <option v-for="player in party" :key="player.id" :value="player.id">
        {{ player.name }}<template v-if="otherCharacterFor(player.id)"> (currently {{ otherCharacterFor(player.id)?.name }})</template>
      </option>
    </select>
    <p v-if="!OBR.isAvailable" class="text-xs text-faint">Linking needs Owlbear Rodeo to see who's in the room.</p>
    <p v-else-if="party.length === 0" class="text-xs text-faint">
      Nobody else is in the room right now - players show up here once they've joined.
    </p>
  </div>
</template>
