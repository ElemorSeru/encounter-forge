import { getCRTier, crToNumber } from "./cr-engine.js";
import { loadJson } from "./utils.js";
import { getEnabledCustomEntries, registerCacheInvalidator } from "./custom-content.js";

const TRAIT_CATEGORIES = ["defensive", "offensive", "movement", "senses", "passive", "reactions"];

let _traitPool = null;
let _legendaryPool = null;

registerCacheInvalidator(() => {
  _traitPool = null;
  _legendaryPool = null;
});

async function loadTraitPool() {
  if (_traitPool) return _traitPool;

  const all = [];
  for (const cat of TRAIT_CATEGORIES) {
    try {
      const data = await loadJson(`traits/${cat}.json`);
      all.push(...data);
    } catch (err) {
      console.error(`Encounter Forge | Could not load traits/${cat}.json:`, err);
    }
  }

  const custom = getEnabledCustomEntries("traits").filter(t => t.category !== "legendary");
  all.push(...custom);

  _traitPool = all;
  return _traitPool;
}

async function loadLegendaryTraits() {
  if (_legendaryPool) return _legendaryPool;

  let base = [];
  try {
    base = await loadJson("traits/legendary.json");
  } catch (err) {
    console.error("Encounter Forge | Could not load traits/legendary.json:", err);
  }

  const custom = getEnabledCustomEntries("traits").filter(t => t.category === "legendary");
  _legendaryPool = [...base, ...custom];
  return _legendaryPool;
}

function filterPool(pool, cr, theme) {
  const crNum = crToNumber(cr);
  return pool.filter(trait => {
    if (trait.cr_min !== undefined && crNum < trait.cr_min) return false;
    if (trait.cr_max !== undefined && crNum > trait.cr_max) return false;
    if (theme === "any") return true;
    if (!trait.tags || trait.tags.length === 0) return true;
    return trait.tags.includes(theme) || trait.tags.includes("any");
  });
}

function selectTraits(pool, cr, theme, targetCount, maxCRAdjust) {
  const available = filterPool(pool, cr, theme);
  const selected = [];
  const usedIds = new Set();
  let totalAdjust = 0;

  const shuffled = [...available].sort(() => Math.random() - 0.5);

  for (const trait of shuffled) {
    if (selected.length >= targetCount) break;
    if (usedIds.has(trait.id)) continue;
    const adj = trait.cr_adjustment ?? 0;
    if (totalAdjust + adj > maxCRAdjust) continue;
    selected.push(trait);
    usedIds.add(trait.id);
    totalAdjust += adj;
  }

  return selected;
}

export { loadTraitPool, loadLegendaryTraits, selectTraits };
