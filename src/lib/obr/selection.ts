import OBR from '@owlbear-rodeo/sdk'

// "Tapping a token is a shortcut to select that entry" - resolves the
// local player's current scene selection back to a Grindstone
// statBlockId, so the popover can jump straight to that character's
// sheet.
export function onSelectedStatBlockChange(callback: (statBlockId: string | undefined) => void): () => void {
  return OBR.player.onChange(async (player) => {
    const selection = player.selection
    if (!selection || selection.length !== 1) {
      callback(undefined)
      return
    }
    const items = await OBR.scene.items.getItems(selection)
    const statBlockId = items[0]?.metadata['grindstone/statBlockId']
    callback(typeof statBlockId === 'string' ? statBlockId : undefined)
  })
}
