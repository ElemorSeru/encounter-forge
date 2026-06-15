# Encounter Forge: Content Reference

This document covers all content options used during creature generation: what exists, what each field means, and how themes and types affect what a creature receives. Intended for developers, content contributors, or anyone building around the NPCs Encounter Forge produces.

---

## How Generation Works

When a GM generates an encounter, Encounter Forge:

1. Sizes the **whole encounter** to the party's capability and the chosen difficulty (the "encounter envelope" (see Calibrate to Party)), then splits that into a per-creature HP/DPR target and finds the CR whose DMG baseline most closely matches it. That CR is used only to pick a flavor tier (chassis stats, traits, actions, spells, AC/save DC), not as the creature's final HP/DPR.
2. Picks a **chassis** (the creature's combat archetype).
3. Draws **traits** from the general pool, filtered by CR and theme.
4. Picks **actions** (attacks and special moves), filtered by CR, chassis, and theme.
5. Optionally selects **spells** for spellcasting chassis.
6. Tunes the creature's HP, AC, and damage to hit its per-creature envelope target.
7. Writes the creature to a Foundry NPC actor with all stats, items, and resources set.

In **Solo Boss** mode, the single creature's envelope target is amplified (HP x1.5, DPR x1.3) to compensate for the action economy disadvantage of facing a full party alone, and it additionally gets AC +2, 3 guaranteed actions, and a draw from the legendary trait pool. Legendary resources (the 3/3 action counter, lair resource, resistance counter) only appear when a trait that requires them was actually drawn.

---

## CR and Tiers

CR drives filtering throughout. Most content has `cr_min` and `cr_max` values that gate availability. Internally, CR is bucketed into tiers:

| Tier | CR Range | Prof Bonus |
|------|----------|------------|
| 1    | 0 - 1    | +2         |
| 2    | 2 - 4    | +2         |
| 3    | 5 - 7    | +3         |
| 4    | 8 - 10   | +3 / +4    |
| 5    | 11 - 13  | +4 / +5    |
| 6    | 14 - 15  | +5         |

Tier affects: action damage scaling, number of traits drawn, action count, skill expertise eligibility, size growth, and sense range scaling.

---

## Themes

Themes are the creature's type and the primary tag used to filter content. Valid theme values:

| Theme       | Flavor                                          |
|-------------|-------------------------------------------------|
| beast       | Predatory animals, natural hunters              |
| undead      | Reanimated dead, wraiths, vampires              |
| aberration  | Alien intelligences, eldritch entities          |
| humanoid    | Bandits, soldiers, cultists, named NPCs         |
| elemental   | Fire, earth, water, air manifestations          |
| fey         | Fey creatures, tricksters, nature spirits       |
| fiend       | Demons, devils, infernal servants               |
| dragon      | True dragons and draconic creatures             |
| construct   | Golems, automatons, animated objects            |
| monstrosity | Unnatural predators that don't fit other types  |
| any         | Wildcard: applies to all themes                |

When theme is set to `any` during generation, no tag filtering is applied and only untagged or `any` tagged content is eligible.

---

## Chassis (Combat Archetypes)

The chassis determines the creature's combat role, stat spread, size progression, and which actions it is eligible to receive.

| Chassis    | Role                                                      |
|------------|-----------------------------------------------------------|
| brute      | High HP, high damage melee. Grows large quickly.          |
| lurker     | Stealthy striker, high Dex. Stays medium-sized.           |
| skirmisher | Mobile melee, balanced offense. Medium to large.          |
| controller | Debuffs and area denial. Always a spellcaster.            |
| artillery  | Ranged damage dealer. 50% chance to cast spells.          |
| leader     | Buffs allies, social skills. Always a spellcaster.        |

Chassis also determines guaranteed skills:

| Chassis    | Guaranteed Skills                      |
|------------|----------------------------------------|
| brute      | Athletics                              |
| lurker     | Stealth, Perception                    |
| skirmisher | Acrobatics, Athletics                  |
| controller | Arcana, Insight                        |
| artillery  | Arcana, Investigation                  |
| leader     | Persuasion, Insight, Intimidation      |

---

## Content Fields: How to Read Them

### Trait Fields

| Field           | Meaning                                                                                      |
|-----------------|----------------------------------------------------------------------------------------------|
| `id`            | Unique internal identifier. Must not be duplicated within the file.                          |
| `name`          | Display name shown on the Foundry item.                                                      |
| `category`      | `defensive`, `offensive`, `passive`, `movement`, `senses`, `reactions`, or `legendary`.     |
| `cr_min`        | Minimum CR (numeric) the creature must be to draw this trait.                                |
| `cr_max`        | Maximum CR. Set to 15 for no upper limit.                                                    |
| `cr_adjustment` | How much this trait spends from the CR budget when selected. Positive = stronger. Negative = drawback. |
| `weight`        | Relative draw frequency. Higher weight = appears more often when the pool is shuffled.       |
| `tags`          | Which themes can receive this trait. `any` means all. Empty array also means all.            |
| `description`   | Text shown on the Foundry item. Supports `{dc}` and `{prof}` placeholders.                   |
| `effect`        | Optional stat changes: `ac_bonus`, `hp_bonus`, `resistance`, `immunity`, `condition_immunity`, `speed`. |

**Placeholders in descriptions:**
- `{dc}` - `8 + proficiency bonus + highest mental stat modifier`
- `{prof}` - creature's proficiency bonus

### Action Fields

| Field             | Meaning                                                                                  |
|-------------------|------------------------------------------------------------------------------------------|
| `action_type`     | `mwak` melee weapon, `rwak` ranged weapon, `rsak` ranged spell, `msak` melee spell, `save` saving throw, `util` no roll or save |
| `range`           | Primary range in feet.                                                                   |
| `range_long`      | Long range for ranged attacks (disadvantage beyond normal range).                        |
| `uses_dex`        | If true, Dex modifier is used for attack rolls instead of Str.                           |
| `damage_tiers`    | Damage formula per tier (`tier1`-`tier6`). Scales automatically with CR tier.           |
| `damage_fallback` | Used if no tier match is found.                                                          |
| `chassis_affinity`| Which chassis types can receive this action. `any` means all chassis.                   |

### Legendary Trait Fields

| Field             | Meaning                                                                                  |
|-------------------|------------------------------------------------------------------------------------------|
| `legendary_type`  | `action`, `lair`, `resistance`, or `passive`.                                            |
| `legendary_cost`  | For `action` type: legendary action charges it costs (1 or 2).                          |
| `resistance_uses` | For `resistance` type: uses per day. Sets the `legres` resource counter.                |

### Spell Fields

| Field      | Meaning                                                                                      |
|------------|----------------------------------------------------------------------------------------------|
| `name`     | Spell name matched against compendium (case-insensitive). Falls back to synthetic item if not found. |
| `cantrip`  | If true, drawn as at-will cantrip. If false, drawn as 1/day leveled spell.                  |
| `school`   | Spell school for display only.                                                               |
| `tier_min` | Minimum tier the creature must be to use this spell.                                         |
| `tags`     | Theme tags. Same filtering rules as traits.                                                  |
| `fallback` | Used when compendium import fails. Contains `type` (util/attack/save) and optional `damage`. |

---

## Trait Pool - General Traits

General traits are drawn during normal assembly. Each creature draws 1-4 traits depending on tier, subject to a CR adjustment budget that grows with tier (1 at tier 1-2, 2 at tier 3-4, 3 at tier 5-6).

### Defensive Traits

| Name                  | CR Min | Tags                                    | Effect                                                        |
|-----------------------|--------|-----------------------------------------|---------------------------------------------------------------|
| Hardened Hide         | 0      | any                                     | +1 AC                                                         |
| Fire Resistance       | 0      | any, elemental, fiend, dragon           | Resistance: fire                                              |
| Cold Resistance       | 0      | any, elemental, undead                  | Resistance: cold                                              |
| Poison Immunity       | 0      | any, undead, construct, fiend           | Immunity: poison; condition immunity: poisoned                |
| Shock-Tolerant Frame  | 0      | any, construct, elemental               | Resistance: bludgeoning                                       |
| Unfettered Will       | 0      | any, undead, construct, aberration      | Condition immunity: charmed                                   |
| Heedless Nerve        | 0      | any, undead, construct                  | Condition immunity: frightened                                |
| Rooted Stance         | 0      | any, construct, elemental, beast        | Condition immunity: prone                                     |
| Tireless Chassis      | 0      | any, construct, undead                  | Condition immunity: exhaustion                                |
| Monstrous Bulk        | 0      | monstrosity, beast                      | +4 HP                                                         |
| Dragon Scales         | 0      | dragon                                  | +1 AC, resistance: fire                                       |
| Reinforced Plating    | 0      | construct                               | +1 AC, resistance: piercing                                   |
| Ward of Iron          | 1      | humanoid, construct                     | Resistance to nonmagical damage on first bloodying            |
| Stone Patience        | 1      | any, construct, elemental, beast        | +3 AC while stationary on turn                                |
| Death's Familiarity   | 1      | undead, fiend, aberration               | Resistance: necrotic                                          |
| Blood Ward            | 2      | any, fiend, aberration                  | Adaptive resistance to first damage type taken each round     |
| Symbiotic Plating     | 2      | any, beast, aberration                  | Cannot be surprised                                           |
| Spore Ward            | 2      | beast, aberration, elemental            | Melee attackers Con save or speed halved                      |
| Carapace of Grief     | 3      | any, undead, aberration                 | First hit each combat deals minimum damage                    |
| Necrotic Anchor       | 3      | undead, fiend                           | Resistance: necrotic; cannot drop below 1 HP from necrotic    |
| Fey Veil              | 2      | fey, aberration                         | Attacker Wis save or disadvantage on their next attack        |
| Hollow Core           | 4      | any, construct, undead, aberration      | Immune to critical hit bonus damage                           |
| Psychic Inversion     | 4      | aberration, undead, fiend               | Psychic damage heals instead of harms                         |
| Earthen Grounding     | 0      | any, elemental, construct, beast        | Resistance: lightning                                         |
| Reflective Carapace   | 5      | any, construct, dragon, elemental       | 1-in-6 chance to rebound ranged spells back to caster         |
| Void Shroud           | 5      | aberration, undead, fiend               | Once per combat: survive a killing blow at 1 HP               |
| Bone Lattice          | 5      | undead, construct                       | Once per day: return to 1 HP when reduced to 0                |
| Unbreakable Glamour   | 3      | fey                                     | Disadvantage on attacks from creatures the creature hasn't attacked yet |

### Offensive Traits

| Name                  | CR Min | Tags                                    | Effect                                                        |
|-----------------------|--------|-----------------------------------------|---------------------------------------------------------------|
| Venomous Strike       | 0      | any, beast, aberration                  | Melee hit: Con save or poisoned until end of next turn        |
| Pack Tactics          | 0      | any, beast, humanoid                    | Advantage when ally is adjacent to target (CR 0-10)           |
| Bloodscent Frenzy     | 1      | any, beast                              | Advantage on melee attacks vs bloodied targets                |
| Hunger Eternal        | 1      | any, beast, undead                      | Must advance toward nearest creature each turn                |
| Wound That Remembers  | 2      | any, undead, fiend, aberration          | 1d4 necrotic at start of target's next turn after hit         |
| Parasitic Legacy      | 2      | any, aberration, undead, beast          | On death: killer Con save or poisoned and can't heal          |
| Fey Enthrall          | 2      | fey, fiend                              | Hit + Cha save: compelled to follow a suggestion next turn    |
| Monstrous Presence    | 2      | monstrosity, beast, dragon              | Wis save at start of turn or lose bonus action                |
| Brand of Suffering    | 3      | any, fiend, undead                      | Two hits in one turn: attackers gain advantage until next turn |
| Doom Howl             | 3      | any, beast, undead, fiend               | Once/combat: paralysis in 60 ft on failed Wis save            |
| Spite Burst           | 2      | any, fiend, aberration, undead          | Force damage AoE burst on first bloodying                     |
| Frightful Presence    | 3      | any, dragon, fiend, undead              | 60 ft fear aura, Wis save or frightened 1 min                 |
| Hex Spit              | 3      | any, fiend, aberration, fey             | Ranged hit: disadvantage on next attack; nat 20 becomes nat 1 |
| Spite Bond            | 3      | any, undead, fiend                      | On death: killer Wis save or disadvantage on attacks 1 min    |
| Fey Curse             | 3      | fey, undead, aberration                 | Bonus action: -1d4 to all saves until dispelled               |
| Elemental Surge       | 3      | elemental, dragon, fiend                | Once/round: add 1d8 elemental damage to an attack             |
| Elemental Overload    | 3      | elemental, dragon                       | Critical hit stuns target until end of their next turn        |
| Tactical Positioning  | 1      | humanoid, any                           | Advantage + 1d4 bonus damage when flanking                    |
| Savage Rend           | 2      | monstrosity, beast, aberration          | Two hits: bonus slashing + no natural healing on Con save     |
| Corrupting Touch      | 2      | any, undead, aberration, fiend          | Hit + Con save: Strength reduced by 1d4                       |
| Enervating Aura       | 4      | any, undead, fiend, aberration          | Speed halved for creatures starting turn within 10 ft         |
| Life Drain            | 3      | undead, fiend, aberration               | Necrotic damage reduces HP maximum                            |
| Mnemonic Hunger       | 4      | aberration, undead                      | Gain temp HP equal to half psychic damage dealt               |
| Overclock             | 4      | construct                               | Bonus action: extra attack this turn; speed halved after       |
| Petrifying Gaze       | 4      | any, aberration, beast, dragon          | Restrain then petrify on repeated Con saves                   |
| Sunlight Sensitivity  | 0      | undead, aberration                      | Disadvantage on attacks and Perception in sunlight (cr_adj -0.5)|
| Memory Theft          | 5      | aberration, fey, undead                 | Critical hit: lose spell slot or feature on Int save          |
| Mark of Doom          | 5      | undead, fiend                           | Death saves at disadvantage; no resurrection 24 hrs            |
| Doom Mark             | 5      | undead, fiend                           | (same as Mark of Doom - see legendary.json for entry)         |

### Passive Traits

| Name                  | CR Min | Tags                                    | Effect                                                        |
|-----------------------|--------|-----------------------------------------|---------------------------------------------------------------|
| Primal Mind           | 0      | any, beast                              | Immune to social conditions (CR 0-8)                         |
| Reckless              | 0      | any, beast, humanoid                    | Voluntary: advantage on attacks, same for attackers           |
| False Appearance      | 0      | any, beast, construct, elemental        | Indistinguishable from environment when motionless            |
| Amphibious            | 0      | any, beast, elemental                   | Breathes air and water                                        |
| Mimicry               | 0      | any, beast, fey                         | Can mimic sounds and voices                                   |
| Monstrous Instinct    | 0      | monstrosity, beast                      | Always acts first round without needing high initiative (CR 0-10)|
| Blood Hunger          | 1      | undead, beast, aberration               | Regains HP equal to killing blow damage                       |
| Battle Hardened       | 1      | humanoid, any                           | Immune to frightened while ally is visible                    |
| Perfect Memory        | 1      | construct, aberration                   | Immune to memory alteration; advantage on recall checks       |
| Void Step             | 2      | any, undead, aberration, fey            | Silent movement; auto succeeds Stealth (noise)                |
| Dream Siphon          | 2      | undead, fey, aberration                 | Regen 1 HP/turn from sleeping creatures nearby                |
| Cursed Vessel         | 2      | undead, fiend                           | Healing spells fail; holy water deals 2d6 radiant             |
| Corroded Memory       | 2      | aberration, undead                      | Witnesses can't describe creature for 24 hrs                  |
| Elemental Body        | 2      | elemental                               | 1d4 elemental damage on touch or melee hit                    |
| Pact of the Wild      | 2      | fey, elemental                          | No surprise, Stealth advantage, +10 speed in natural terrain  |
| Magic Resistance      | 3      | any                                     | Advantage on saves vs spells and magical effects              |
| Magic Weapons         | 3      | any                                     | Attacks count as magical                                      |
| Regeneration          | 3      | any                                     | Regain 10 HP/turn; suppressed by acid or fire damage          |
| Swarmborn             | 3      | any, beast, aberration                  | At half HP: advantage on all attacks for 1 round (CR 3-10)    |
| Ancestor's Whisper    | 3      | undead, fey, aberration                 | Extract info from corpses dead within 24 hrs                  |
| Salt of Sorrow        | 3      | undead, aberration, fey                 | Attacker takes 1d4 psychic when dealing psychic damage        |
| Draconic Authority    | 3      | dragon, fiend                           | Lower-CR creatures can't approach on failed Wis save          |
| Echo Form             | 3      | any, fey, aberration, undead            | First attack has 50% miss chance vs phantom copy              |
| False Prophet         | 4      | fiend, fey, aberration                  | Even passing a save causes disadvantage on Insight checks     |
| Timekeeper            | 4      | any, construct, aberration              | Immune to haste/slow; advantage on initiative                 |
| Verdant Growth        | 1      | any, beast, fey, elemental              | Regen 5 HP/turn in natural terrain                            |
| Mirror Soul           | 5      | any, construct, aberration, fey         | Reflects last damage type taken to melee attackers 1 turn     |
| Tethered Soul         | 5      | undead, aberration                      | Remains active for one final turn after reaching 0 HP         |
| Legendary Resistance (1/Day)| 7 | any                                | Once/day: auto-succeed a failed save                          |

### Movement Traits

| Name              | CR Min | Tags                                    | Speed Effect / Notes                                         |
|-------------------|--------|-----------------------------------------|--------------------------------------------------------------|
| Spider Climb      | 0      | any, beast, aberration                  | Climb 30 ft; can move on ceilings                            |
| Aquatic Body      | 0      | any, beast, elemental                   | Swim 40 ft; doesn't need air                                 |
| Sure-Footed       | 0      | any                                     | Ignores natural difficult terrain                             |
| Tunneling Form    | 0      | any, beast, elemental, construct        | Burrow 20 ft; detect vibrations within 30 ft                 |
| Relentless Stride | 1      | construct, humanoid                     | Never slowed by difficult terrain; min 10 ft speed           |
| Rootsense         | 1      | any, beast, elemental                   | Burrow 20 ft; detect ground contact creatures within 60 ft   |
| Winged Form       | 1      | any, beast, fiend, fey, dragon          | Fly 40 ft                                                    |
| Predator Sprint   | 1      | monstrosity, beast                      | Double speed and no OA on first turn of combat               |
| Flyby             | 1      | any, beast, fey                         | No opportunity attacks when flying out of reach              |
| Flowing Form      | 2      | any, elemental, aberration              | Move through 1 inch gaps; enter creature's space             |
| Wing Rush         | 2      | dragon, beast, fey                      | Fly 30 ft; charge attack deals bonus damage and knockback     |
| Wind Rider        | 2      | any, elemental, fey, beast              | No OA after Dash action                                      |
| Death Stride      | 2      | undead, fiend                           | Ignores difficult terrain from remains or necrotic effects   |
| Shadow Step       | 3      | any, undead, fey, fiend                 | Bonus action: teleport 30 ft to dim light/darkness + attack  |
| Gravity Defiance  | 3      | any, construct, aberration, fey         | Treats walls and ceilings as floors                          |
| Blink Step        | 3      | fey, aberration                         | End of turn: teleport up to 10 ft                            |
| Earth Glide       | 3      | elemental, construct                    | Burrow 30 ft through unworked stone without disturbing it    |
| Phase Stride      | 4      | any, aberration, undead, construct      | Bonus action: teleport 15 ft, no OA                          |
| Dream Walk        | 4      | fey, undead, aberration                 | Sense and pass through sleeping creatures within 120 ft      |
| Liquid Form       | 4      | elemental, aberration                   | Squeeze through 1 inch gaps; resistance to physical attacks  |
| Mist Form         | 5      | undead, fey, elemental                  | Bonus action: immune to damage until next turn, pass any gap |
| Temporal Skip     | 6      | any, construct, aberration, fey         | Reaction: miss an attack, skip forward in time, reappear next turn |

### Senses Traits

Note: base senses are also assigned automatically per theme regardless of these traits.

| Name                  | CR Min | Tags                                    | Notes                                                        |
|-----------------------|--------|-----------------------------------------|--------------------------------------------------------------|
| Darkvision            | 0      | any                                     | 60 ft                                                        |
| Keen Smell            | 0      | any, beast                              | Advantage on Perception (smell)                              |
| Keen Hearing          | 0      | any, beast                              | Advantage on Perception (hearing)                            |
| Primal Awareness      | 0      | monstrosity, beast                      | Advantage on Perception; can't be surprised non-magically    |
| Combat Instincts      | 0      | humanoid, any                           | Cannot be surprised while conscious                          |
| Draconic Senses       | 0      | dragon                                  | Advantage on Perception; smells gold and magic within 60 ft  |
| Blindsight            | 1      | any, beast, construct, aberration       | 30 ft                                                        |
| Tremorsense           | 1      | any, beast, elemental, construct        | 30 ft                                                        |
| Scent of Fear         | 1      | any, beast, undead, fiend               | Automatically knows HP status of smelled creatures            |
| Death Sense           | 1      | undead, fiend                           | Detects downed creatures; knows direction of nearest corpse  |
| Elemental Attunement  | 1      | elemental, dragon                       | Identifies incoming damage type before it resolves           |
| Undead Awareness      | 1      | undead, fiend                           | Knows location and HP of living creatures within 60 ft       |
| Superior Darkvision   | 2      | any, undead, fiend, aberration          | 120 ft                                                       |
| Arcane Awareness      | 2      | any, aberration, fey, dragon            | Detects magic and concentration within 30 ft passively       |
| Limited Telepathy     | 2      | any, aberration, fiend, fey             | Communicates concepts and emotions within 30 ft              |
| Echo Location         | 2      | any, beast, aberration                  | Detects invisible creatures within 30 ft via sound           |
| Emotional Sight       | 2      | aberration, fey, fiend                  | Sees emotional auras; advantage on Insight                   |
| Threat Scanner        | 2      | construct, aberration                   | Always knows HP totals and count of nearby creatures          |
| Fey Sight             | 2      | fey, aberration                         | Sees through illusions and polymorph; advantage on charm saves|
| Truth Sense           | 3      | any, fey, fiend, aberration             | Knows when creatures within 30 ft are lying                  |
| Truesight             | 5      | any, fiend, aberration, dragon, construct | 10 ft truesight                                            |

### Reactions

| Name                | CR Min | Tags                                    | Trigger / Effect                                             |
|---------------------|--------|-----------------------------------------|--------------------------------------------------------------|
| Parry               | 1      | any, humanoid                           | Melee hit: add proficiency bonus to AC                       |
| Uncanny Dodge       | 2      | any                                     | Hit: halve the attack's damage                               |
| Spite Rebound       | 2      | any, fiend, undead, aberration          | Melee hit: 1d6 force damage to attacker                      |
| Predator's Instinct | 2      | any, beast                              | Ally drops to 0: move full speed toward any creature         |
| Thrashing Counter   | 1      | any, beast                              | Grappled: make one melee attack against grappler             |
| Riposte             | 2      | humanoid, any                           | Attacker misses: one melee attack with advantage             |
| Repulsion Pulse     | 2      | any, construct, elemental, aberration   | Creature enters 5 ft: Str save or pushed 10 ft              |
| Savage Retaliation  | 2      | monstrosity, beast                      | Hit from 5 ft: make one melee attack against attacker        |
| Shield Ally         | 1      | any, humanoid, construct                | Ally targeted: swap positions, take the hit instead          |
| Curse Backlash      | 3      | fiend, fey, undead                      | Targeted by spell: caster Wis save or spell fails            |
| Glamour Redirect    | 3      | fey, fiend                              | Targeted: redirect attack to charmed creature within 30 ft   |
| Fey Vengeance       | 3      | fey, undead                             | Creature passes your save: disadvantage on their next save   |
| Elemental Discharge | 3      | elemental, dragon, construct            | Take 10+ damage: AoE burst to creatures within 10 ft         |
| Death Throes        | 3      | any, elemental, construct, aberration   | Reduced to 0: one final attack or action before dying         |
| Phantom Split       | 4      | any, fey, aberration, undead            | Targeted: d6 roll, 4+ means attack hits phantom and misses   |
| Redirect            | 4      | any, aberration, undead                 | Damaged: transfer half damage to a marked creature within 60 ft|
| Spatial Fold        | 4      | aberration, construct                   | Hit: take damage, then teleport 15 ft away                   |
| Dragon Retaliation  | 4      | dragon, monstrosity                     | Take 15+ damage: one melee attack if attacker is in reach    |
| Arcane Deflection   | 5      | any, construct, dragon, aberration      | Pass a spell save: 1d8 force to a creature within 30 ft      |
| Spell Deflect       | 5      | any, construct, dragon, aberration      | (same as Arcane Deflection - see reactions.json)             |

---

## Legendary Trait Pool

Legendary traits are drawn separately. Non-solo high tier creatures (tier 5+) draw one. Solo bosses draw one guaranteed `action` type and one from everything else, subject to CR filtering. If no traits clear the filter, no legendary resources appear on the sheet.

All legendary traits have `cr_min: 5` or higher.

| Name                              | Type       | CR Min | Tags                              | Notes                                                       |
|-----------------------------------|------------|--------|-----------------------------------|-------------------------------------------------------------|
| Legendary Resistance (2/Day)      | resistance | 7      | any                               | Auto-succeed 2 failed saves/day; sets legres to 2/2         |
| Lair Action: Tremor               | lair       | 5      | any, elemental, dragon, construct | Dex save or prone in 30 ft (initiative count 20)            |
| Lair Action: Crushing Dark        | lair       | 5      | undead, fiend, aberration         | Snuffs all nonmagical light within 60 ft                    |
| Lair Action: Dire Summons         | lair       | 5      | any, fiend, undead                | Summons lesser creatures within 30 ft                       |
| Lair Action: Psychic Tremor       | lair       | 5      | aberration, fey                   | Wis save or 2d6 psychic + no reaction                       |
| Lair Action: Scorched Earth       | lair       | 5      | dragon, elemental, fiend          | Dex save or fire damage; area becomes difficult terrain      |
| Legendary Action: Swift Advance   | action     | 5      | any                               | Move (1 charge); Attack (2 charges)                         |
| Legendary Action: Wail of the Forsaken | action | 5    | undead, fiend                     | 1 charge: Wis save or frightened                            |
| Legendary Action: Mind Shatter    | action     | 5      | aberration, fiend                 | 2 charges: Int save or 4d6 psychic + stunned                |
| Legendary Action: Vanishing Step  | action     | 5      | fey, undead                       | 1 charge: turn invisible until next turn or attack          |
| Legendary Action: Apex Strike     | action     | 5      | beast, monstrosity, dragon        | 2 charges: advantage attack + 2d8 bonus + Str save or prone |
| Legendary Action: Cursed Strike   | action     | 5      | undead, fey, fiend                | 2 charges: attack + curse (disadvantage on saves until removed)|
| Legendary Healing: Drain the Fallen | passive  | 9      | undead, fiend, aberration         | Regain 20 HP when a creature within 30 ft drops to 0        |
| Legendary Resilience: Breath Recharge | passive| 9      | dragon, elemental                 | d6 at start of turn; 5-6 recharges breath/area attack       |
| Legendary Resilience: Self-Repair | passive    | 9      | construct                         | Regen 10 HP/turn while below half HP                        |

---

## Actions

Each creature receives 1-3 actions based on tier, or always 3 for solo bosses. When a creature receives more than one action, a Multiattack item is also generated describing which attacks it makes. Damage scales automatically with the creature's tier via `damage_tiers`.

### Melee Actions

| Name              | Type | Reach | CR Min | Chassis             | Tags                             | Damage      | Secondary Effect                              |
|-------------------|------|-------|--------|---------------------|----------------------------------|-------------|-----------------------------------------------|
| Slam              | mwak | 5     | 0      | brute, skirmisher, any | any                           | bludgeoning | -                                             |
| Claw              | mwak | 5     | 0      | lurker, skirmisher, brute, any | beast, aberration, dragon, any | slashing | -                                     |
| Bite              | mwak | 5     | 0      | brute, lurker, any  | beast, dragon, any               | piercing    | -                                             |
| Necrotic Touch    | mwak | 5     | 1      | controller, leader, any | undead, fiend, aberration     | necrotic    | Extra necrotic can't be healed                |
| Tendril Lash      | mwak | 10    | 1      | controller, brute, any | aberration, beast, any        | bludgeoning | 10 ft reach                                   |
| Rending Claw      | mwak | 5     | 1      | lurker, skirmisher, brute | beast, aberration, any       | slashing    | AC -1 on hit                                  |
| Grasping Limb     | mwak | 5     | 1      | brute, controller, any | any                           | bludgeoning | Grapple on hit (escape DC {dc})               |
| Bone Spike        | mwak | 5     | 1      | lurker, skirmisher, any | undead, construct, beast      | piercing    | -                                             |
| Tail Sweep        | mwak | 10    | 2      | brute, skirmisher, any | dragon, beast, any            | bludgeoning | Str save or prone; 10 ft reach                |
| Numbing Touch     | mwak | 5     | 1      | any                 | undead, elemental                | cold        | Speed -10 ft                                  |
| Ember Strike      | mwak | 5     | 1      | brute, skirmisher, any | elemental, dragon, fiend      | fire        | On-fire: 1d6 fire at start of next turn       |
| Stone Fist        | mwak | 5     | 1      | brute, any          | elemental, construct             | bludgeoning | Str save or knocked back 10 ft                |
| Glamour Touch     | mwak | 5     | 2      | controller, lurker, any | fey, fiend                    | psychic     | Wis save or charmed; can't attack creature    |
| Acid Lash         | mwak | 5     | 1      | lurker, skirmisher, any | aberration, elemental, beast  | acid        | AC -1 per hit, stacks x3                     |
| Savage Gore       | mwak | 5     | 1      | brute, skirmisher, any | monstrosity, beast, any       | piercing    | Must charge; Str save or prone                |
| Rusted Blade      | mwak | 5     | 2      | skirmisher, lurker, any | humanoid, undead, construct   | piercing    | Bleeding 1d4/turn for 1 min                   |
| Thunder Slam      | mwak | 5     | 2      | brute, any          | elemental, monstrosity, construct | thunder   | Con save or deafened + pushed 5 ft            |
| Searing Strike    | mwak | 5     | 2      | controller, any     | fiend, humanoid, fey             | radiant     | Con save or blinded until start of next turn  |
| Psychic Slam      | mwak | 5     | 3      | controller, any     | aberration, fiend                | psychic     | Int save or no reactions until next turn      |

### Ranged Actions

| Name              | Type | Range  | CR Min | Chassis                   | Tags                             | Damage    | Secondary Effect                              |
|-------------------|------|--------|--------|---------------------------|----------------------------------|-----------|-----------------------------------------------|
| Spine Shot        | rwak | 60/120 | 0      | artillery, lurker, skirmisher | beast, any                   | piercing  | -                                             |
| Venom Spit        | rwak | 30/60  | 1      | artillery, lurker, any    | beast, aberration, any           | poison    | Con save or poisoned until end of next turn   |
| Cinder Spit       | rwak | 40/80  | 1      | artillery, any            | elemental, dragon, fiend, any    | fire      | Ignited: 1d6 fire at start of next turn       |
| Bone Shard        | rwak | 30/60  | 1      | artillery, lurker, any    | undead, construct, any           | piercing  | Speed -5 ft until shard removed               |
| Thorn Dart        | rwak | 40/80  | 1      | artillery, skirmisher, any | fey, any                        | piercing  | Wis save or disadvantage on next attack       |
| Acid Spit         | rwak | 30/60  | 1      | artillery, lurker, any    | aberration, beast, elemental, any| acid      | Extra 1d4 acid at start of next turn          |
| Poison Dart       | rwak | 30/60  | 1      | lurker, artillery, any    | humanoid, beast, any             | poison    | Con save or speed 0 until end of next turn (CR 0-10) |
| Arcane Bolt       | rsak | 60/120 | 2      | artillery, controller, any | aberration, fiend, construct, any| force     | -                                             |
| Necrotic Bolt     | rsak | 60     | 2      | artillery, controller, any | undead, fiend, aberration        | necrotic  | Can't regain HP until this creature's next turn|
| Ice Shard         | rsak | 60     | 2      | artillery, controller, any | elemental, dragon, undead        | cold      | Speed -10 ft until end of next turn           |
| Shadow Needle     | rsak | 60     | 2      | lurker, artillery, any    | undead, fey, fiend               | necrotic  | Can't benefit from Help or ally assistance    |
| Thunder Shot      | rsak | 30     | 2      | artillery, controller, any | elemental, monstrosity, any      | thunder   | Con save or deafened + pushed 5 ft            |
| Radiant Burst     | rsak | 60     | 2      | artillery, controller, any | humanoid, fey, fiend             | radiant   | Vs undead/construct: disadvantage on all rolls |
| Lightning Strike  | rsak | 60     | 3      | artillery, controller, any | elemental, construct, dragon, any| lightning | Con save or drop held item                    |
| Psychic Lance     | rsak | 60     | 4      | controller, artillery     | aberration, fiend                | psychic   | Wis save or incapacitated until end of next turn|

### Special Actions

| Name                  | Type | Range | CR Min | Chassis                   | Tags                           | Damage      | Area / Effect                                          |
|-----------------------|------|-------|--------|---------------------------|--------------------------------|-------------|--------------------------------------------------------|
| Stench                | util | 5     | 0      | brute, any                | beast, undead, any             | poison      | 5 ft aura; Con save or poisoned (CR 0-10)              |
| Constrict             | mwak | 5     | 1      | brute, lurker, any        | beast, aberration, any         | bludgeoning | Grapple + restrain; listed damage/turn while restrained |
| Lashing Roots         | save | 30    | 2      | controller, brute, any    | beast, elemental, fey, any     | piercing    | 20 ft radius; Str save or restrained 1 turn             |
| Spore Burst           | save | 20    | 2      | controller, artillery, any| beast, aberration, elemental, any| poison    | 20 ft radius; Con save or blinded and poisoned          |
| Breath Weapon (Fire)  | save | 30    | 3      | brute, artillery, any     | dragon, elemental, any         | fire        | 15 ft cone; Dex save; recharge 5-6                     |
| Breath Weapon (Cold)  | save | 30    | 3      | brute, artillery, any     | dragon, elemental, undead      | cold        | 30 ft line; Con save + speed halved; recharge 5-6      |
| Breath Weapon (Lightning) | save | 40 | 3    | brute, artillery, any     | dragon, elemental, construct   | lightning   | 40 ft line; Dex save + drop held item; recharge 5-6    |
| Breath Weapon (Acid)  | save | 30    | 3      | brute, artillery, any     | dragon, aberration, beast      | acid        | 30 ft cone; Dex save + AC -2; recharge 5-6             |
| Wail of Despair       | save | 30    | 3      | controller, leader, any   | undead, fiend, aberration, fey | psychic     | 30 ft; Wis save; fail by 5+ = incapacitated            |
| Terror Command        | save | 30    | 3      | leader, controller, any   | fiend, dragon, undead, humanoid, any | psychic | Cha save or reaction to flee at full speed          |
| Earth Eruption        | save | 20    | 3      | brute, controller, any    | elemental, monstrosity, any    | bludgeoning | 20 ft radius; Dex save or prone; difficult terrain      |
| Corrosive Pool        | save | 20    | 3      | controller, artillery, any| aberration, elemental, beast   | acid        | 10 ft radius pool; Dex save; pool persists 1 min        |
| Bewildering Glamour   | save | 30    | 3      | controller, leader, any   | fey, fiend, aberration         | psychic     | 30 ft; Wis save or charmed + must approach             |
| Fear Wave             | save | 30    | 4      | leader, controller, any   | dragon, monstrosity, fiend, beast | psychic  | 30 ft; Wis save or drop items and flee                 |
| Necrotic Wave         | save | 15    | 4      | controller, leader, any   | undead, fiend, aberration      | necrotic    | 15 ft radius; Con save or necrotic + HP max reduced     |
| Void Pulse            | save | 15    | 5      | controller, artillery, any| aberration, construct, any     | force       | 15 ft radius; Con save or lose concentration + suppress low magic |
| Call of the Kin       | util | 30    | 5      | leader, controller, any   | beast, undead, fiend, any      | -           | d6 roll: 4+ summons 1d4 lesser creatures               |

---

## Spells

Spells are only available to controller (always), leader (always), and artillery (50% chance) chassis. The engine imports each spell from the active Foundry compendium. If the spell is not found, a synthetic item is built from the `fallback` field.

**Spell counts per tier:**

| Tier | Cantrips (at will) | Leveled Spells (1/day each) |
|------|--------------------|-----------------------------|
| 1-2  | 2                  | 1                           |
| 3-4  | 2                  | 2                           |
| 5-6  | 2                  | 3                           |

The casting stat is the creature's highest mental stat (INT, WIS, or CHA). Spell DC and attack bonus are derived from that stat plus the creature's proficiency bonus.

The pool contains 160 spells across 8 schools (abjuration, conjuration, divination, enchantment, evocation, illusion, necromancy, transmutation), with 18 cantrips and 142 leveled spells.

**Cantrips:** acid splash, blade ward, chill touch, create bonfire, dancing lights, eldritch blast, fire bolt, friends, guidance, mind sliver, minor illusion, poison spray, ray of frost, resistance, shillelagh, thunderclap, toll the dead, true strike

**Leveled spells:** absorb elements, alter self, animate dead, antilife shell, arcane eye, arcane lock, astral projection, bane, banishment, bestow curse, blight, blindness/deafness, blur, burning hands, call lightning, chain lightning, charm monster, charm person, circle of death, clairvoyance, cloud of daggers, cloudkill, color spray, command, comprehend languages, compulsion, cone of cold, conjure animals, conjure elemental, contagion, counterspell, danse macabre, death ward, detect magic, detect thoughts, dimension door, disguise self, disintegrate, dispel magic, dissonant whispers, dominate monster, dominate person, enemies abound, enlarge/reduce, enthrall, etherealness, evard's black tentacles, expeditious retreat, false life, fear, feeblemind, find the path, find traps, finger of death, fire storm, fireball, flame strike, flaming sphere, flesh to stone, fly, fog cloud, foresight, gaseous form, gate, gentle repose, globe of invulnerability, grease, greater invisibility, hallucinatory terrain, harm, haste, hold monster, hold person, hypnotic pattern, ice storm, identify, inflict wounds, invisibility, jump, legend lore, lesser restoration, lightning bolt, locate creature, locate object, longstrider, mage armor, magic circle, major image, meteor swarm, mind blank, mirror image, mislead, misty step, nathair's mischief, passwall, phantasmal force, phantasmal killer, phantom steed, plane shift, polymorph, power word kill, power word pain, power word stun, project image, protection from energy, protection from evil and good, ray of enfeeblement, ray of sickness, sanctuary, scorching ray, scrying, see invisibility, seeming, shadow of moil, shatter, shield, silent image, sleet storm, slow, speak with dead, spider climb, spiritual weapon, stinking cloud, stoneskin, suggestion, summon undead, sunburst, symbol, teleportation circle, thunderwave, transmute rock, true polymorph, true seeing, unseen servant, vampiric touch, warding bond, wall of fire, wall of force, web, weird

---

## Adding New Content

There are two ways to add content to the randomization pools:

- **Custom Content manager (no JSON):** export a feat, weapon, or spell item's sheet into the trait/action/spell pools via the in-app export dialog, then enable/disable, ReSync, or delete entries from the Custom Content manager. Entries live in a world setting, not in `data/en/`. This is the easiest path for one-off homebrew and for sharing content packs between worlds via Export/Import. See the Wiki's [Custom Content](docs/WIKI.md#custom-content) section for the full walkthrough, and [API & Integration](docs/WIKI.md#api--integration) for `api.exportCustomContent()` / `api.importCustomContent(payload)` if you're shipping a content pack from another module.
- **JSON files (bulk/built-in content):** add entries directly to the relevant file under `data/en/`. Use this for large additions, built-in pool expansions, or content you want versioned with the module itself. **Obviously updates will impact this though so keep backups.**

The field concepts below (categories, CR ranges, tags, damage tiers, etc.) apply to both paths. The Custom Content export dialog just collects the same fields through a guided UI instead of hand-written JSON.

Key rules for editing `data/en/` directly:

- **IDs must be unique** within their file.
- **Tags** should use the theme values from the Themes section. Use `"any"` for broad applicability. An empty `tags` array is treated as `"any"`.
- **`cr_adjustment`** consumes from the trait draw budget. The budget is 1 at tier 1-2, 2 at tier 3-4, 3 at tier 5-6. High-power traits should use 1 or more.
- **Descriptions** must be self-contained. Include all distances, conditions, and numbers. Use `{dc}` for save DCs and `{prof}` for proficiency bonus.
- **Legendary traits** additionally require `legendary_type`. Actions require `legendary_cost`.
- **Actions** additionally require `action_type`, `damage_tiers` (tier1-tier6), `chassis_affinity`, and `cr_min`.
- **Spells** only require `name`, `cantrip`, `school`, `tier_min`, `tags`, and `fallback`. The name must match the compendium entry exactly for import to succeed.

---

## Calibrate to Party

Encounter Forge sizes every generated encounter to the party's actual capability and the chosen difficulty, using an "encounter envelope": the total enemy's DPR and HP needed for the WHOLE fight to land at the selected difficulty against this party, split evenly across however many enemies are requested. This always runs, "Calibrate to Party" only changes where the party's DPR/HP numbers come from.

### The encounter envelope

For a party with estimated `dpr` and `hp`, and a difficulty with target round counts:

| Difficulty | Rounds to Defeat | Rounds to Threaten | Resulting Outlook |
|------------|-------------------|----------------------|--------------------|
| Easy       | 2                 | 6                    | Easy               |
| Medium     | 3                 | 5.4                  | Manageable         |
| Hard       | 4                 | 4.4                  | Risky              |
| Deadly     | 5                 | 3.5                  | Dangerous          |

```
groupHP  = party.dpr * roundsToDefeat
groupDPR = (party.hp / roundsToThreaten) * economyFactor
```

`economyFactor` is a small bonus for more enemies (`1 + 0.04 * (enemyCount - 1)`, capped at `1.2`) reflecting that more attackers contribute slightly more total damage per round - it does not change `groupHP`. Both totals are then divided by `enemyCount` to get each creature's HP/DPR target. Because the envelope is derived directly from the difficulty's target ratio, the resulting Outlook stays the same regardless of enemy count - adding enemies redistributes the total threat instead of stacking a new full-strength threat on top.

For **Solo Boss**, `enemyCount` is 1 and the single creature's HP/DPR targets are further multiplied by 1.5 / 1.3 to offset its action-economy disadvantage.

The per-creature HP/DPR target is then matched against `cr-baseline.json` to pick a "flavor CR." This only drives chassis stats, trait/action/spell tier, and AC/save DC, not the creature's final HP/DPR.

### Pre-generation readout

As the player count, level, enemy count, and difficulty fields change, the dialog recalculates and displays:

- **Target CR** - the flavor CR described above.
- **Enemy DPR / HP** - the envelope's total group DPR and HP targets.
- **Party DPR / HP** - the party's estimated damage output and durability (generic, based on class averages, unless Calibrate to Party is enabled with actors selected).
- **Rounds (defeat / threaten)** - how many rounds the party needs to defeat the encounter, and how many rounds the encounter needs to threaten the party.
- **Outlook** - a qualitative label (`Easy`, `Manageable`, `Risky`, `Dangerous`) derived from those round counts, color-coded in the UI. This matches the difficulty's row in the table above.

### Actor picker

Enabling the **Calibrate to Party** toggle reveals a list of player owned actors (portrait, name, owning player). Checking actors feeds their actual HP, AC, saves, and level into the party estimate (and derives Player Count/Level from the selection), used to compute the envelope above. If no actors are selected, the envelope falls back to the generic party estimate based on Player Count/Level.

### Calibration tuning pass

Every generated creature is adjusted to hit its per-creature envelope target before its actor is created:

- **HP** is set directly to the target (rounded, minimum 1).
- **AC** is nudged by at most +/-2: +/-1 when the HP target is more than 30% above/below the chassis baseline, and another +/-1 when the DPR target deviates from the chassis baseline by more than 15%.
- **Damage** is tuned in two passes. First, if the DPR target deviates from the chassis baseline by more than 15%, one of the creature's actions is swapped for a same-tier, theme/chassis-compatible action from the action pool whose damage-per-round is closest to the target. Second, whatever gap remains between the creature's action DPR and its target is closed by adding a flat damage bonus (or penalty) across all of its actions. The action pool's dice tiers alone usually can't reach the envelope's DPR targets, so this step makes sure the final DPR lands on target regardless of what's available. For **Solo** creatures, the action-DPR target is solved so that the boosted action damage *and* the legendary actions' extra "swings" (which scale off per-action DPR) land on the overall target together, rather than the legendary bonus compounding on top of an already-boosted action DPR.

### Post-generation results

After generation, a results dialog lists each created creature (portrait, name, CR, HP, AC, DPR) alongside the group's combined stats versus the party estimate, the rounds-to-defeat/threaten, and the same outlook label shown in the pre-generation readout but now based on the creatures' actual rolled stats.

---

## Public API

Encounter Forge exposes a small API for macros, other modules, and system integrations. Everything is available after the `ready` hook fires.

### Accessing the API

```js
const forge = game.modules.get("encounter-forge").api;
```

---

### `api.generate(options)` -> `Promise<Actor[]>`

Generates one or more NPC actors and returns them. All options are optional.

```js
const actors = await game.modules.get("encounter-forge").api.generate({
  playerCount: 4,
  playerLevel: 5,
  enemyCount:  3,
  difficulty:  "hard",
  theme:       "undead",
  solo:        false,
  name:        "",       // leave blank to use a generated name
  img:         "",       // leave blank to use a theme-matched portrait
  tokenImg:    "",       // leave blank to use a theme-matched token
  disposition: -1,       // -1 Hostile (default), 0 Neutral, 1 Friendly, -2 Secret
  calibrate:     false,  // tune toward partyActorIds (or generic party if none given)
  partyActorIds: []      // actor IDs of the real party, used when calibrate is true
});
```

**Options:**

| Option        | Type    | Default    | Description                                                      |
|---------------|---------|------------|--------------------------------------------------------------------|
| `playerCount` | number  | `4`        | Number of players. Clamped 1-8.                                  |
| `playerLevel` | number  | `1`        | Average player level. Clamped 1-20.                              |
| `enemyCount`  | number  | `1`        | Number of creatures to generate. Clamped 1-10. Ignored if `solo` is true. |
| `difficulty`  | string  | `"medium"` | `"easy"`, `"medium"`, `"hard"`, or `"deadly"`.                  |
| `theme`       | string  | `"any"`    | Creature type filter. See Themes section for valid values.       |
| `solo`        | boolean | `false`    | If true: generates exactly one creature with HP x1.5, AC +2, 3 actions, and legendary trait draws. |
| `name`        | string  | `""`       | Override the generated name. Leave empty to use a generated one. |
| `img`         | string  | `""`       | Override the portrait image path. Leave empty to use a theme-matched image. |
| `tokenImg`    | string  | `""`       | Override the token image path. Leave empty to match the portrait. |
| `disposition` | number  | `-1`       | Token disposition: `-1` Hostile, `0` Neutral, `1` Friendly, `-2` Secret. Maps to `CONST.TOKEN_DISPOSITIONS`. |
| `folder`      | string  | `""`       | Actor folder name. Overrides the default folder setting; created if missing. |
| `calibrate`     | boolean  | `false` | When true, derives the party's DPR/HP from `partyActorIds` instead of generic Player Count/Level estimates. The encounter envelope and per-creature calibration always run regardless of this flag. See "Calibrate to Party" below. |
| `partyActorIds` | string[] | `[]`    | Actor IDs of the real party, used as the party estimate when `calibrate` is true. |

**Returns:** An array of the created `Actor` documents, with extra properties attached for the calibration/estimate data:

| Property        | Type     | Description                                                  |
|------------------|----------|---------------------------------------------------------------|
| `results`        | Array    | Per-creature `{ name, img, cr, profile: { hp, ac, dpr } }`.  |
| `partyEstimate`  | object   | `{ dpr, hp }` for the party (real actors if calibrated, else generic). |
| `groupActual`    | object   | `{ hp, ac, dpr }` summed/averaged across the generated creatures. |
| `groupExpected`  | object   | `{ hp, ac, dpr }` - the encounter envelope's group-wide HP/DPR totals (`groupActual.ac` is reused for `ac`). |
| `rounds`         | object   | `{ roundsToDefeat, roundsToThreaten }`.                       |
| `outcome`        | string   | `"easy"`, `"manageable"`, `"risky"`, or `"dangerous"`.        |
| `targetCR`       | number/string | The flavor CR nearest the per-creature envelope target (drives chassis/traits/actions/spells/AC, not the final HP/DPR). |

The array will be empty if generation failed for all creatures.

**Examples:**

```js
// Quick, one medium-difficulty creature, any theme
const [actor] = await forge.generate();

// A solo undead boss for a level-8 party of 5
await forge.generate({ playerCount: 5, playerLevel: 8, theme: "undead", solo: true });

// Three fiends for a deadly encounter, specific name and portrait
await forge.generate({
  playerCount: 4,
  playerLevel: 10,
  enemyCount:  3,
  difficulty:  "deadly",
  theme:       "fiend",
  name:        "Infernal Warden"
});
```

---

### `api.openDialog()`

Opens the Encounter Forge dialog window, the same one the toolbar button triggers. Useful for macros or your modules.

```js
game.modules.get("encounter-forge").api.openDialog();
```

---

### `api.openDialogFor(overrides)` -> `Promise<Actor[] | null>`

Opens the same dialog as `openDialog()`, but lets another module pre-configure it for a single-NPC use case (my use case was for GM Toos: Lore-Reference-Board: "generate a stat block for this lore token entry") and get the result back. Resolves with the `generate()` result once the GM clicks Generate, or `null` if they close the dialog without generating. Pass `null` (or call with no arguments) for the same behavior as `openDialog()`.

```js
const ef = game.modules.get("encounter-forge");
const actors = await ef.api.openDialogFor({
  name:           "Bandit Captain Vex",
  img:            "modules/lore-reference-board/art/bandit-captain-vex.webp",
  tokenImg:       "modules/lore-reference-board/tokens/bandit-captain-vex.webp",
  lockEnemyCount: true,
  enemyCount:     1
});
```

#### Overrides

| Field | Type | Description |
|---|---|---|
| `name` | string | Pre-fills an editable **Name** field shown at the top of the dialog so the GM can adjust it before generating. |
| `img` | string | Actor portrait path. Applied silently at generate-time - no field is shown for it. |
| `tokenImg` | string | Token image path. Applied silently at generate-time - no field is shown for it. |
| `lockEnemyCount` | boolean | Disables the **Number of Enemies** field. |
| `enemyCount` | number | 1-10. The value the **Number of Enemies** field is locked to when `lockEnemyCount` is true. |

All fields are optional. When `lockEnemyCount` is true and `enemyCount` is greater than 1, the **Solo Boss** toggle is hidden (Solo always forces a single enemy, which would conflict with the lock). When `enemyCount` is 1, Solo remains available. The GM can still opt into Solo's stat boosts and legendary traits for a single locked NPC.

When any overrides are passed, the dialog neither reads nor writes the GM's saved "last used values." It's treated as a one-off generation for the calling module, not a change to the GM's normal defaults.

---

### `api.exportCustomContent()` -> `object`

Returns this world's entire custom content pool (the traits/actions/spells added via the Custom Content manager) as a plain object, the same payload the manager's **Export** button downloads as JSON:

```js
{
  encounterForgeCustomContent: true,
  formatVersion: 1,
  exportedAt: "2026-06-14T00:00:00.000Z",
  data: {
    traits:  [ /* ... */ ],
    actions: [ /* ... */ ],
    spells:  [ /* ... */ ]
  }
}
```

Synchronous and read-only. Useful for inspecting, backing up, or re-exporting the current world's custom content pool programmatically. Entries follow the same field concepts described in "Content Fields: How to Read Them" and "Adding New Content" above.

---

### `api.importCustomContent(payload)` -> `Promise<number>`

Merges a content pack into this world's custom content pools, exactly like the **Import** button in the Custom Content manager. `payload` is an object in the same shape `exportCustomContent()` returns (or the JSON file it downloads). Entries are deep-cloned and given fresh IDs before being appended (importing never overwrites or removes existing entries).

```js
const ef = game.modules.get("encounter-forge");
if (ef?.active && ef.api) {
  const pack = await (await fetch("modules/my-bestiary-pack/encounter-forge-pack.json")).json();
  const imported = await ef.api.importCustomContent(pack);
  console.log(`Encounter Forge: imported ${imported} entries from My Bestiary Pack`);
}
```

Resolves to the number of entries imported (`0` if `payload` had none). Throws if the top level shape is invalid (missing/non-object `data`), so wrap calls in `try`/`catch`. This is the mechanism a companion module would use to ship a ready-made set of traits, actions, and spells that drop straight into the randomization pools on first load.

---

### Hooks

Encounter Forge fires three hooks during generation. Listen with `Hooks.on` or `Hooks.once`.

#### `encounterForge.generationStarted`

Fires once before any creatures are created. Use this to prepare external systems (loot tables, journals, etc.) before actors exist.

```js
Hooks.on("encounterForge.generationStarted", (data) => {
  // data.playerCount  {number}
  // data.playerLevel  {number}
  // data.enemyCount   {number}
  // data.difficulty   {string}
  // data.theme        {string}
  // data.targetCR     {number|string}  the flavor CR ("1/4", 5, etc.) for the per-creature envelope target
  // data.solo         {boolean}
  // data.calibrate    {boolean}
});
```

#### `encounterForge.creatureCreated`

Fires once per creature, immediately after its actor and all embedded items are written to Foundry. The actor is fully ready at this point.

```js
Hooks.on("encounterForge.creatureCreated", ({ actor, creatureData }) => {
  // actor           {Actor}   the created Foundry NPC actor
  //
  // creatureData fields:
  //   .name                 {string}
  //   .cr                   {number|string}
  //   .theme                {string}
  //   .chassisType          {string}   "brute"|"lurker"|"skirmisher"|"controller"|"artillery"|"leader"
  //   .profBonus            {number}
  //   .solo                 {boolean}
  //   .stats                {object}   { str, dex, con, int, wis, cha, hp, ac, size, speeds }
  //   .skills               {object}   e.g. { prc: 1, ste: 2 }  (value 1=prof, 2=expertise)
  //   .senses               {object}   { darkvision, blindsight, tremorsense, truesight }
  //   .traits               {Array}    trait objects drawn from the pool
  //   .actions              {Array}    action objects drawn from the pool
  //   .resistances          {string[]}
  //   .immunities           {string[]}
  //   .conditionImmunities  {string[]}
  //   .creatureType         {string}
  //   .spellInfo            {object|null}
});
```

#### `encounterForge.encounterComplete`

Fires once after all creatures in the batch have been created.

```js
Hooks.on("encounterForge.encounterComplete", (data) => {
  // data.actors        {Actor[]}      all successfully created actors
  // data.theme         {string}
  // data.targetCR      {number|string}
  // data.count         {number}       actual number created (may be less than requested on error)
  // data.solo          {boolean}
  // data.calibrate     {boolean}
  // data.results       {Array}        per-creature { name, img, cr, profile: { hp, ac, dpr } }
  // data.partyEstimate {object}        { dpr, hp } for the party (real actors if calibrated, else generic)
  // data.groupActual   {object}        { hp, ac, dpr } summed/averaged across the generated creatures
  // data.groupExpected {object}        { hp, ac, dpr } encounter envelope group-wide totals
  // data.rounds        {object}        { roundsToDefeat, roundsToThreaten }
  // data.outcome       {string}        "easy"|"manageable"|"risky"|"dangerous"
});
```

---

### Macro Example: Solo Boss Button

```js
// Runs from a Foundry macro. Prompts for theme then generates a boss.
const theme = await new Promise(resolve => {
  new Dialog({
    title: "Boss Theme",
    content: `<select id="t"><option value="any">Any</option>
      <option value="undead">Undead</option><option value="fiend">Fiend</option>
      <option value="dragon">Dragon</option><option value="aberration">Aberration</option></select>`,
    buttons: {
      go: { label: "Generate", callback: html => resolve(html.find("#t").val()) }
    }
  }).render(true);
});

await game.modules.get("encounter-forge").api.generate({
  playerCount: game.users.filter(u => u.active && !u.isGM).length || 4,
  playerLevel: 10,
  theme,
  solo: true,
  difficulty: "deadly"
});
```