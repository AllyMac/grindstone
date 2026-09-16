import OBR from '@owlbear-rodeo/sdk'

// Room metadata is the shared source of truth (see CLAUDE.md Architecture
// overview) - each of these keys holds one JSON array.
export async function getRoomList<T>(key: string): Promise<T[]> {
  const metadata = await OBR.room.getMetadata()
  const value = metadata[key]
  return Array.isArray(value) ? (value as T[]) : []
}

export async function setRoomList<T>(key: string, value: T[]): Promise<void> {
  await OBR.room.setMetadata({ [key]: value })
}

export function onRoomListChange<T>(key: string, callback: (value: T[]) => void): () => void {
  return OBR.room.onMetadataChange((metadata) => {
    const value = metadata[key]
    callback(Array.isArray(value) ? (value as T[]) : [])
  })
}
