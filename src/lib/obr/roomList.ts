import OBR from '@owlbear-rodeo/sdk'

// Room metadata is the shared source of truth (see CLAUDE.md Architecture
// overview) - each of these keys holds one JSON array.
export async function getRoomList<T>(key: string): Promise<T[]> {
  const metadata = await OBR.room.getMetadata()
  const value = metadata[key]
  return Array.isArray(value) ? (value as T[]) : []
}

export async function setRoomList<T>(key: string, value: T[]): Promise<void> {
  // Callers pass data straight out of a Pinia store, which wraps every
  // nested object in a reactive Proxy on read - postMessage's structured
  // clone algorithm can't serialize those ("#<Object> could not be
  // cloned"), so this strips reactivity before it ever reaches the SDK.
  await OBR.room.setMetadata({ [key]: JSON.parse(JSON.stringify(value)) })
}

export function onRoomListChange<T>(key: string, callback: (value: T[]) => void): () => void {
  return OBR.room.onMetadataChange((metadata) => {
    const value = metadata[key]
    callback(Array.isArray(value) ? (value as T[]) : [])
  })
}
