import OBR from '@owlbear-rodeo/sdk'

// Shared by placementTool (replacing a character's existing token when
// placed again) and the characters store (deleting a token when its
// character record is deleted, including via Clear Encounter) - a token
// is only ever a pointer at a character record via
// metadata['grindstone/statBlockId'], so removing the record without
// removing the token would leave an orphaned, unclickable image behind.
export async function deleteTokensForStatBlockIds(statBlockIds: string[]): Promise<void> {
  if (!OBR.isAvailable || statBlockIds.length === 0) return
  const ids = new Set(statBlockIds)
  const items = await OBR.scene.items.getItems((item) => {
    const statBlockId = item.metadata['grindstone/statBlockId']
    return typeof statBlockId === 'string' && ids.has(statBlockId)
  })
  if (items.length > 0) {
    await OBR.scene.items.deleteItems(items.map((item) => item.id))
  }
}
