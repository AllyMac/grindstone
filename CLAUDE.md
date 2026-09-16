# Project: Grindstone — OBR Combat Automation Extension

Name note: "Grindstone" is a deliberate nod to the Skyrim smithing
station used to temper/sharpen weapons — subtle, fits the combat/weapons
theme, not a trademark concern since it's a common English word.

## What this is

An Owlbear Rodeo (OBR) extension that automates D&D 5e combat math for a home
group. OBR is a lightweight, intentionally rules-agnostic virtual tabletop —
it doesn't know what an AC or a saving throw is. This extension adds that
layer on top: character/monster stat blocks, weapon attacks, and (later) AoE
spells with automatic targeting, roll resolution, and damage application.

This is a personal tool for one GM's table, not a public product. Prioritise
"works well for us" over generality, configurability, or supporting rulesets
we don't use.

## Non-negotiables

- **All content is homebrew.** Never copy official D&D spell/monster text,
  stat blocks, or flavour text from the Player's Handbook, Monster Manual,
  or similar copyrighted sources into code, data files, or seed content.
  SRD/ORC-licensed content is fine to reference for mechanics (numbers,
  formulas) but write descriptions ourselves. When in doubt, leave it out
  and flag it rather than guessing.
- **No backend server.** This is a static web app only. All persistence is
  either the browser (IndexedDB, as an offline cache) or Owlbear's own
  room/scene metadata sync via the SDK (the shared source of truth). Do not
  introduce a database, API server, or hosting requirement beyond static
  file hosting.
- **No native HTML `<form>` elements are relevant here** — this isn't a
  Claude Artifact, ignore that constraint, it's a real Vite app.

## Tech stack

- Vite + Vue 3 + TypeScript
- Pinia for state management
- `@owlbear-rodeo/sdk` (npm) for all interaction with the OBR scene/room
- Tailwind CSS for styling (matches other projects, keep it consistent)
- IndexedDB (via Dexie, or similar) as a local offline cache — room
  metadata (via the SDK) is the source of truth for shared data; see
  Architecture overview
- Dice+ extension's broadcast protocol for dice rolling (see "Dice
  integration" below) — do not build a custom physics dice roller unless
  Dice+ turns out to be unworkable

## Architecture overview

The app is a static site embedded by Owlbear Rodeo in an iframe. It talks to
the room via the SDK:

- **Token/item metadata** (`OBR.scene.items`) — when a token exists (online
  play), it stores only a *reference* — `statBlockId`, pointing at an
  entry in either `players` or `npcs` (the token doesn't need to know
  which; resolving it means checking both lists). Tapping a token is a
  shortcut to select that entry; it never holds its own copy of HP. This
  is what makes in-person play (no tokens at all) and online play
  (tokens) work identically — see "One character sheet, no separate
  instances" below.
