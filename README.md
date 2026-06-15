# GM Tools: Encounter Forge

**Encounter Forge** is a Foundry VTT (v12) module for D&D 5e that builds brand-new, balanced NPCs on demand - sized to *your* party, not a generic XP table.

Instead of pulling a stat block from a compendium and hoping the CR math works out, Encounter Forge assembles a creature from a chassis, traits, actions, and (optionally) spells, then tunes its HP, AC, and damage so the resulting encounter actually lands at the difficulty you asked for.

> **Status:** Actively developed. Foundry v12, dnd5e system 3.0+ (verified on 3.3.1 & 4.4.4).

---

## Why Encounter Forge is different

Most CR generators (and most homebrew stat blocks) work backwards from the Dungeon Master's Guide CR/XP tables: pick a CR, look up its "expected" HP and damage, and build (or pull) a creature around those numbers. The problem is that those tables assume a "standard" party, and most parties aren't standard. A CR 5 monster can be a joke or a TPK depending on who's sitting at the table.

Encounter Forge flips that process around:

1. It estimates **your party's** actual damage output and durability, either generically from player count/level, or (with **Calibrate to Party**) from the real PCs' HP, AC, saves, and levels.
2. It uses your chosen **difficulty** (Easy/Medium/Hard/Deadly) to compute an **encounter envelope**, the total HP and DPR (Damage Per Round) the enemy side needs, as a whole, to make that fight play out the way that difficulty implies.
3. It splits that envelope across however many enemies you asked for (or amplifies it for a Solo Boss).
4. *Then* it picks a CR, but only to decide what kind of creature this is (its chassis, traits, actions, spell tier, AC baseline). The CR does **not** set the creature's final HP or damage.
5. Finally, it tunes the assembled creature's HP, AC, and damage output to hit its slice of the envelope exactly, so the finished NPC actually performs the way the difficulty setting promised (give or take).

In short: a "Hard" fight with two generated enemies and a "Hard" fight with four generated enemies should both *feel* like a Hard fight for your specific table, just split up differently. That's not something CR-table-driven generators do well enough, because they're matching a number on a chart, not your party, and not by output.

---

## Not an AI generator - and works fully offline

Encounter Forge contains **no AI, no language model, and no network calls of any kind.** Every creature is assembled procedurally from local JSON content pools (chassis archetypes, traits, actions, spells, names) using deterministic math you can read in plain JavaScript. There's nothing to configure, no API key, no tokens, no internet connection required (other than being online to play obviously), and no data ever leaves your machine. Generation is instant and fully reproducible from the same inputs (though actions, traits, etc are randomizes via the pool of said items, so that differs or fights would be boring).

---

## Features

