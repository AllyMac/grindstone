<script setup lang="ts">
import { computed, ref } from 'vue'
import { EQUIP_SLOTS } from '../../lib/dnd'
import type { Coins, EquipSlot, InventoryItem, PlayerCharacter } from '../../types/character'

const props = defineProps<{ character: PlayerCharacter; editable: boolean }>()
const emit = defineEmits<{ patch: [Partial<PlayerCharacter>] }>()

const COINS: (keyof Coins)[] = ['cp', 'sp', 'gp', 'pp', 'ep']
const coins = computed<Coins>(() => ({ cp: 0, sp: 0, gp: 0, pp: 0, ep: 0, ...props.character.coins }))
const items = computed(() => props.character.items ?? [])

function setCoin(kind: keyof Coins, event: Event) {
  const value = Number.parseInt((event.target as HTMLInputElement).value, 10)
  emit('patch', { coins: { ...coins.value, [kind]: Number.isNaN(value) ? 0 : Math.max(0, value) } })
}

const newName = ref('')
function addItem() {
  const name = newName.value.trim()
  if (!name) return
  emit('patch', { items: [...items.value, { id: crypto.randomUUID(), name, quantity: 1 }] })
  newName.value = ''
}

function updateItem(id: string, patch: Partial<InventoryItem>) {
  emit('patch', { items: items.value.map((i) => (i.id === id ? { ...i, ...patch } : i)) })
}

function setQuantity(id: string, event: Event) {
  const value = Number.parseInt((event.target as HTMLInputElement).value, 10)
  updateItem(id, { quantity: Number.isNaN(value) ? 1 : Math.max(0, value) })
}

function removeItem(id: string) {
  const equipped = { ...props.character.equipped }
  for (const slot of Object.keys(equipped) as EquipSlot[]) if (equipped[slot] === id) delete equipped[slot]
  emit('patch', { items: items.value.filter((i) => i.id !== id), equipped })
}

const itemName = (id?: string) => items.value.find((i) => i.id === id)?.name

// One item can only be in one slot, so equipping it somewhere clears where
// it was.
function equip(slot: EquipSlot, event: Event) {
  const id = (event.target as HTMLSelectElement).value
  const equipped = { ...props.character.equipped }
  if (id) for (const s of Object.keys(equipped) as EquipSlot[]) if (equipped[s] === id) delete equipped[s]
  if (id) equipped[slot] = id
  else delete equipped[slot]
  emit('patch', { equipped })
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="grid grid-cols-5 gap-2 text-center">
      <label v-for="kind in COINS" :key="kind" class="flex flex-col items-center rounded-md border border-line p-2">
        <input
          v-if="editable"
          type="number"
          min="0"
          :value="coins[kind]"
          class="w-full border-0 bg-transparent text-center text-base font-semibold tabular-nums focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          @focus="($event.target as HTMLInputElement).select()"
          @change="setCoin(kind, $event)"
        />
        <span v-else class="text-base font-semibold tabular-nums">{{ coins[kind] }}</span>
        <span class="text-xs uppercase text-muted">{{ kind }}</span>
      </label>
    </div>

    <div class="flex flex-col gap-2">
      <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">Equipped</h3>
      <div class="grid grid-cols-2 gap-2">
        <div v-for="slot in EQUIP_SLOTS" :key="slot.key" class="flex flex-col gap-1 rounded-md border border-line p-2">
          <span class="text-xs text-muted">{{ slot.label }}</span>
          <select
            v-if="editable"
            :value="character.equipped?.[slot.key] ?? ''"
            class="rounded-md px-1 py-1 text-sm"
            @change="equip(slot.key, $event)"
          >
            <option value="">-</option>
            <option v-for="item in items" :key="item.id" :value="item.id">{{ item.name }}</option>
          </select>
          <span v-else class="truncate text-sm">{{ itemName(character.equipped?.[slot.key]) ?? '-' }}</span>
        </div>
      </div>
    </div>

    <div class="flex flex-col gap-2">
      <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">Items</h3>
      <p v-if="items.length === 0" class="text-sm text-muted">Nothing carried yet.</p>
      <ul class="flex flex-col gap-1">
        <li v-for="item in items" :key="item.id" class="flex items-center gap-2 rounded-md border border-line px-2 py-1.5 text-sm">
          <input
            v-if="editable"
            type="text"
            :value="item.name"
            class="min-w-0 flex-1 rounded px-1 py-0.5"
            @change="updateItem(item.id, { name: ($event.target as HTMLInputElement).value.trim() || item.name })"
          />
          <span v-else class="min-w-0 flex-1 truncate">{{ item.name }}</span>
          <span class="text-muted">×</span>
          <input
            v-if="editable"
            type="number"
            min="0"
            :value="item.quantity"
            class="w-14 rounded px-1 py-0.5 text-center"
            @change="setQuantity(item.id, $event)"
          />
          <span v-else class="w-8 text-right tabular-nums">{{ item.quantity }}</span>
          <button v-if="editable" type="button" class="px-1 text-danger" title="Remove" @click="removeItem(item.id)">✕</button>
        </li>
      </ul>
      <form v-if="editable" class="flex gap-2" @submit.prevent="addItem">
        <input v-model="newName" type="text" placeholder="Add an item…" class="min-w-0 flex-1 rounded-md px-2 py-1 text-sm" />
        <button type="submit" class="rounded-md bg-accent px-3 py-1 text-sm font-medium text-accent-fg hover:brightness-110">
          Add
        </button>
      </form>
    </div>
  </div>
</template>
