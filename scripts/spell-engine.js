import { loadJson } from "./utils.js";
import { getEnabledCustomEntries, registerCacheInvalidator } from "./custom-content.js";

const SPELLCASTING_CHASSIS = {
  controller: { always: true },
  leader: { always: true },
  artillery: { chance: 0.50 }
};

const SPELL_COUNT = {
  1: { cantrips: 2, leveled: 1 },
  2: { cantrips: 2, leveled: 1 },
  3: { cantrips: 2, leveled: 2 },
  4: { cantrips: 2, leveled: 2 },
  5: { cantrips: 2, leveled: 3 },
  6: { cantrips: 2, leveled: 3 }
};

const CASTING_STAT_KEY = {
  int: "ENCOUNTERFORGE.Generated.Ability.Int",
  wis: "ENCOUNTERFORGE.Generated.Ability.Wis",
  cha: "ENCOUNTERFORGE.Generated.Ability.Cha"
};

let _spellPool = null;
let _spellIndex = null; // Map<normalised name, { packId, itemId }>

registerCacheInvalidator(() => {
  _spellPool = null;
});

async function loadSpellPool() {
  if (_spellPool) return _spellPool;
  const base = await loadJson("spells/spells.json");
  const custom = getEnabledCustomEntries("spells");
  _spellPool = [...base, ...custom];
  return _spellPool;
}

async function buildSpellIndex() {
  if (_spellIndex) return _spellIndex;
  _spellIndex = new Map();

  const packs = [...game.packs].sort((a, b) => {
    const order = { system: 0, world: 1, module: 2 };
    return (order[a.metadata.packageType] ?? 2) - (order[b.metadata.packageType] ?? 2);
  });

  for (const pack of packs) {
    if (pack.metadata.type !== "Item") continue;
    try {
      await pack.getIndex({ fields: ["name", "type"] });
      for (const entry of pack.index) {
        if (entry.type !== "spell") continue;
        const key = entry.name.toLowerCase().trim();
        if (!_spellIndex.has(key)) {
          _spellIndex.set(key, { packId: pack.collection, itemId: entry._id });
        }
      }
    } catch { /* skipping failed packs */ }
  }

  console.log(`Encounter Forge | Spell index: ${_spellIndex.size} spells across all compendiums`);
  return _spellIndex;
}

function isSpellcaster(chassisType) {
  const cfg = SPELLCASTING_CHASSIS[chassisType];
  if (!cfg) return false;
  return cfg.always ? true : Math.random() < (cfg.chance ?? 0);
}

function filterPool(pool, theme, tier) {
  return pool.filter(spell => {
    if (spell.tier_min && tier < spell.tier_min) return false;
    if (spell.tier_max && tier > spell.tier_max) return false;
    if (theme === "any") return true;
    if (!spell.tags?.length) return true;
    return spell.tags.includes(theme) || spell.tags.includes("any");
  });
}

function pickN(arr, n) {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

export async function selectSpells(theme, tier, chassisType, profBonus, mentalStats) {
  if (!isSpellcaster(chassisType)) return null;

  const pool = await loadSpellPool();
  const filtered = filterPool(pool, theme, tier);
  const counts = SPELL_COUNT[Math.min(tier, 6)] ?? SPELL_COUNT[1];

  const cantrips = pickN(filtered.filter(s => s.cantrip), counts.cantrips);
  const leveled = pickN(filtered.filter(s => !s.cantrip), counts.leveled);

  const [castingStat] = Object.entries(mentalStats).sort((a, b) => b[1] - a[1])[0];
  const castingMod = Math.floor((mentalStats[castingStat] - 10) / 2);
  const spellDC = 8 + profBonus + castingMod;
  const spellBonus = profBonus + castingMod;

  return { cantrips, leveled, castingStat, spellDC, spellBonus };
}

export async function importSpellItem(spell) {
  // Custom-exported spells carry a full clone so use it as-is.
  if (spell._fullClone) {
    return { source: "compendium", data: spell._fullClone };
  }
  // standard spells are built as at-will spell items which don't need slot configuration
  return { source: "synthetic", spell };
}

export function buildSpellcastingDesc(spellInfo, creatureName) {
  const { cantrips, leveled, castingStat, spellDC, spellBonus } = spellInfo;
  const statLabel = game.i18n.localize(CASTING_STAT_KEY[castingStat] ?? "ENCOUNTERFORGE.Generated.Ability.Int");
  const bonusStr = spellBonus >= 0 ? `+${spellBonus}` : String(spellBonus);
  const noSpells = game.i18n.localize("ENCOUNTERFORGE.Generated.NoSpells");
  const cantripStr = cantrips.length
    ? cantrips.map(s => s.name.charAt(0).toUpperCase() + s.name.slice(1)).join(", ")
    : noSpells;
  const leveledStr = leveled.length
    ? leveled.map(s => s.name.charAt(0).toUpperCase() + s.name.slice(1)).join(", ")
    : noSpells;

  const label = game.i18n.localize("ENCOUNTERFORGE.Generated.SpellcastingLabel");
  const body = game.i18n.format("ENCOUNTERFORGE.Generated.SpellcastingBody", {
    ability: statLabel, dc: spellDC, bonus: bonusStr
  });
  const cantripsHeading = game.i18n.localize("ENCOUNTERFORGE.Generated.SpellcastingCantrips");
  const spellsHeading = game.i18n.localize("ENCOUNTERFORGE.Generated.SpellcastingSpells");

  return [
    `<p><strong>${label}</strong> ${body}</p>`,
    `<p><em>${cantripsHeading}</em> ${cantripStr}</p>`,
    `<p><em>${spellsHeading}</em> ${leveledStr}</p>`
  ].join("");
}