- **Room metadata** (`OBR.room.setMetadata` / `getMetadata`) — the shared
  source of truth, split across a few namespaced keys rather than one
  giant blob, so a single addition doesn't require rewriting the whole
  library on every write:
  ```
  'grindstone/players': PlayerCharacter[]
  'grindstone/npcs':    NpcStatBlock[]
  'grindstone/spells':  Spell[]   // the Spellbook
  'grindstone/weapons': Weapon[]  // the Armory
  ```
  Subscribe to `OBR.room.onMetadataChange()` per key so additions show up
  live for connected players without a refresh. Local IndexedDB is used as
  an offline cache/working copy, not the source of truth — room metadata
  is authoritative. Room metadata has an undocumented size limit; at the
  scale of content this campaign will realistically accumulate (steady,
  incremental additions over a long campaign, not a bulk import), this
  isn't expected to be a real constraint — see the note under "Open
  questions" if it ever needs revisiting.
  - **Players**: each player has exactly one `PlayerCharacter` entry —
    their sheet and their instance, no template/duplicate distinction
    involved at all (that's an NPC-only concern — see below). GM has
    create/edit rights; a player can edit their own entry once linked via
    `ownerId` (Phase 2).
  - **NPCs**: GM has create/edit rights; players get a read-only
    browse/place UI. See "One character sheet, no separate instances" for
    how templates vs disposable encounter copies work within this list.
  - **Spellbook**: GM curates a shared `Spell[]` catalog. Players browse
    it and add entries to their own character's `spellsKnown: string[]`
    rather than duplicating the spell definition itself.
  - **Armory**: GM curates a shared `Weapon[]` catalog, same pattern —
    one "longsword" definition, referenced by every character that
    carries one, rather than each stat block embedding its own copy.
    Editing a weapon (e.g. rebalancing a damage die) updates it everywhere
    it's used.
- **Broadcast channels** (`OBR.broadcast`) — ephemeral messages, e.g.
  "player X attacked with weapon Y, result: hit for 8 damage" for a combat
  log, and the Dice+ roll-request/roll-result protocol.
- **Player identity** (`OBR.player.id`, `OBR.player.role`) — stable per-user
  ID and GM/PLAYER role, used for ownership and permission gating.

## One character sheet, no separate instances

The group plays both online (OBR, with tokens on a map) and in person
(minis on a physical table, no OBR map involved at all). Targeting must
work identically in both — this ruled out any design where "target" means
"a token," since in-person sessions have none. It also ruled out a
separate `CombatInstance` type sitting alongside stat data — health is
just part of the character sheet, not a detached tracking record.

**PCs and NPCs are two separate types**, because they behave completely
differently: a PC is a single, permanent, one-of-one record; an NPC
archetype ("Goblin") gets duplicated many times with independently
diverging HP. Cramming both into one type meant PCs carried fields
(`isTemplate`, `isEncounterCopy`) that were structurally meaningless for
them — always false, never used. Splitting removes that dead weight
entirely rather than just defaulting it away.

- **`PlayerCharacter`**: exactly one entry per character, full stop — it
  *is* the character's own sheet *and* its own instance, no
  template/duplicate concept involved at all. `currentHp` lives directly
  on it, identical whether a given session is played online (token
  linked) or in person (no token; the player or GM picks them from a list
  instead).
- **`NpcStatBlock`**: a reusable master (`isTemplate: true`) sits in the
  roster for reuse across sessions. "Adding a Goblin to the encounter"
  duplicates it into its own independent entry (`isTemplate: false,
  isEncounterCopy: true`, fresh id, own `currentHp`) rather than
  referencing a shared record — so three goblins in one fight are three
  separate entries with independently-diverging HP, not three pointers at
  one template. Duplicate names auto-increment against existing entries
  sharing the base name ("Goblin", "Goblin 2", "Goblin 3", ...) so they're
  distinguishable in any target list.
  - Only use `isTemplate: true` for disposable mooks meant to be spawned
    many times (generic goblins, guards). A named, recurring NPC —
    someone with continuity across sessions — is a normal, permanent
    entry: `isTemplate: false, isEncounterCopy: false`, never duplicated,
    persisting between appearances, behaving like a `PlayerCharacter` in
    every way except which list it lives in. Flag this choice plainly on
    the creation form, since picking wrong is awkward to unwind later.
  - `isEncounterCopy` is what keeps the disposable duplicates out of the
    permanent library, not `isTemplate` — the roster/browse view filters
    to `isEncounterCopy: false` (so it shows named NPCs and templates, but
    never spent mob copies); a separate "active encounter" view shows
    whatever currently has `isEncounterCopy: true`.
  - Nothing auto-deletes. The GM gets a one-click "Clear Encounter" action
    that bulk-*deletes* every `isEncounterCopy: true` entry once a fight
    wraps up — these were never meant to be permanent, so this is a real
    delete, not an archive — plus the ability to delete a single entry
    individually (e.g. something that fled and might return). Spent
    entries sitting around between a fight ending and the GM clearing
    them is harmless — no automatic timer to get wrong.
- **Attacker/target selection UI is one thing, not two, across both
  types**: a searchable list combining active `PlayerCharacter`s and
  active `NpcStatBlock` entries (named NPCs plus current encounter
  copies), usable identically whether the session has tokens or not. A
  placed token is just a fast way to pick from that same list by tapping
  it on the map — never a separate code path. No in-person/online mode
  switch anywhere.
- The GM's device (their laptop, always present) is treated as the primary
  place combat gets *run and resolved* — the encounter-management view can
  assume a laptop-sized screen without much compromise. A player's own
  character view (their sheet, their own attack rolls) is the part that
  most needs to work well on a phone at the table — see "Build
  responsively" under Working style.

## Data model

```ts
interface CharacterBase {
  id: string;
  name: string;
  ac: number;
  maxHp: number;
  currentHp: number; // lives directly on the character sheet, no separate tracking record
  abilities: {
    str: number; dex: number; con: number;
    int: number; wis: number; cha: number;
  }; // raw scores (10, 14, 18...), NOT modifiers — derive modifiers where needed
  proficiencyBonus: number;
  weaponIds: string[]; // references into the shared Armory, not embedded Weapon objects
  spellsKnown: string[]; // references into the shared Spellbook (Phase 4+)
  // Picked once from OBR's own asset library (OBR.assets.downloadImages)
  // when the character is created/edited, not re-prompted at placement
  // time. Needs the image's own grid/dpi alongside its url - a bare URL
  // string isn't enough to place a token that matches how the art would
  // normally look placed in OBR, and addItems rejects generated data
  // URIs outright (2048-char cap on image.url, and they don't render -
  // OBR fetches image.url over the network rather than reading it inline).
  tokenImage?: {
    image: { url: string; mime: string; width: number; height: number };
    grid: { offset: { x: number; y: number }; dpi: number };
  };
}

// One entry per player, full stop — their sheet and their instance.
// No template/duplicate concept exists for this type at all.
interface PlayerCharacter extends CharacterBase {
  ownerId?: string; // OBR.player.id — set once linked in Phase 2
}

// Both reusable archetypes ("Goblin") and their disposable duplicates
// live in the same NpcStatBlock list — see "One character sheet, no
// separate instances" for how isTemplate/isEncounterCopy distinguish
// them from each other and from permanent named NPCs.
interface NpcStatBlock extends CharacterBase {
  isTemplate: boolean; // reusable master for duplication
  isEncounterCopy: boolean; // disposable duplicate spawned from a template — hidden from the normal roster view, deleted via "Clear Encounter"
}

// The Armory — shared weapon library, referenced by weaponIds above
interface Weapon {
  id: string;
  name: string;
  damageDice: string; // e.g. "1d8"
  damageType: string; // e.g. "slashing"
  ability: 'str' | 'dex'; // which modifier applies (finesse = pick better, later)
  ranged: boolean;
}

// The Spellbook — shared spell library, referenced by spellsKnown above.
// Phase 4, but the shared-storage pattern (room metadata) applies from
// whenever it's built — see Architecture overview
interface Spell {
  id: string;
  name: string;
  level: number; // 0 for cantrip
  area?: { shape: 'cone' | 'sphere' | 'line' | 'cube'; size: number };
  resolution: 'attack' | 'save';
  saveAbility?: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
  damageDice: string;
  damageType: string;
  onSaveHalf: boolean;
}
```

Both `weaponIds` and `spellsKnown` are id references into the shared
Armory/Spellbook, not embedded copies — one definition, many characters
pointing at it. Resolving a character's actual weapons/spells means
looking up those ids against the current Armory/Spellbook state.

Ability modifier formula: `Math.floor((score - 10) / 2)` — compute on the
fly, don't persist modifiers.

## Campaign export/import

A "Export campaign.json" / "Import campaign.json" feature, separate from
per-item editing, covering the full shared library in one file:

```ts
interface CampaignExport {
  version: number; // schema version, so future imports can migrate old exports
  players: PlayerCharacter[];
  npcs: NpcStatBlock[];
  weapons: Weapon[]; // the Armory
  spells: Spell[]; // the Spellbook
  exportedAt: string; // ISO timestamp
}
```

Purpose, in order of importance:
1. **Backup** — a manual safety net against accidental deletion or a bad
   edit to the shared room metadata. Not automatic/scheduled; a button the
   GM presses before doing anything risky, or just periodically out of
   habit.
2. **Portability across rooms** — moving the library to a new OBR room
   (new campaign, recreated room) without re-entering everything by hand.
3. **Sharing** — handing the whole library to someone else (co-GM, a
   friend running their own game) as a single file.

Import runs independently per list (`players`, `npcs`, `weapons`,
`spells`). For each imported entry:

1. **No match by id or by name** in current storage → add automatically.
2. **Match by id, contents identical** (deep equal) → skip silently, no
   prompt.
3. **Match by id, contents differ** (edited since the export) → conflict,
   ask the GM.
4. **No id match, but name matches** — id matching means "definitely the
   same record"; name-only matching is a guess (two independently-created
   entries can coincidentally share a name), so treat it as a possible
   conflict rather than assuming it's the same entity → conflict, ask.

