// Guests (players who joined without an Owlbear account) have no asset
// library, so OBR refuses to open the picker for them.
export function imagePickerMessage(err: unknown): string {
  const name = (err as { error?: { name?: string } })?.error?.name
  if (name === 'NotSignedInError') {
    return "Owlbear's image library needs an account, and you're joined as a guest. Ask your GM to set your token image (they can from your sheet), or sign in to Owlbear."
  }
  return `Could not open the image picker: ${err instanceof Error ? err.message : JSON.stringify(err)}`
}
