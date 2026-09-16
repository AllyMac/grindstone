import type { ImageContent, ImageGrid } from '@owlbear-rodeo/sdk'

export interface AbilityScores {
  str: number
  dex: number
  con: number
  int: number
  wis: number
  cha: number
}

// Picked once from OBR's own asset library at creation time (see
// CharacterForm) rather than re-prompted on every placement. Needs more
// than a bare URL - addItems needs the image's own grid/dpi to place a
// token that matches how it'd look placed normally in OBR.
export interface TokenImage {
  image: ImageContent
  grid: ImageGrid
}

export interface CharacterBase {
  id: string
  name: string
  ac: number
  maxHp: number
  currentHp: number
  abilities: AbilityScores
  proficiencyBonus: number
  weaponIds: string[]
  spellsKnown: string[]
  tokenImage?: TokenImage
}

export interface PlayerCharacter extends CharacterBase {
  ownerId?: string
}

export interface NpcStatBlock extends CharacterBase {
  isTemplate: boolean
  isEncounterCopy: boolean
}

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2)
}