Conflict prompt offers three choices, matching what actually happens to
the data:
- **Keep current** — discard the imported version, current storage
  unchanged.
- **Overwrite** — replace the current entry with the imported version
  (same id).
- **Import as new** — imported version becomes a new entry with a fresh
  id, named `"{name} (imported)"`. Both versions now exist side by side.

Include an "apply this choice to all remaining conflicts" checkbox on the
first conflict prompt, opt-in per import (not a saved default) — importing
an old backup with many conflicts shouldn't mean clicking through each one
individually, but the right default direction (favour current vs favour
import) genuinely varies by situation, so it can't be pre-decided.

This is a UI feature on top of the room-metadata storage from "Architecture
overview" above, not a replacement for it — day-to-day editing still goes
through room metadata directly; export/import is the deliberate,
occasional action.

## Dice integration

We do **not** build our own dice roller. We compute the roll notation and
modifiers ourselves (e.g. "1d20+5"), then delegate the actual roll to the
**Dice+** extension via its broadcast protocol:

- Send a roll request on `dice-plus/roll-request` (see Dice+ docs for exact
  payload shape — confirm this against their current extension source/docs
  before implementing, it may have changed).
- Listen for the result on the corresponding `roll-result` channel.
- Our resolution logic (compare to AC/DC, apply damage) runs once the
  result arrives — we never generate the random number ourselves.