- **Procedural creature assembly** - chassis (combat role), traits (defensive/offensive/passive/movement/senses/reactions/legendary), actions (melee/ranged/special), and spells are drawn from filterable (through code) content pools based on theme, CR tier, and chassis.
- **Encounter envelope balancing** - the whole encounter is sized to the party and difficulty first, then split across enemies. See [The Math](#the-math) below.
- **Calibrate to Party** - pull real HP/AC/saves/level from your players' actors instead of using generic class-average estimates.
- **Solo Boss mode** - a single creature gets HP x1.5, DPR x1.3, AC +2, three guaranteed actions, and a draw from the legendary trait pool (legendary actions, lair actions, legendary resistance) so it can stand up to a full party alone.
- **Live pre-generation readout** - as you adjust player count, level, enemy count, and difficulty, the dialog shows the target CR, projected enemy/party DPR and HP, rounds-to-defeat/threaten, and a color-coded outlook (Easy/Manageable/Risky/Dangerous) - *before* you generate anything.
- **Post-generation results summary** - after generation, see each creature's actual rolled HP/AC/DPR and CR, plus the group's combined stats versus the party and the same outlook label, now based on real numbers.
- **10 themes / creature types** - beast, undead, aberration, humanoid, elemental, fey, fiend, dragon, construct, monstrosity, or "any".
- **6 chassis archetypes** - brute, lurker, skirmisher, controller, artillery, leader; each with its own stat spread, size progression, guaranteed skills, and action/spell affinities.
- **Full Foundry actor output** - generated NPCs are written as real dnd5e actors with stats, skills, senses, resistances/immunities, items (traits, actions, multiattack, spells), and legendary resources fully configured and ready to drop on a scene.
- **Disposition, folder, and naming controls** - set token disposition, target an actor folder, and override the generated name/portrait/token image.
- **Public API + Hooks** - generate creatures from macros or other modules, open a pre-configured dialog for "generate me an NPC for this" workflows, and listen for generation lifecycle hooks. See the [Wiki](docs/WIKI.md) for full API docs and code samples.
- **Remember last used** - the dialog remembers your last settings (per-client), with a one-click reset from module settings.
- **Custom content** - export any feat, weapon, or spell from its item sheet into the trait/action/spell randomization pools, with a 2-column dialog covering CR range, theme tags, chassis affinity, damage, and (for spells) school and tier. **ReSync** re-pulls the latest stats and description from the original item with one click. A **Custom Content** manager (Actors sidebar or module settings) lets you enable/disable, ReSync, or delete entries, and **export/import** your whole custom content pool as a JSON file to share homebrew between worlds. See the [Wiki](docs/WIKI.md) for the full walkthrough.

---

## The Math

This section is a summary, see the [Wiki](docs/WIKI.md) for the full breakdown with worked examples.

### 1. Party estimate

A party estimate is `{ dpr, hp }`:

- **Generic:** derived from player count and average level using per-class DPR curves and a flat HP-per-level model.
- **Calibrated:** derived from the actual selected player actors' HP/AC/saves/levels.

### 2. The encounter envelope

Each difficulty maps to a target "rounds to defeat the enemy" and "rounds the enemy needs to threaten the party":

| Difficulty | Rounds to Defeat | Rounds to Threaten | Outlook    |
|------------|-------------------|----------------------|------------|
| Easy       | 2                 | 6                    | Easy       |
| Medium     | 3                 | 5.4                  | Manageable |
| Hard       | 4                 | 4.4                  | Risky      |
| Deadly     | 5                 | 3.5                  | Dangerous  |

```
groupHP  = party.dpr * roundsToDefeat
groupDPR = (party.hp / roundsToThreaten) * economyFactor
```

`economyFactor` is a small multiplier (`1 + 0.04 * (enemyCount - 1)`, capped at `1.2`) that accounts for more attackers contributing slightly more total damage per round. Both totals are then divided by the enemy count to get each creature's HP/DPR target. **Solo Boss** further multiplies its single creature's targets by HP x1.5 / DPR x1.3.

### 3. Picking a flavor CR

The per-creature HP/DPR target is matched against a CR baseline table to find the closest CR. That CR drives **only** the chassis stat tier, trait/action/spell availability, and AC/save-DC baseline, it is not the creature's final HP or DPR.

### 4. Calibration pass

Every generated creature is then tuned to hit its envelope target exactly:

- **HP** is set directly to the target.
- **AC** is nudged by up to +/-2 based on how far the HP/DPR targets deviate from the chassis baseline.
- **Damage** is tuned in two passes: first an action may be swapped for a same-tier alternative closer to the target DPR, then any remaining gap is closed with a flat damage bonus/penalty spread across the creature's actions. It's solved so that, for Solo creatures, legendary "extra swings" land on target *together* with the base action damage rather than stacking on top of it.

The result: the pre-generation readout and the post-generation results should track closely, regardless of party size, level, enemy count, or Solo Boss status.

---

## Installation

1. In Foundry's **Add-on Modules** tab, click **Install Module**.
2. Paste the manifest URL:

   ```
   (Not Officially Released Yet)
   ```

3. Enable **GM Tools: Encounter Forge** in your world's module list.

Or find it on the Foundry package list: `(Not Officially Released Yet)`

---

## Quick Start

1. Open your **Actors** sidebar tab, you'll see a new **Generate** button (wizard hat icon) in the header.
2. Set your party size/level (or enable **Calibrate to Party** and pick actors), pick a difficulty, theme, and number of enemies.
3. Watch the live readout to see the projected outlook before you commit.
4. Click **Generate**. New NPC actor(s) appear in your Actors directory, ready to drag onto a scene. Dumped into the root, or into a specific folder if you set on in the module settings.
5. Review the results summary to see how the actual creature(s) compare to the initial projection.

---

## Custom Content

Add your own homebrew feats, weapons, and spells to the randomization pools without editing JSON:

1. Open a feat, weapon, or spell item's sheet and click the export icon (file with an arrow icon) in the window header (nex to the uuid, close, etc buttons).
2. Fill in the export dialog information: category/type, CR range or spell tier, theme tags, chassis affinity, damage, etc. Hover the info icons next to each field for an explanation of what it affects.
3. Click **Export**. The item is now part of your randomization pools.
4. Edit the original item any time from the **Custom Content** manager, then use **ReSync** (from the same export dialog, or the Custom Content manager) to pull its latest description and stats into the entry.
5. Open the **Custom Content** manager from the Actors sidebar (list icon) or **Module Settings -> Custom Content** to enable/disable, ReSync, or delete entries (and to **Export**/**Import** your whole custom content pool as a JSON file for sharing homebrew between worlds).

See the [Wiki](docs/WIKI.md) for the full field-by-field reference.

---

## For Developers / Module Integrations

Encounter Forge exposes `game.modules.get("encounter-forge").api` with `generate()`, `openDialog()`, and `openDialogFor(overrides)` for generating creatures from your own module, plus `encounterForge.generationStarted`, `encounterForge.creatureCreated`, and `encounterForge.encounterComplete` hooks for reacting to generation.

The API also exposes `exportCustomContent()` and `importCustomContent(payload)`, the same machinery behind the [Custom Content](#custom-content) manager's Export/Import buttons. If your module ships its own bestiary, item pack, or homebrew content, you can bundle an Encounter Forge content pack (JSON) alongside it and call `importCustomContent()` to drop those traits, actions, and spells straight into the randomization pools, no manual setup for the GM. This works well both ways: a lore/compendium module can feed Encounter Forge new content, and Encounter Forge's `openDialogFor()` can hand a freshly generated NPC straight back to that module's UI.

If you're building a module that could pair well with Encounter Forge, feel free to reach out, I'd be happy to help with integration or cross-promote.

Full API reference, options tables, hook payloads, and code samples live in the [Wiki](docs/WIKI.md).

---

## Roadmap

- Additional themes, chassis, and content pool expansions.
- Additional system support beyond dnd5e, contingent on interest and feasibility.

Have a feature request or found a balance edge case? Open an issue on GitHub or drop a note on Patreon. See links below.

---

## Links

- **GitHub:** `<GITHUB_REPO_URL_PLACEHOLDER>`
- **Foundry Package Page:** `<FOUNDRY_PACKAGE_PAGE_URL_PLACEHOLDER>`
- **Patreon:** `<PATREON_URL_PLACEHOLDER>`

---

## License

`<LICENSE_PLACEHOLDER>`
