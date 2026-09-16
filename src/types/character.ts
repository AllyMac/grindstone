export interface AbilityScores {
  str: number
  dex: number
  con: number
  int: number
  wis: number
  cha: number
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
  imageUrl?: string
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