Fallback if Dice+ turns out to be unsuitable in practice: reimplement using
Owlbear's own first-party Dice extension's approach (open source at
github.com/owlbear-rodeo/dice) or a self-built minimal roller. Don't silently
swap this without flagging it — the physics/visual feel matters to the group.

## UI layout reference

Character sheet UI (Phase 1 roster/stat card, and the Phase 3 Unit Card
equivalent) follows the standard 5e character sheet's field grouping —
the same structure used by most digital 5e tools (D&D Beyond, Roll20,
Reroll, etc.), not any one app's specific visual design:

- Ability scores (STR/DEX/CON/INT/WIS/CHA) as a grid, each with its
  derived modifier shown alongside
- Saving throws and skills, grouped together
- A combat block: AC, HP (current/max), initiative, speed
- Attacks/weapons list (Armory references — see Data model)
- Spellcasting section: spell slots, known spells (Spellbook references)
- Equipment/inventory
- Features/traits (freeform)

This is standard field arrangement, not a specific app's visual design —
fine to follow closely. Do not replicate any specific app's original
artwork, icon set, or distinctive visual treatment (e.g. Reroll's pixel
art style) — draw/source original visuals for Grindstone's own UI.

## Roadmap / build order

Build in this order. Each phase should be genuinely usable at the table
before moving to the next — don't let scope creep pull later-phase work
into earlier phases.

### Phase 0 — Scaffolding + deployment pipeline
- Vite + Vue 3 + TS project, `@owlbear-rodeo/sdk` installed
- Minimal `manifest.json` + placeholder page, served locally
- Prove the local dev loop first: `npm run dev`, add the localhost
  manifest URL to a test OBR room, confirm hot reload works inside the
  iframe — this stays the default day-to-day workflow throughout the
  project, not just Phase 0
- Push to a **public** GitHub repo
- GitHub Actions workflow (`actions/deploy-pages`, official Pages
  starter template) building and deploying on push to `main` — free and
  unmetered on a public repo, no build-minute concerns
- Enable Pages in repo settings, source = GitHub Actions
- Confirm the deployed manifest URL loads correctly inside a real OBR
  room (not just a browser tab) — this is the actual proof it works,
  catches any CSP/CORS issues a plain page load wouldn't
- Once proven, this pipeline is left alone — don't push-to-deploy as the
  main dev loop, that's what localhost is for. Push periodically (session
  checkpoints, before showing the DM a build) to update the live version

### Phase 1 — Character/stat block system
- `PlayerCharacter` and `NpcStatBlock` schemas, stored on room metadata as
  the source of truth (GM read/write, players read-only except their own
  linked `PlayerCharacter` once Phase 2 lands); IndexedDB as a local cache
  — `currentHp` lives directly on both from the start, no separate
  tracking record
