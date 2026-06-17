# Encounter Forge Wiki

This wiki covers how to use the Encounter Forge dialog, how the balancing math works under the hood, what content goes into a generated creature, and how to integrate Encounter Forge with macros or other modules.

## Contents

- [Getting Started](#getting-started)
- [The Generator Dialog](#the-generator-dialog)
- [Calibrate to Party](#calibrate-to-party)
- [Solo Boss Mode](#solo-boss-mode)
- [The Results Dialog](#the-results-dialog)
- [How the Math Works](#how-the-math-works)
- [What's in a Generated Creature](#whats-in-a-generated-creature)
- [Custom Content](#custom-content)
- [Settings](#settings)
- [Combat Intensity Calibration](#combat-intensity-calibration)
- [API & Integration](#api--integration)
- [Hooks](#hooks)
- [Macro Examples](#macro-examples)

---

## Getting Started

Open the **Actors** sidebar tab as a GM. A **Generate** button (wizard hat icon) appears in the directory header. Click it to open the Encounter Forge dialog. Generated NPCs are written as full Foundry actors directly into your Actors root directory (or a folder you specify), ready to drag onto a scene.

---

## The Generator Dialog Window

The dialog window displays all the toggle points to generate the combat encounter.

**Left column:**

| Field | Description |
|---|---|
| **Players** | Number of player characters. Used for the generic party estimate. Disabled and auto filled if Calibrate to Party is active with actors selected. |
| **Level** | Average player level (1-20). Same auto fill behavior as Players. |
| **Enemies** | How many creatures to generate (1-10). Forced to 1 and disabled when Solo Boss is checked. |
| **Theme** | Creature type/flavor filter, see [Themes](#themes). |
| **Solo Boss** | Generates a single boosted creature instead of a group, see [Solo Boss Mode](#solo-boss-mode). |
| **Disposition** | Token disposition for the generated actor(s): Hostile, Neutral, Friendly, or Secret. |

**Right column:**

| Field | Description |
|---|---|
| **Difficulty** | Easy, Medium, Hard, or Deadly. Drives the encounter envelope, see [How the Math Works](#how-the-math-works). |
| **Calibrate to Party** | Toggles the actor picker below it, see [Calibrate to Party](#calibrate-to-party). |
| **Actor picker** | List of player-owned actors to use as the real party. Only visible (and only affects results) when Calibrate to Party is checked. |
| **Readout panel** | Live preview of Target CR, Enemy DPR/HP, Party DPR/HP, Rounds (defeat/threaten), and Outlook. Updates as you change any field. |
| **Cancel / Generate** | Cancel closes the dialog with no changes. Generate runs the full npc generation and opens the [Results Dialog](#the-results-dialog). |

The dialog remembers your last-used values per client (toggle this off in **Settings**), and a **Reset to Defaults** option is available in the module settings menu if you want to clear that memory.

### Themes

| Theme | Flavor |
|---|---|
| `beast` | Predatory animals, natural hunters |
| `undead` | Reanimated dead, wraiths, vampires |
| `aberration` | Alien intelligences, eldritch entities |
| `humanoid` | Bandits, soldiers, cultists, named NPCs |
| `elemental` | Fire, earth, water, air manifestations |
| `fey` | Fey creatures, tricksters, nature spirits |
| `fiend` | Demons, devils, infernal servants |
| `dragon` | True dragons and draconic creatures |
| `construct` | Golems, automatons, animated objects |
| `monstrosity` | Unnatural predators that don't fit other types |
| `any` | Wildcard, draws from untagged/`any` tagged content across all themes |

---

## Calibrate to Party

Every generation sizes the **whole encounter** to your party using an "encounter envelope" (see [How the Math Works](#how-the-math-works)). By default that envelope is built from a generic estimate based on **Players** and **Level**. **Calibrate to Party** changes where those numbers come from, it does not change the math itself.

When you check **Calibrate to Party**, an actor picker appears showing every player owned actor (portrait, name, owning player). Check the actors who are actually in the fight:

- The party's `dpr` and `hp` are computed from those actors' real stats (HP, AC, saves, level).
- **Players** and **Level** are auto-derived from the selection and disabled in the form (with a tooltip explaining why).
- If you uncheck Calibrate, or leave the actor list empty, the envelope falls back to the generic Players/Level estimate.

---

## Solo Boss Mode

Checking **Solo Boss** forces **Enemies** to 1 and generates a single creature designed to take on the whole party alone:

- Per-creature **HP target x1.5** and **DPR target x1.3** (applied to the envelope target before the calibration pass).
- **AC +2** on top of the normal AC nudge.
- **3 guaranteed actions** (instead of 1-3 based on tier).
- A **legendary trait draw**: one guaranteed `action`-type legendary trait, plus one more from any other legendary category (lair, resistance, passive), subject to CR/theme filtering. If nothing clears the filter, no legendary resources are added.
- Legendary resources (3/3 legendary action counter, lair actions, legendary resistance counter) only appear on the sheet if a trait that needs them was actually drawn.

Solo's damage tuning is solved holistically: the per-action DPR and the legendary actions' "extra swings" (which scale off per-action DPR) are balanced together so the *combined* output lands on the boosted target rather than the legendary bonus stacking on top of an already-boosted action DPR.

---

## The Results Dialog

After generation, a results window lists each created creature (portrait, name, CR, rolled HP, AC, DPR), plus:

- **Group Actual** - combined HP/AC/DPR across all generated creatures.
- **Group Expected** - the envelope's group-wide HP/DPR targets (what the math asked for).
- **Rounds (defeat/threaten)** and **Outlook**. The same metrics as the pre-generation readout, now computed from the creatures' actual rolled stats.

This lets you sanity-check that the generated group actually matches the difficulty you asked for. **Close** obviously closes the dialog, the actors should already be in the actor list.

---

## How the Math Works

Encounter Forge separates **flavor** (what the creature is) from **balance** (how tough it is). CR only controls flavor. Balance comes entirely from the encounter envelope and the calibration pass described below.

### 1. Party estimate

A party estimate is `{ dpr, hp }`:

- **Generic** (`estimatePartyGeneric`): derived from `playerCount` and `playerLevel` using per-class DPR curves and a flat HP-per-level model, averaged across the party.
- **Calibrated** (`estimatePartyFromActors`): derived from the real HP, AC, saves, and level of the selected actors via `derivePartyFromActors`.

### 2. The encounter envelope

`computeEncounterEnvelope(partyEstimate, difficulty, enemyCount, isSolo, intensityOffset)` sizes the **whole** encounter first, then splits it.

Each difficulty maps to a target round count:

| Difficulty | Rounds to Defeat | Rounds to Threaten | Outlook |
|---|---|---|---|
| Easy | 2 | 6 | Easy |
| Medium | 3 | 5.4 | Manageable |
| Hard | 4 | 4.4 | Risky |
| Deadly | 5 | 3.5 | Dangerous |

The `roundsToThreaten` values above are **baseline defaults**. When `intensityOffset` is non-zero, they are scaled before the envelope is computed, see [Combat Intensity Calibration](#combat-intensity-calibration) below.

```
groupHP  = party.dpr * roundsToDefeat
groupDPR = (party.hp / roundsToThreaten) * economyFactor
```

- `roundsToDefeat` = how many rounds the party should need to whittle the enemy group's total HP to zero, given the party's DPR. This sets `groupHP`.
- `roundsToThreaten` = how many rounds the enemy group should need to deal the party's total HP in damage. This sets `groupDPR`.
- `economyFactor = min(1 + 0.04 * (enemyCount - 1), 1.2)` - a small bump to `groupDPR` (not `groupHP`) reflecting that more attackers land slightly more total damage per round. Because the envelope is derived directly from the difficulty's target ratios, the **Outlook stays the same regardless of enemy count** - more enemies redistribute the same total threat rather than adding a new full-strength threat on top.

Both totals are divided by `enemyCount` to get **per-creature** `perEnemyHP` / `perEnemyDPR` targets.

For **Solo Boss** (`isSolo = true`, `enemyCount` forced to 1), the single creature's per-creature targets are further multiplied: `HP x1.5`, `DPR x1.3`.

### 3. Picking a flavor CR

`nearestCRForStats(perEnemyHP, perEnemyDPR)` matches the per-creature target against a CR baseline table (`cr-baseline.json`) and returns the closest CR. This CR is used **only** to pick:

- the chassis stat tier (base ability scores, AC/save-DC baseline),
- how many traits/actions are drawn and their power level,
- which spell tier is available.

It does **not** set the creature's final HP or DPR, those come from the envelope target via the calibration pass below.

### 4. CR Tiers

CR is bucketed into 6 tiers, which gate content availability and scaling:

| Tier | CR Range | Prof Bonus |
|---|---|---|
| 1 | 0 - 1 | +2 |
| 2 | 2 - 4 | +2 |
| 3 | 5 - 7 | +3 |
| 4 | 8 - 10 | +3 / +4 |
| 5 | 11 - 13 | +4 / +5 |
| 6 | 14 - 15 | +5 |

Tier affects: action damage scaling (`damage_tiers.tier1`-`tier6`), number of traits drawn, action count, skill expertise eligibility, size growth, and sense range scaling. The trait-draw CR-adjustment budget is 1 at tier 1-2, 2 at tier 3-4, 3 at tier 5-6.

### 5. Calibration pass

Once the creature's chassis/traits/actions/spells are assembled at its flavor CR, every creature is tuned to hit its **per-creature envelope target** (`perEnemyHP` / `perEnemyDPR`, x1.5/x1.3 for Solo) before the actor is written:

- **HP** is set directly to the target (rounded, minimum 1), via direct assignment, no formula-based estimate.
- **AC** is nudged by at most +/-2: +/-1 if the HP target deviates from the chassis baseline by more than 30%, and another +/-1 if the DPR target deviates from the chassis baseline by more than 15%.
- **Damage** is tuned in two passes:
  1. **Action swap** - if the DPR target deviates from the chassis baseline by more than 15%, one action may be swapped for a same-tier, theme/chassis-compatible alternative from the action pool whose DPR is closest to the target (`targetActionTotal`).
  2. **Flat damage bonus** - whatever DPR gap remains is closed by spreading a flat bonus or penalty across the creature's actions (`applyFlatDamageBonus` / `addFlatModifier`), since the action pool's dice tiers alone usually can't hit arbitrary envelope targets.

For **Solo** creatures, step 2 solves for the action-DPR target such that the boosted per-action damage **and** the legendary actions' extra "swings" (which scale off per-action DPR) land on the overall Solo target *together* rather than the legendary bonus compounding on top of an already-1.3x-boosted action DPR.

The result: the pre-generation readout (computed from the envelope) and the post-generation results (computed from the actual creature) should track closely across any combination of party size, level, enemy count, and Solo/non-Solo.

---

## What's in a Generated Creature

### Chassis archetypes

The chassis is the creature's combat role. It determines the base stat spread, size progression, action/spell affinities, and guaranteed skills.

| Chassis | Role | Guaranteed Skills |
|---|---|---|
| `brute` | High HP, high damage melee. Grows large quickly. | Athletics |
| `lurker` | Stealthy striker, high Dex. Stays medium-sized. | Stealth, Perception |
| `skirmisher` | Mobile melee, balanced offense. Medium to large. | Acrobatics, Athletics |
| `controller` | Debuffs and area denial. Always a spellcaster. | Arcana, Insight |
| `artillery` | Ranged damage dealer. 50% chance to cast spells. | Arcana, Investigation |
| `leader` | Buffs allies, social skills. Always a spellcaster. | Persuasion, Insight, Intimidation |

### Traits

Each creature draws 1-4 general traits (more at higher tiers, subject to the CR-adjustment budget described above), filtered by CR and theme, from six categories: **Defensive**, **Offensive**, **Passive**, **Movement**, **Senses**, and **Reactions**. The full trait pool spans dozens of named effects, resistances and immunities, on-hit conditions, auras, regeneration, teleportation, special senses, and combat reactions like Parry, Riposte, and Uncanny Dodge. See `ENCOUNTER_FORGE_REFERENCE.md` for the complete tables.

Trait descriptions support two placeholders:
- `{dc}` -> `8 + proficiency bonus + highest mental stat modifier`
- `{prof}` -> the creature's proficiency bonus

### Actions

Each creature gets 1-3 actions based on tier (always 3 for Solo Bosses), drawn from **Melee**, **Ranged**, and **Special** pools, filtered by CR, chassis affinity, and theme. When a creature has more than one action, a **Multiattack** item is generated describing how they're used together. Damage scales automatically with tier via each action's `damage_tiers.tier1`-`tier6`, then is further adjusted by the calibration pass above.

### Legendary traits

Drawn for non-Solo tier-5+ creatures (one trait) and Solo Bosses (one guaranteed `action`-type plus one from any other category), filtered by CR (`cr_min: 5`+) and theme. Categories: `action` (legendary actions, 1-2 charges each), `lair` (initiative-20 lair actions), `resistance` (Legendary Resistance, sets the `legres` counter), and `passive` (e.g. regeneration, breath-weapon recharge).

### Spells

Spellcasting is available to `controller` and `leader` chassis (always) and `artillery` (50% chance). Spell counts scale with tier:

| Tier | Cantrips (at-will) | Leveled Spells (1/day each) |
|---|---|---|
| 1-2 | 2 | 1 |
| 3-4 | 2 | 2 |
| 5-6 | 2 | 3 |

The casting stat is the creature's highest mental ability score (INT/WIS/CHA); spell DC and attack bonus derive from that plus proficiency bonus. The pool covers 160 spells across 8 schools (18 cantrips, 142 leveled). Spells are imported from the active Foundry compendium by name; if a spell isn't found, a synthetic item is built from its `fallback` definition.

### Adding your own content

The easiest way to add your own traits, actions, and spells is the **Custom Content** export workflow described in the next section and entries can be enabled/disabled, ReSynced, or removed from the **Custom Content** manager at any time.

For bulk content, or content that doesn't map cleanly to a single Foundry item (e.g. a trait with no source item), you can still edit the JSON files under `data/en/` directly:

- IDs must be unique within their file.
- `tags` use the theme values above; `"any"` or an empty array means broadly applicable.
- `cr_adjustment` spends from the trait-draw budget (1 at tier 1-2, 2 at tier 3-4, 3 at tier 5-6), higher-power traits should cost more.
- Descriptions must be self-contained, using `{dc}`/`{prof}` placeholders for save DCs and proficiency bonus.
- Actions additionally require `action_type`, `damage_tiers` (tier1-tier6), `chassis_affinity`, and `cr_min`.
- Legendary traits additionally require `legendary_type` (and `legendary_cost` for `action` type).
- Spells require `name` (must match the compendium entry exactly), `cantrip`, `school`, `tier_min`, `tags`, and `fallback`.

---

## Custom Content

Custom Content lets you pull your own homebrew feats, weapons, and spells into Encounter Forge's randomization pools directly from their item sheets, no JSON editing required. Exported entries are stored per-world and are drawn from alongside the built-in content pools, subject to the same CR/theme/chassis filtering as everything else.

### Exporting an item

Open the sheet for a **Feat**, **Weapon**, or **Spell** item as a GM. A small export icon (a file with an outward arrow) appears in the sheet's window header next to the uuid, close, etc buttons. Clicking it opens the **Export Custom Content** dialog, pre-filled from the item's current data.

The dialog is split into two columns: general/flavor fields on the left, and CR/mechanical fields on the right. Every field that affects the generator's filtering or balancing math has a small (i) icon next to its label. Hover it for an explanation of what that field controls.

**General fields (left column):**

| Field | Description |
|---|---|
| **Source Item** | Read-only. The item this entry was exported from (shown if it can still be found). |
| **Name** | Display name for this entry. Defaults to the item's name. |
| **Type** | `Trait` or `Action`. Determines which pool this entry is drawn from. Not shown for spells, spells always go to the spell pool. |
| **Category** | For traits: Defensive, Offensive, Movement, Senses, Passive, Reactions, or Legendary. For actions: Melee, Ranged, or Special. Groups the entry so it's matched to creatures that need that kind of trait/action. Switching **Type** swaps which category list is shown. |
| **Description** | The text that appears on the generated item. Supports the same `{dc}`/`{prof}` placeholders as built-in content. Defaults to the source item's description. ReSync will not overwrite a description you've customized. |
| **Theme Tags** | Restricts this entry to creatures matching one of these themes. Leave everything unchecked, or only check **Any/Unknown**, to allow it for any creature. |

**CR/mechanical fields (right column), shown for traits and actions:**

| Field | Description |
|---|---|
| **Min CR / Max CR** | Limits which creature challenge ratings can roll this entry. Leave blank for no limit. |

**Trait-only fields** (shown when Type is Trait):

| Field | Description |
|---|---|
| **CR Adjustment** | Added to a creature's effective CR when this trait is chosen, spends from the trait-draw budget (see [CR Tiers](#how-the-math-works)). Higher-power traits should cost more. |
| **Legendary Type** *(Legendary category only)* | None, Legendary Action, Lair Action, or Legendary Resistance. Used when generating Solo Boss creatures. |
| **Legendary Action Cost** *(Legendary Action only)* | How many legendary action points this trait costs to use. |
| **Uses Per Day** *(Legendary Resistance only)* | How many times per day this resistance can be used. |

**Action-only fields** (shown when Type is Action):

| Field | Description |
|---|---|
| **Action Type** | How this action resolves: Melee/Ranged Weapon Attack, Melee/Ranged Spell Attack, Saving Throw, or Utility (No Damage). Used to estimate DPR. |
| **Range (ft.)** | Maximum range, used to decide whether ranged creatures can be given this action. |
| **Damage Formula / Damage Type** | The dice formula (e.g. `2d6`) and damage type used for DPR estimation. Leave the formula blank and the type as **None (no damage)** for utility actions that don't deal damage. |
| **Chassis Affinity** | Limits this action to creatures built on the checked chassis types (Brute, Lurker, Skirmisher, Controller, Artillery, Leader). Leave **Any** checked to allow all chassis. |

**Spell-only fields** (shown when the item is a spell):

| Field | Description |
|---|---|
| **School** | The spell's school of magic (from dnd5e's own list), shown for reference and used when filtering spells. |
| **Cantrip** | Marks this as a cantrip, usable at will without a spell slot. Pre-filled from the item's level. |
| **Min Spell Tier / Max Spell Tier** | Limits which spell slot tiers can roll this spell. |
| **Damage Formula / Damage Type** | Same as for actions, leave blank/None for spells that don't deal damage (buffs, utility, control). |

Click **Export** to add the entry to your pools. A success notification confirms the export, and the entry immediately becomes available to the generator (subject to its **CR/theme/chassis** filters).

### ReSync

If you edit the original item later, tweak its description, damage, range, school, and so on, reopen the export dialog (from the item sheet's export button, or via **ReSync** in the Custom Content manager) and click **ReSync**.

ReSync refreshes the underlying copy of the item that gets placed on generated creatures, so the generated version picks up your latest description and mechanical changes to the source item. It does **not** discard the pool configuration choices you already made in this dialog, CR range, theme tags, category, chassis affinity, legendary settings, and your custom description (if you wrote one) are kept as-is unless you edit them again before clicking ReSync. If you want a field to pick up the source item's current value, clear it (or for Description, replace it) before ReSyncing.

If the source item can no longer be found (deleted, or imported from another world, see [Sharing custom content](#sharing-custom-content-importexport) below), a warning banner appears at the top of the dialog. You can still edit and save the entry, but ReSync won't have a live item to pull mechanical updates from.

ReSync links an entry to one specific item document by its Foundry UUID, captured at the moment you export it, not by name or the item content. If you export "the same" item from multiple places (copies embedded on different actors or duplicated items), each export creates its own independent entry tied to its own copy; ReSyncing one never affects the others, and there's no deduplication. 
If that specific document is later deleted or moved, the entry's Source Item shows as missing even if an identical looking item still exists elsewhere under a different UUID. There's no name-based fallback to relink it. In that case, re-export from a current item to get a fresh entry with live ReSync.

### The Custom Content manager

Open it from the **list icon** button in the Actors sidebar header (next to **Generate**), or via **Configure Settings -> Module Settings -> GM Tools: Encounter Forge -> Custom Content**.

The manager lists every exported entry, grouped into **Traits**, **Actions**, and **Spells**, each showing its name, category (or Spell/Cantrip), and source item name. Per entry:

- **Checkbox** - enable/disable the entry without deleting it. Disabled entries are skipped by the generator but keep their settings.
- **ReSync** - opens the export dialog for that entry, pre-filled with its saved settings (see [ReSync](#resync) above).
- **Trash icon** - permanently deletes the entry, after a confirmation prompt.

### Sharing custom content (import/export)

At the bottom of the Custom Content manager, two buttons let you move your whole custom content pool between worlds:

- **Export** - downloads a JSON file containing every custom trait, action, and spell entry in this world (including the full item data needed to place them on generated creatures).
- **Import** - pick a previously exported JSON file. Its entries are **added** to this world's pool alongside whatever's already there. Nothing existing is overwritten or removed, and imported entries get fresh IDs so they can't collide with your existing entries.

Imported entries work immediately for generation, since they carry their own copy of the source item's data. Their **Source Item** will show as missing (the original item lives in the other world), so **ReSync** won't have anything to pull from until you re-export from an item in *this* world, but enabling/disabling, editing, and deleting all work normally.

This is the easiest way to share homebrew trait/action/spell packs with other GMs, or to carry your customizations from a test world into your live campaign world.

---

## Settings

Found under **Configure Settings -> Module Settings -> GM Tools: Encounter Forge**:

| Setting | Scope | Description |
|---|---|---|
| **Default Folder** | World | Actor folder generated NPCs are placed in by default (created if it doesn't exist). Can be overridden per-call via the `folder` API option. |
| **Remember Last Used** | Client | When enabled, the dialog pre-fills with your last-used values (Players, Level, Enemies, Difficulty, Theme, Solo, Disposition, Calibrate, selected actors). |
| **Reset to Defaults** | Client (menu) | Clears your saved "last used values" after a confirmation prompt. |
| **Custom Content** | World (menu) | Opens the [Custom Content manager](#the-custom-content-manager), enable/disable, ReSync, delete, export, or import custom traits, actions, and spells. |
| **Combat Intensity Calibration** | World (menu) | Opens the [Combat Intensity Calibration](#combat-intensity-calibration) dialog. Adjusts how aggressively enemies are sized for all difficulty levels. Restricted to GMs. |

---

## Combat Intensity Calibration

Found under **Configure Settings -> Module Settings -> GM Tools: Encounter Forge -> Combat Intensity Calibration** (GMs only).

This setting lets you shift how aggressively enemies are sized across all difficulty levels, without changing the difficulty labels or the underlying math structure. It is intended for playtesting: leave it at 0 unless your table's fights consistently feel off in one direction.

### What it changes

The calibration offset is an integer from -3 to +3. It scales the `roundsToThreaten` target for every difficulty level by a factor of `1 / (1 + offset * 0.12)`:

- **Positive offset (harder):** the denominator grows, so `roundsToThreaten` shrinks. Enemies are built to drain the party's HP faster. Fights are more attritional.
- **Negative offset (easier):** `roundsToThreaten` grows. Enemies hit softer, fights resolve with fewer casualties.
- **Zero (default):** the baseline targets in the table above are used as-is.

`roundsToDefeat` (the green bars in the preview) is never affected, only how hard the enemy hits back changes.

The step labels in the dialog describe each level:

| Step | Label |
|---|---|
| -3 | Forgiving - fights resolve quickly, low casualty risk |
| -2 | Easier - enemies are softer and less threatening |
| -1 | Slightly easier than default |
| 0 | Standard (default) |
| +1 | Slightly harder than default |
| +2 | Harder - enemies hit harder and last longer |
| +3 | Brutal - extended attrition; death is a real possibility |

### The live preview

The dialog shows a real-time bar chart for all four difficulties using a fixed illustrative party (4 players, level 5, one enemy). Two bars are shown per difficulty:

- **Green bar** - rounds to defeat the enemy group (party DPR vs. enemy HP). Constant regardless of offset.
- **Red bar** - rounds to exhaust the party's HP (enemy DPR vs. party HP). This is what the offset changes: a larger positive offset makes this bar shorter.

The preview uses a fixed party so the chart is comparable across tables and shareable between GMs. It is illustrative, not a simulation of your specific party.

### Save behavior

Changes are live/saved the moment you click a pip or the +/- stepper. No Save button is needed. The setting takes effect immediately for any encounter generated after that point. Closing the dialog does not discard changes.

The **Reset to Default** button (bottom-left, visible only when the current value is not 0) immediately sets the offset back to 0.

---

## API & Integration

Everything below is available after Foundry's `ready` hook fires:

```js
const forge = game.modules.get("encounter-forge").api;
```

### `api.generate(options)` -> `Promise<Actor[]>`

Generates one or more NPC actors and returns them. All options are optional.

```js
const actors = await forge.generate({
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
  folder:        "",     // actor folder name; overrides Default Folder setting
  calibrate:     false,  // tune toward partyActorIds (or generic party if none given)
  partyActorIds: []      // actor IDs of the real party, used when calibrate is true
});
```

**Options reference:**

| Option | Type | Default | Description |
|---|---|---|---|
| `playerCount` | number | `4` | Number of players. Clamped 1-8. |
| `playerLevel` | number | `1` | Average player level. Clamped 1-20. |
| `enemyCount` | number | `1` | Number of creatures to generate. Clamped 1-10. Ignored (forced to 1) if `solo` is true. |
| `difficulty` | string | `"medium"` | `"easy"`, `"medium"`, `"hard"`, or `"deadly"`. |
| `theme` | string | `"any"` | Creature type filter - see [Themes](#themes). |
| `solo` | boolean | `false` | Generates exactly one creature with the [Solo Boss](#solo-boss-mode) boosts. |
| `name` | string | `""` | Override the generated name. Empty = auto-generated. |
| `img` | string | `""` | Override the portrait image path. Empty = theme-matched portrait. |
| `tokenImg` | string | `""` | Override the token image path. Empty = matches portrait. |
| `disposition` | number | `-1` | Token disposition: `-1` Hostile, `0` Neutral, `1` Friendly, `-2` Secret. |
| `folder` | string | `""` | Actor folder name. Overrides the Default Folder setting; created if missing. |
| `calibrate` | boolean | `false` | Derives party DPR/HP from `partyActorIds` instead of `playerCount`/`playerLevel` estimates. The envelope and calibration pass always run regardless. |
| `partyActorIds` | string[] | `[]` | Actor IDs of the real party, used when `calibrate` is true. |

**Return value:** an `Actor[]` with extra properties attached:

| Property | Type | Description |
|---|---|---|
| `results` | Array | Per-creature `{ name, img, cr, profile: { hp, ac, dpr } }`. |
| `partyEstimate` | object | `{ dpr, hp }` for the party (real actors if calibrated, else generic). |
| `groupActual` | object | `{ hp, ac, dpr }` summed/averaged across the generated creatures. |
| `groupExpected` | object | `{ hp, ac, dpr }` - the envelope's group-wide totals (`ac` is reused from `groupActual`). |
| `rounds` | object | `{ roundsToDefeat, roundsToThreaten }`. |
| `outcome` | string | `"easy"` \| `"manageable"` \| `"risky"` \| `"dangerous"`. |
| `targetCR` | number/string | The flavor CR nearest the per-creature envelope target. |

The array is empty if generation failed for every creature.

```js
// Quick, one medium-difficulty creature, any theme
const [actor] = await forge.generate();

// A solo undead boss for a level-8 party of 5
await forge.generate({ playerCount: 5, playerLevel: 8, theme: "undead", solo: true });

// Three fiends for a deadly encounter, with a fixed name
await forge.generate({
  playerCount: 4,
  playerLevel: 10,
  enemyCount:  3,
  difficulty:  "deadly",
  theme:       "fiend",
  name:        "Infernal Warden"
});
```

### `api.openDialog()`

Opens the Encounter Forge dialog - the same one the Actors-directory button triggers.

```js
forge.openDialog();
```

### `api.openDialogFor(overrides)` -> `Promise<Actor[] | null>`

Opens the same dialog, pre-configured for a single-NPC use case (e.g. "generate a stat block for this lore entry"), and resolves with the `generate()` result once the GM clicks **Generate** or `null` if they close the dialog without generating. Pass `null`/omit for the same behavior as `openDialog()`.

```js
const actors = await forge.openDialogFor({
  name:           "Bandit Captain Vex",
  img:            "modules/lore-reference-board/art/bandit-captain-vex.webp",
  tokenImg:       "modules/lore-reference-board/tokens/bandit-captain-vex.webp",
  lockEnemyCount: true,
  enemyCount:     1
});
```

**Override fields** (all optional):

| Field | Type | Description |
|---|---|---|
| `name` | string | Pre-fills an editable **Name** field at the top of the dialog. |
| `img` | string | Actor portrait path, applied silently at generate-time (no field shown). |
| `tokenImg` | string | Token image path, applied silently at generate-time (no field shown). |
| `lockEnemyCount` | boolean | Disables the **Enemies** field. |
| `enemyCount` | number | 1-10. Value the **Enemies** field is locked to when `lockEnemyCount` is true. |

If `lockEnemyCount` is true and `enemyCount > 1`, the **Solo Boss** toggle is hidden (Solo always forces a single enemy, conflicting with a >1 lock). With `enemyCount === 1`, Solo remains available. When any overrides are passed, the dialog does **not** read or write the GM's saved "last used values." It's a one-off for the calling module.

### `api.exportCustomContent()` -> `object`

Returns this world's entire custom content pool as a plain object, the same payload the [Custom Content manager's Export button](#sharing-custom-content-importexport) downloads as JSON:

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

This is synchronous and read-only, useful if another module wants to inspect, back up, or re-export the current world's custom content pool programmatically.

### `api.importCustomContent(payload)` -> `Promise<number>`

Merges a content pack into this world's custom content pools, exactly like using the **Import** button in the Custom Content manager. `payload` is an object in the same shape as `exportCustomContent()` returns (or the JSON file it downloads). Entries are deep-cloned and given fresh IDs before being appended, so importing never overwrites or removes existing entries.

```js
const ef = game.modules.get("encounter-forge");
if (ef?.active && ef.api) {
  const pack = await (await fetch("modules/my-bestiary-pack/encounter-forge-pack.json")).json();
  const imported = await ef.api.importCustomContent(pack);
  console.log(`Encounter Forge: imported ${imported} entries from My Bestiary Pack`);
}
```

Resolves to the number of entries imported (`0` if `payload` had none, or if it isn't a valid Encounter Forge content pack; in which case it also throws if the top-level shape is wrong, so wrap calls in `try`/`catch`). This is the hook a companion module would use to ship a ready-made set of traits, actions, and spells that drop straight into the randomization pools on first load, see [Custom Content](#custom-content) for what an entry looks like and how it's used.

---

## Hooks

### `encounterForge.generationStarted`

Fires once before any creatures are created.

```js
Hooks.on("encounterForge.generationStarted", (data) => {
  // data.playerCount  {number}
  // data.playerLevel  {number}
  // data.enemyCount   {number}
  // data.difficulty   {string}
  // data.theme        {string}
  // data.targetCR     {number|string}
  // data.solo         {boolean}
  // data.calibrate    {boolean}
});
```

### `encounterForge.creatureCreated`

Fires once per creature, immediately after its actor and items are written.

```js
Hooks.on("encounterForge.creatureCreated", ({ actor, creatureData }) => {
  // actor: the created Foundry NPC Actor
  // creatureData:
  //   name, cr, theme, chassisType, profBonus, solo
  //   stats   { str, dex, con, int, wis, cha, hp, ac, size, speeds }
  //   skills  { prc: 1, ste: 2, ... }   // 1 = proficient, 2 = expertise
  //   senses  { darkvision, blindsight, tremorsense, truesight }
  //   traits, actions   (Array of pool objects)
  //   resistances, immunities, conditionImmunities  (string[])
  //   creatureType, spellInfo
});
```

### `encounterForge.encounterComplete`

Fires once after the whole batch is created.

```js
Hooks.on("encounterForge.encounterComplete", (data) => {
  // data.actors, data.theme, data.targetCR, data.count, data.solo, data.calibrate
  // data.results, data.partyEstimate, data.groupActual, data.groupExpected
  // data.rounds, data.outcome
});
```

---

## Macro Examples

### Solo Boss button

```js
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

### Generate-and-react with hooks

```js
Hooks.once("encounterForge.encounterComplete", (data) => {
  ui.notifications.info(
    `Generated ${data.count} ${data.theme} creature(s) - outlook: ${data.outcome}`
  );
});

await game.modules.get("encounter-forge").api.generate({
  playerCount: 4, playerLevel: 6, enemyCount: 4, difficulty: "medium", theme: "beast"
});
```
