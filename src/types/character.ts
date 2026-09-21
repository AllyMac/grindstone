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

export type AbilityKey = keyof AbilityScores

export type SkillKey =
  | 'acrobatics'
  | 'animalHandling'
  | 'arcana'
  | 'athletics'
  | 'deception'
  | 'history'
  | 'insight'
  | 'intimidation'
  | 'investigation'
  | 'medicine'
  | 'nature'
  | 'perception'
  | 'performance'
  | 'persuasion'
  | 'religion'
  | 'sleightOfHand'
  | 'stealth'
  | 'survival'

// Expertise doubles the proficiency bonus.
export type SkillProficiency = 'proficient' | 'expertise'

export type EquipSlot = 'head' | 'body' | 'hands' | 'legs' | 'feet' | 'cloak' | 'mainHand' | 'offHand'

export interface InventoryItem {
  id: string
  name: string
  quantity: number
}

export interface Feature {
  id: string
  title: string
  text: string
}

export interface Coins {
  cp: number
  sp: number
  gp: number
  pp: number
  ep: number
}

// Everything below is optional so a PC made before the full sheet existed
// still loads - the sheet just shows blanks/defaults for what's missing.
export interface PlayerCharacter extends CharacterBase {
  ownerId?: string
  level?: number
  className?: string
  hitDie?: number // the die size: 6, 8, 10, 12
  speed?: number
  race?: string
  alignment?: string
  background?: string
  notes?: string
  saveProficiencies?: AbilityKey[]
  skillProficiencies?: Partial<Record<SkillKey, SkillProficiency>>
  coins?: Coins
  deathSaves?: { successes: number; failures: number }
  items?: InventoryItem[]
  // Which inventory item is worn/held in each slot.
  equipped?: Partial<Record<EquipSlot, string>>
  features?: Feature[]
  spellcastingAbility?: AbilityKey
  // Index 0 = 1st-level slots.
  spellSlots?: { max: number; used: number }[]
}

export interface NpcStatBlock extends CharacterBase {
  isTemplate: boolean
  isEncounterCopy: boolean
}

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2)
}