- `campaign.json` export/import (see "Campaign export/import" above) as a
  secondary backup/portability feature, not the primary save path — start
  with just `players` and `npcs`, extend to include `weapons` in Phase 3
  and `spells` in Phase 4
- "New character" creation form (GM-only for NPCs; a player's own
  `PlayerCharacter` is the Phase 2 exception)
- Searchable roster list, reading from room metadata via
  `OBR.room.onMetadataChange()` so it stays live
- Click-to-select, click-to-place on the map → `OBR.scene.items.addItems()`
  at the clicked scene coordinate: for a template NPC, this duplicates it
  into a fresh `isTemplate: false, isEncounterCopy: true` entry and sets
  that new entry's id as the token's `statBlockId`; for a `PlayerCharacter`
  or named NPC, it just links the token to their existing single entry —
  placement is always optional, never required for a character to exist
  or be targetable
- Read a placed token's metadata back and display it — this proves the
  full loop end to end
- "Clear Encounter" bulk action (GM-only) *deleting* all
  `isEncounterCopy: true` NPC entries, plus per-entry delete for one-offs

### Phase 2 — Player/DM permissions
- `ownerId` on player-owned `PlayerCharacter` entries/tokens
- GM-only UI to assign a `PlayerCharacter` to a connected player, sourced
  from `OBR.party.getPlayers()`
- Permission gate: GM edits everything; a player only edits where
  `metadata.ownerId === OBR.player.id`. Soft/UI-level only — not real
  security, that's fine for this use case.

### Phase 3 — Armory, weapon attacks + dice resolution
- Shared `Weapon[]` Armory on room metadata, GM-authored, live-synced to
  players via `onMetadataChange()`
- Character-facing "equip from Armory" UI, writing to a character's own
  `weaponIds` — never duplicating the weapon definition itself
- Attacker/target selection reads the combined list of active
  `PlayerCharacter`s and non-template `NpcStatBlock` entries (Phase 1),
  not tokens directly — works the same in an all-in-person session with
  zero tokens as it does online
- Attack flow: pick attacker + target + equipped weapon → compute
  modifier → roll via Dice+ → resolve against target's AC → roll/apply
  damage → write new `currentHp` directly onto the target's entry
- Broadcast a simple combat log message so the table sees what happened

### Phase 4 — AoE spells, spellbook + spell slots
- Shared `Spell[]` spellbook on room metadata, GM-authored, live-synced to
  players via `onMetadataChange()`
- Player-facing "browse spellbook, add to my character" UI, writing to
  their own `spellsKnown` — never duplicating the spell definition itself
- Spell slot tracking per character (`{level, max, used}`)
- AoE targeting: draw the shape on the map, point-in-shape math against
  token positions to find affected tokens
- Extend Phase 3's resolution engine to handle multiple targets and saving
  throws, not just single-target attack rolls

### Phase 5 — Polish
- Visual HP bars / token state
- Short-lived "attack animation" scene items spawned at a target and
  auto-removed after a delay
- Whatever else falls out of actually playing with it

## Open questions to resolve during the build, not before

- Whether `NpcStatBlock` ever needs a hostile/friendly split — no known
  behavioural difference yet, don't add it until a real rule needs it
- Exact Dice+ broadcast payload shape — verify against current source
  before wiring up Phase 3
- Concentration tracking mechanics — deferred to Phase 4, don't design it
  prematurely

## Working style

- Smallest working slice first, always. Don't build the roster UI before
  the underlying create/place/read loop works with hardcoded data.
- Additive over big-bang: new fields and phases should extend the existing
  schema, not require rewriting earlier phases.
- Flag license/copyright concerns (content, not code) rather than guessing.
- Flag if an OBR SDK method referenced here doesn't match its current
  documented behaviour — the SDK evolves and this file may lag it.
- Build responsively from the start, not as a later pass. The group plays
  in person as well as online, and players/GM may use this on a phone at
  the table — same web app either way (OBR has no separate native mobile
  app, extensions render the same iframe popover on mobile browsers as
  desktop), so it just needs the UI itself to reflow sensibly at phone
  width. Use Tailwind's responsive utilities consistently; test on an
  actual phone screen periodically, not just a resized desktop browser.
  Pay particular attention to: the stat card layout reflowing to stacked
  sections at narrow widths, and tap-to-place on the map working cleanly
  as a touch interaction.
