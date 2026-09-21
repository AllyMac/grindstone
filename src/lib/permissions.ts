import type { NpcStatBlock, PlayerCharacter } from '../types/character'

// Soft, UI-level gating only (CLAUDE.md Phase 2) - anyone with dev tools
// can still write room metadata. It's about keeping the table honest and
// the interface uncluttered, not security.
export interface Viewer {
  isGm: boolean
  // OBR.player.id of whoever is looking; undefined outside OBR.
  playerId?: string
}

export function isPlayerCharacter(character: PlayerCharacter | NpcStatBlock): character is PlayerCharacter {
  return !('isTemplate' in character)
}

// GM edits everything; a player edits only the character linked to them.
export function canEditCharacter(character: PlayerCharacter | NpcStatBlock, viewer: Viewer): boolean {
  if (viewer.isGm) return true
  return isPlayerCharacter(character) && !!character.ownerId && character.ownerId === viewer.playerId
}
