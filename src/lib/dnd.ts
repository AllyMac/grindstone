import { abilityModifier, type AbilityKey, type PlayerCharacter, type SkillKey } from '../types/character'

export const ABILITIES: { key: AbilityKey; label: string }[] = [
  { key: 'str', label: 'STR' },
  { key: 'dex', label: 'DEX' },
  { key: 'con', label: 'CON' },
  { key: 'int', label: 'INT' },
  { key: 'wis', label: 'WIS' },
  { key: 'cha', label: 'CHA' },
]

export const SKILLS: { key: SkillKey; label: string; ability: AbilityKey }[] = [
  { key: 'acrobatics', label: 'Acrobatics', ability: 'dex' },
  { key: 'animalHandling', label: 'Animal Handling', ability: 'wis' },
  { key: 'arcana', label: 'Arcana', ability: 'int' },
  { key: 'athletics', label: 'Athletics', ability: 'str' },
  { key: 'deception', label: 'Deception', ability: 'cha' },
  { key: 'history', label: 'History', ability: 'int' },
  { key: 'insight', label: 'Insight', ability: 'wis' },
  { key: 'intimidation', label: 'Intimidation', ability: 'cha' },
  { key: 'investigation', label: 'Investigation', ability: 'int' },
  { key: 'medicine', label: 'Medicine', ability: 'wis' },
  { key: 'nature', label: 'Nature', ability: 'int' },
  { key: 'perception', label: 'Perception', ability: 'wis' },
  { key: 'performance', label: 'Performance', ability: 'cha' },
  { key: 'persuasion', label: 'Persuasion', ability: 'cha' },
  { key: 'religion', label: 'Religion', ability: 'int' },
  { key: 'sleightOfHand', label: 'Sleight of Hand', ability: 'dex' },
  { key: 'stealth', label: 'Stealth', ability: 'dex' },
  { key: 'survival', label: 'Survival', ability: 'wis' },
]

export const HIT_DICE = [6, 8, 10, 12]

export const EQUIP_SLOTS = [
  { key: 'head', label: 'Head' },
  { key: 'body', label: 'Body' },
  { key: 'hands', label: 'Hands' },
  { key: 'legs', label: 'Legs' },
  { key: 'feet', label: 'Feet' },
  { key: 'cloak', label: 'Cloak' },
  { key: 'mainHand', label: 'Main hand' },
  { key: 'offHand', label: 'Off hand' },
] as const

export const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`)

// Levels 1-4 give +2, 5-8 +3, and so on up to +6 at 17-20.
export function proficiencyForLevel(level: number): number {
  return 2 + Math.floor((Math.max(1, level) - 1) / 4)
}

export const mod = (c: PlayerCharacter, ability: AbilityKey) => abilityModifier(c.abilities[ability])

export function saveBonus(c: PlayerCharacter, ability: AbilityKey): number {
  return mod(c, ability) + (c.saveProficiencies?.includes(ability) ? c.proficiencyBonus : 0)
}

export function skillBonus(c: PlayerCharacter, skill: SkillKey): number {
  const def = SKILLS.find((s) => s.key === skill)!
  const level = c.skillProficiencies?.[skill]
  const multiplier = level === 'expertise' ? 2 : level === 'proficient' ? 1 : 0
  return mod(c, def.ability) + multiplier * c.proficiencyBonus
}

export const initiative = (c: PlayerCharacter) => mod(c, 'dex')

export const passivePerception = (c: PlayerCharacter) => 10 + skillBonus(c, 'perception')

// Both undefined until a spellcasting ability has been chosen.
export function spellSaveDc(c: PlayerCharacter): number | undefined {
  return c.spellcastingAbility ? 8 + c.proficiencyBonus + mod(c, c.spellcastingAbility) : undefined
}

export function spellAttackBonus(c: PlayerCharacter): number | undefined {
  return c.spellcastingAbility ? c.proficiencyBonus + mod(c, c.spellcastingAbility) : undefined
}

export function hitDiceText(c: PlayerCharacter): string {
  return c.hitDie ? `${c.level ?? 1}d${c.hitDie}` : '-'
}
