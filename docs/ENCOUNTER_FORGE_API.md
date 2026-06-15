# Encounter Forge - Public API

Other Foundry VTT modules can call Encounter Forge to open the generation dialog or generate creatures directly, without any UI interaction required.

The API is available after the `ready` hook fires.

---

## Checking availability

Always check that the module is active and the API is loaded before calling it.

```js
const ef = game.modules.get("encounter-forge");
if (!ef?.active || !ef.api) return;
```

---

## Methods

### `openDialog()`

Opens the Encounter Forge generation dialog. The GM fills in the fields and clicks Generate.

```js
const ef = game.modules.get("encounter-forge");
if (ef?.active && ef.api) {
  ef.api.openDialog();
}
```

---

### `openDialogFor(overrides)`

Opens the same dialog, pre-configured for "generate one named NPC for me" use cases - e.g. a "Create Token" button that should populate name/portrait/token image and only ever generate a single creature. Returns a Promise that resolves with the `generate()` result (an Actor array, same shape as below) once the GM clicks Generate, or `null` if they close the dialog without generating.

```js
const ef = game.modules.get("encounter-forge");
if (ef?.active && ef.api) {
  const actors = await ef.api.openDialogFor({
    name:           "Bandit Captain Vex",
    img:            "modules/lore-reference-board/art/bandit-captain-vex.webp",
    tokenImg:       "modules/lore-reference-board/tokens/bandit-captain-vex.webp",
    lockEnemyCount: true,
    enemyCount:     1
  });

  if (actors) {
    // GM generated - actors[0] is the created NPC actor
  } else {
    // GM closed the dialog without generating
  }
}
```

#### Overrides

| Field | Type | Description |
|---|---|---|
| `name` | string | Pre-fills an editable **Name** field at the top of the dialog. The GM can adjust it before generating. |
| `img` | string | Actor portrait path. Applied silently when the actor is created - no field is shown for it. |
| `tokenImg` | string | Token image path. Applied silently when the actor is created - no field is shown for it. |
| `lockEnemyCount` | boolean | Disables the Number of Enemies field. |
| `enemyCount` | number | 1-10. The value Number of Enemies is locked to when `lockEnemyCount` is true. |

All fields are optional - `openDialogFor()` or `openDialogFor(null)` behaves exactly like `openDialog()` (no extra fields, no resolved value used). If `lockEnemyCount` is true and `enemyCount` is greater than 1, the Solo Boss toggle is hidden, since Solo always forces a single enemy. The GM's saved "last used values" are left untouched whenever overrides are passed.

---

### `generate(options)`

Generates one or more creatures silently, without opening the dialog. Returns a Promise that resolves to an array of the created Actor documents.

```js
const ef = game.modules.get("encounter-forge");
if (ef?.active && ef.api) {
  const actors = await ef.api.generate({
    playerCount: 4,
    playerLevel:  5,
    enemyCount:   2,
    difficulty:  "hard",
    theme:       "undead",
    name:        "The Pale Warden",
    img:         "modules/my-module/art/pale-warden.webp",
    tokenImg:    "modules/my-module/tokens/pale-warden-token.webp"
  });
}
```

#### Options

| Field | Type | Default | Description |
|---|---|---|---|
| `playerCount` | number | `4` | Number of players in the party (1–8) |
| `playerLevel` | number | `1` | Average player level (1–20) |
| `enemyCount` | number | `1` | Number of creatures to generate (1–10) |
| `difficulty` | string | `"medium"` | Encounter difficulty: `"easy"`, `"medium"`, `"hard"`, or `"deadly"` |
| `theme` | string | `"any"` | Creature theme hint. See valid values below. |
| `name` | string | *(procedural)* | Override the generated name. If omitted, a name is generated from the descriptor pool. When generating multiple enemies, all creatures share this name. |
| `img` | string | `"icons/svg/mystery-man.svg"` | Path to the actor portrait shown on the character sheet. Accepts any Foundry-accessible file path. |
| `tokenImg` | string | *(same as img)* | Path to the token texture used when the actor is dragged to a scene. If omitted, Foundry uses its default token image. |

All fields are optional. Omitted fields use their defaults.

#### Valid theme values

| Value | Description |
|---|---|
| `"any"` | No theme constraint — generates a monstrosity |
| `"beast"` | Natural predator or animal |
| `"undead"` | Undead creature |
| `"aberration"` | Alien or mind-bending entity |
| `"humanoid"` | Humanoid combatant |
| `"elemental"` | Elemental creature |
| `"fiend"` | Devil, demon, or fiendish creature |
| `"fey"` | Fey creature |
| `"construct"` | Constructed or mechanical creature |
| `"dragon"` | Draconic creature |

---

### `exportCustomContent()`

Returns the world's custom content pool (traits/actions/spells added via the Custom Content manager) as a plain, JSON-serializable object. Synchronous and read-only.

```js
const ef = game.modules.get("encounter-forge");
if (ef?.active && ef.api) {
  const pack = ef.api.exportCustomContent();
  // pack = { encounterForgeCustomContent: true, formatVersion: 1, exportedAt: "...", data: { traits: [], actions: [], spells: [] } }
}
```

---

### `importCustomContent(payload)`

Merges a content pack (an object shaped like `exportCustomContent()`'s return value, or its downloaded JSON) into this world's custom content pools. Entries are deep-cloned with fresh IDs and appended - existing entries are never overwritten. Returns a Promise resolving to the number of entries imported, and throws if `payload` isn't a valid content pack.

```js
const ef = game.modules.get("encounter-forge");
if (ef?.active && ef.api) {
  const pack = await (await fetch("modules/my-bestiary-pack/encounter-forge-pack.json")).json();
  const imported = await ef.api.importCustomContent(pack);
}
```

---

## Full example with error handling

```js
async function spawnEncounter(playerCount, playerLevel, theme, name, img, tokenImg) {
  const ef = game.modules.get("encounter-forge");

  if (!ef?.active) {
    ui.notifications.warn("Encounter Forge is not installed or enabled.");
    return;
  }

  if (!ef.api) {
    ui.notifications.warn("Encounter Forge API is not ready yet.");
    return;
  }

  const actors = await ef.api.generate({
    playerCount,
    playerLevel,
    enemyCount: 1,
    difficulty: "medium",
    theme,
    name,
    img,
    tokenImg
  });

  return actors;
}
```

---

## Notes

- Only GMs can create actors. Calling `generate()` as a non-GM user will silently produce no results.
- Generated actors are saved permanently to the Actors sidebar and can be dragged to a scene, saved to a compendium, or deleted normally.
- The `generate()` call fires one notification per created actor confirming the name and CR.
- When `name` is provided and `enemyCount` is greater than 1, all generated creatures receive the same name. To give each a unique name, call `generate()` once per creature instead.
- Image paths must be accessible from the Foundry server. Paths starting with `modules/`, `worlds/`, or `systems/` are typical. External URLs are not supported.
- This is a quick-reference summary. `generate()` also accepts `solo`, `disposition`, `folder`, `calibrate`, and `partyActorIds`, and the API fires `encounterForge.generationStarted` / `creatureCreated` / `encounterComplete` hooks - see [ENCOUNTER_FORGE_REFERENCE.md](ENCOUNTER_FORGE_REFERENCE.md#public-api) or the [Wiki](docs/WIKI.md#api--integration) for the full set of options, return values, and hook payloads.
