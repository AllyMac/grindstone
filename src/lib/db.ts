import Dexie, { type Table } from 'dexie'
import type { NpcStatBlock, PlayerCharacter } from '../types/character'

// Offline working copy only - room metadata (via the SDK) is the source
// of truth. See CLAUDE.md Architecture overview.
class GrindstoneDb extends Dexie {
  players!: Table<PlayerCharacter, string>
  npcs!: Table<NpcStatBlock, string>

  constructor() {
    super('grindstone')
    this.version(1).stores({
      players: 'id',
      npcs: 'id',
    })
  }
}

export const db = new GrindstoneDb()

export async function replaceTable<T extends { id: string }>(table: Table<T, string>, records: T[]) {
  await db.transaction('rw', table, async () => {
    await table.clear()
    await table.bulkPut(records)
  })
}
