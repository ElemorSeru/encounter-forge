import { getCRTier, crToNumber, getProfBonus } from "./cr-engine.js";
import { loadTraitPool, loadLegendaryTraits, selectTraits } from "./trait-selector.js";
import { loadJson } from "./utils.js";
import { selectSpells } from "./spell-engine.js";
import { getEnabledCustomEntries, registerCacheInvalidator } from "./custom-content.js";
import { legendaryActionMultiplier, HIT_CHANCE, SAVE_HIT_CHANCE, RECHARGE_MULTIPLIERS } from "./combat-estimator.js";

let _chassis = null;
let _actions = null;
let _descriptors = null;

registerCacheInvalidator(() => {
  _actions = null;
});

async function loadStaticData() {
  if (!_chassis) {
    _chassis = await loadJson("chassis/archetypes.json");
  }

  if (!_actions) {
    const cats = ["melee", "ranged", "special"];
    _actions = [];
    for (const cat of cats) {
      try {
        const data = await loadJson(`actions/${cat}.json`);
        _actions.push(...data);
      } catch (err) {
        console.error(`Encounter Forge | Could not load actions/${cat}.json:`, err);
      }
    }

    _actions.push(...getEnabledCustomEntries("actions"));
  }

  if (!_descriptors) {
    const [names, types] = await Promise.all([
      loadJson("descriptors/names.json"),
      loadJson("descriptors/types.json")
    ]);
    _descriptors = { names, types };
  }
}

function pickChassis(theme) {
  const filtered = theme === "any"
    ? _chassis
    : _chassis.filter(c => !c.themes || c.themes.includes(theme) || c.themes.includes("any"));
  const pool = filtered.length ? filtered : _chassis;
  return pool[Math.floor(Math.random() * pool.length)];
}

function getChassisStats(chassis, cr) {
  const tier = getCRTier(cr);
  const key = `tier${tier}`;
  return chassis.tiers[key] || chassis.tiers[Object.keys(chassis.tiers)[0]];
}

function fisherYates(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const ATTACK_TYPES = new Set(["mwak", "rwak", "rsak"]);

function computeDiceFromTarget(action, targetPerActionDPR) {
  const fallback = action.damage_fallback;
  if (!fallback) return null;
  const match = String(fallback[0]).match(/^(\d+)d(\d+)/i);
  if (!match) return fallback;
  const sides = Number(match[2]);
  const dieAvg = (sides + 1) / 2;
  const chance = action.action_type === "save" ? SAVE_HIT_CHANCE : HIT_CHANCE;
  const recharge = RECHARGE_MULTIPLIERS[action.recharge] ?? 1;
  const aoe = action.aoe_targets ?? 1;
  const effective = dieAvg * chance * recharge * aoe;
  if (effective <= 0) return fallback;
  const diceCount = Math.max(1, Math.round(targetPerActionDPR / effective));
  return [`${diceCount}d${sides}`, fallback[1]];
}

function pickActions(cr, theme, chassisType, count, excludeIds = new Set(), perActionTargetDPR = undefined) {
  const crNum = crToNumber(cr);
  const tier = getCRTier(cr);

  const filtered = _actions.filter(a => {
    if (excludeIds.has(a.id)) return false;
    if (a.cr_min !== undefined && crNum < a.cr_min) return false;
    if (a.cr_max !== undefined && crNum > a.cr_max) return false;
    if (a.chassis_affinity && !a.chassis_affinity.includes(chassisType) && !a.chassis_affinity.includes("any")) return false;
    if (theme !== "any" && a.tags?.length > 0 && !a.tags.includes(theme) && !a.tags.includes("any")) return false;
    return true;
  });

  // themed entries sort before generic "any" fallbacks
  function themedFirst(pool) {
    const themed = fisherYates(pool.filter(a => theme !== "any" && a.tags?.includes(theme)));
    const generic = fisherYates(pool.filter(a => !(theme !== "any" && a.tags?.includes(theme))));
    const result = [];
    let t = [...themed], g = [...generic];
    while (t.length || g.length) {
      if (t.length && (!g.length || Math.random() < 0.75)) result.push(t.shift());
      else result.push(g.shift());
    }
    return result;
  }

  const MELEE_TYPES = new Set(["mwak"]);
  const isArtillery = chassisType === "artillery";
  const meleePool = themedFirst(filtered.filter(a => MELEE_TYPES.has(a.action_type)));
  const rangedPool = themedFirst(filtered.filter(a => ATTACK_TYPES.has(a.action_type) && !MELEE_TYPES.has(a.action_type)));
  const specialPool = themedFirst(filtered.filter(a => !ATTACK_TYPES.has(a.action_type)));

  // Artillery leads with ranged; all other chassis guarantee a melee attack first.
  const primaryPool = isArtillery ? rangedPool : meleePool;
  const secondaryPool = isArtillery ? meleePool : rangedPool;

  const actions = [];
  let firstPick = primaryPool.shift() ?? secondaryPool.shift();

  if (!firstPick) {
    const looseMelee = fisherYates(_actions.filter(a =>
      !excludeIds.has(a.id) &&
      (a.cr_min === undefined || crNum >= a.cr_min) &&
      (a.cr_max === undefined || crNum <= a.cr_max) &&
      MELEE_TYPES.has(a.action_type)
    ));
    const looseRanged = fisherYates(_actions.filter(a =>
      !excludeIds.has(a.id) &&
      (a.cr_min === undefined || crNum >= a.cr_min) &&
      (a.cr_max === undefined || crNum <= a.cr_max) &&
      ATTACK_TYPES.has(a.action_type) && !MELEE_TYPES.has(a.action_type)
    ));
    const [lp, ls] = isArtillery ? [looseRanged, looseMelee] : [looseMelee, looseRanged];
    firstPick = lp.shift() ?? ls.shift();
  }

  if (firstPick) actions.push(firstPick);
  const specialSlots = Math.min(count - 1, specialPool.length);
  actions.push(...specialPool.slice(0, specialSlots));
  const remaining = count - actions.length;
  if (remaining > 0) actions.push(...primaryPool.slice(0, remaining));
  if (actions.length < count) actions.push(...secondaryPool.slice(0, count - actions.length));

  for (const action of actions) {
    if (perActionTargetDPR !== undefined) {
      action._resolvedDamage = computeDiceFromTarget(action, perActionTargetDPR) || action.damage_fallback || null;
    } else {
      const tierKey = `tier${tier}`;
      action._resolvedDamage = action.damage_tiers?.[tierKey] || action.damage_fallback || null;
    }
  }

  return actions;
}

// Primary skills guaranteed; secondary skills 50% chance. Expertise at tier 4+
const THEME_SKILL_PROFILE = {
  beast: { primary: ["prc", "sur"], secondary: ["ste"] },
  undead: { primary: ["prc", "ste"], secondary: [] },
  aberration: { primary: ["prc"], secondary: ["ste", "arc"] },
  humanoid: { primary: ["prc"], secondary: ["ath", "ste", "itm", "per", "ins"] },
  elemental: { primary: ["ath"], secondary: ["prc"] },
  fey: { primary: ["prc", "ste"], secondary: ["dec", "per"] },
  fiend: { primary: ["dec", "prc"], secondary: ["itm", "ins"] },
  dragon: { primary: ["prc", "ste"], secondary: ["his"] },
  construct: { primary: ["ath", "prc"], secondary: [] },
  monstrosity: { primary: ["prc", "sur"], secondary: ["ath", "ste"] },
  any: { primary: ["prc"], secondary: [] }
};

const CHASSIS_SKILL_BONUS = {
  brute: ["ath"],
  lurker: ["ste", "prc"],
  skirmisher: ["acr", "ath"],
  controller: ["arc", "ins"],
  artillery: ["arc", "inv"],
  leader: ["per", "ins", "itm"]
};

const THEME_SENSES = {
  beast: { darkvision: 0, blindsight: 0, tremorsense: 0, truesight: 0 },
  undead: { darkvision: 60, blindsight: 0, tremorsense: 0, truesight: 0 },
  aberration: { darkvision: 60, blindsight: 30, tremorsense: 0, truesight: 0 },
  humanoid: { darkvision: 0, blindsight: 0, tremorsense: 0, truesight: 0 },
  elemental: { darkvision: 60, blindsight: 0, tremorsense: 30, truesight: 0 },
  fey: { darkvision: 60, blindsight: 0, tremorsense: 0, truesight: 0 },
  fiend: { darkvision: 120, blindsight: 0, tremorsense: 0, truesight: 0 },
  dragon: { darkvision: 120, blindsight: 30, tremorsense: 0, truesight: 0 },
  construct: { darkvision: 60, blindsight: 60, tremorsense: 0, truesight: 0 },
  monstrosity: { darkvision: 60, blindsight: 0, tremorsense: 0, truesight: 0 },
  any: { darkvision: 30, blindsight: 0, tremorsense: 0, truesight: 0 }
};

const THEME_SPEED_EXTRAS = {
  beast: [{ type: "swim", chance: 0.30, base: 30 }],
  undead: [{ type: "fly", chance: 0.20, base: 30 }],
  aberration: [{ type: "swim", chance: 0.30, base: 30 },
    { type: "climb", chance: 0.30, base: 20 }],
  humanoid: [],
  elemental: [{ type: "swim", chance: 0.25, base: 40 },
    { type: "fly", chance: 0.25, base: 40 }],
  fey: [{ type: "fly", chance: 0.40, base: 40 }],
  fiend: [{ type: "fly", chance: 0.40, base: 40 }],
  dragon: [{ type: "fly", chance: 0.85, base: 60 },
    { type: "swim", chance: 0.30, base: 30 }],
  construct: [],
  monstrosity: [{ type: "swim", chance: 0.20, base: 30 },
    { type: "climb", chance: 0.20, base: 20 }],
  any: []
};

function generateExtras(theme, chassisType, tier) {
  const rng = () => Math.random();

  const profile = THEME_SKILL_PROFILE[theme] || THEME_SKILL_PROFILE.any;
  const chassisBonus = CHASSIS_SKILL_BONUS[chassisType] || [];
  const skills = {};
  const canExpert = tier >= 4;

  for (const s of profile.primary) {
    skills[s] = canExpert ? 2 : 1;
  }
  for (const s of profile.secondary) {
    if (rng() < 0.5) skills[s] = 1;
  }
  for (const s of chassisBonus) {
    if (!skills[s]) skills[s] = 1;
  }

  const senses = { ...(THEME_SENSES[theme] || THEME_SENSES.any) };
  if (tier >= 3) {
    if (senses.darkvision > 0 && senses.darkvision < 120)
      senses.darkvision = Math.min(senses.darkvision + 30, 120);
    if (senses.blindsight > 0)
      senses.blindsight = Math.min(senses.blindsight + 15, 60);
    if (senses.tremorsense > 0)
      senses.tremorsense = Math.min(senses.tremorsense + 15, 60);
  }
  if (tier >= 5 && ["fiend", "dragon", "aberration"].includes(theme)) {
    senses.truesight = 10;
  }

  const speedExtras = {};
  for (const extra of (THEME_SPEED_EXTRAS[theme] || [])) {
    if (rng() < extra.chance) {
      speedExtras[extra.type] = extra.base + Math.floor((tier - 1) / 2) * 10;
    }
  }

  return { skills, senses, speedExtras };
}

const SIZE_ORDER = ["tiny", "sm", "med", "lg", "huge", "grg"];

const CHASSIS_SIZE_BY_TIER = {
  brute: ["med", "lg", "lg", "huge", "huge", "huge"],
  lurker: ["med", "med", "med", "med", "lg", "lg"],
  skirmisher: ["med", "med", "lg", "lg", "lg", "lg"],
  controller: ["med", "med", "med", "med", "lg", "lg"],
  artillery: ["med", "med", "med", "med", "lg", "lg"],
  leader: ["med", "med", "med", "lg", "lg", "lg"]
};

const THEME_SIZE_CAP = {
  humanoid: "med",
  fey: "lg",
  undead: "lg",
  fiend: "lg",
  aberration: "huge",
  beast: "huge",
  dragon: "grg",
  elemental: "huge",
  construct: "huge",
  monstrosity: "huge",
  any: "huge"
};

const SMALL_CHANCE = {
  humanoid: 0.20,
  fey: 0.30,
  beast: 0.25
};

function resolveSize(theme, chassisType, tier) {
  if (tier === 1) {
    const chance = SMALL_CHANCE[theme] ?? 0;
    if (chance > 0 && Math.random() < chance) return "sm";
  }

  const tierSizes = CHASSIS_SIZE_BY_TIER[chassisType] || CHASSIS_SIZE_BY_TIER.controller;
  const baseSize = tierSizes[Math.min(tier - 1, 5)];

  const capIdx = SIZE_ORDER.indexOf(THEME_SIZE_CAP[theme] ?? "huge");
  const baseIdx = SIZE_ORDER.indexOf(baseSize);
  return SIZE_ORDER[Math.min(baseIdx, capIdx)];
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateName(theme) {
  const { names, types } = _descriptors;
  const typePool = (theme !== "any" && types[theme]) ? types[theme] : types["any"];
  const noun = pick(typePool);

  if (theme === "humanoid" && names.first_names?.length) {
    const first = pick(names.first_names);
    const base = `${first} ${noun}`;
    if (names.titles?.length && Math.random() < 0.30) {
      return `${pick(names.titles)} ${base}`;
    }
    return base;
  }

  const prefixPool = names.theme_prefixes?.[theme]?.length
    ? names.theme_prefixes[theme]
    : names.prefixes;
  return `${pick(prefixPool)} ${noun}`;
}

async function assembleCreature(cr, theme, forceName, isSolo = false, isSummon = false, targetDPR = undefined) {
  await loadStaticData();

  const traitPool = await loadTraitPool();
  const tier = getCRTier(cr);
  const crNum = crToNumber(cr);
  const profBonus = getProfBonus(cr);

  const chassis = pickChassis(theme);
  const stats = getChassisStats(chassis, cr);

  const traitCount = Math.min(1 + Math.floor(tier / 2), 4);
  const maxCRAdjust = tier <= 2 ? 1 : tier <= 4 ? 2 : 3;

  let traits = selectTraits(traitPool, cr, theme, traitCount, maxCRAdjust);

  if (tier >= 5 || isSolo) {
    const legendaryPool = await loadLegendaryTraits();

    if (isSolo) {
      const actionPool = legendaryPool.filter(t => t.legendary_type === "action");
      const nonActionPool = legendaryPool.filter(t => t.legendary_type !== "action");
      const guaranteedActions = selectTraits(actionPool, cr, theme, 1, 0);
      const otherLegendary = selectTraits(nonActionPool, cr, theme, 1, 0);
      traits = [...traits, ...guaranteedActions, ...otherLegendary];
    } else {
      traits = [...traits, ...selectTraits(legendaryPool, cr, theme, 1, 0)];
    }
  }

  const spellInfo = await selectSpells(
    theme, tier, chassis.type, profBonus,
    { int: stats.int, wis: stats.wis, cha: stats.cha }
  );

  // Solo bosses and summoned companions dont have summon_lesser in their action pool.
  const excludeIds = (isSolo || isSummon) ? new Set(["summon_lesser"]) : new Set();
  const actionCount = isSolo ? 3 : (tier <= 1 ? 1 : tier <= 3 ? 2 : 3);

  let perActionTargetDPR = undefined;
  if (targetDPR !== undefined) {
    const spellDPR = spellInfo ? (tier <= 1 ? 1 : tier <= 3 ? 2 : tier <= 5 ? 3 : 4) * 5 * HIT_CHANCE * 0.3 : 0;
    const tempCreature = { solo: isSolo, traits };
    const extraActions = legendaryActionMultiplier(tempCreature);
    const legendaryFactor = 1 + (actionCount > 0 ? extraActions / actionCount : 0);
    const targetActionTotal = Math.max(0, (targetDPR - spellDPR) / legendaryFactor);
    perActionTargetDPR = actionCount > 0 ? targetActionTotal / actionCount : 0;
  }

  const actions = pickActions(cr, theme, chassis.type, actionCount, excludeIds, perActionTargetDPR);

  const name = (forceName && typeof forceName === "string" && forceName.trim()) ? forceName.trim() : generateName(theme);

  const extras = generateExtras(theme, chassis.type, tier);

  let finalAC = stats.ac;
  let finalHP = stats.hp;
  const resistances = [...(stats.resistances || [])];
  const immunities = [...(stats.immunities || [])];
  const conditionImmunities = [...(stats.condition_immunities || [])];
  const speeds = { ...stats.speeds };
  for (const [speedType, value] of Object.entries(extras.speedExtras)) {
    if (!speeds[speedType] || speeds[speedType] < value) speeds[speedType] = value;
  }

  for (const trait of traits) {
    const fx = trait.effect || {};
    if (fx.ac_bonus) finalAC += fx.ac_bonus;
    if (fx.hp_bonus) finalHP += fx.hp_bonus;
    if (fx.resistance) resistances.push(...fx.resistance);
    if (fx.immunity) immunities.push(...fx.immunity);
    if (fx.condition_immunity) conditionImmunities.push(...fx.condition_immunity);
    if (fx.speed) Object.assign(speeds, fx.speed);
  }

  if (isSolo) {
    finalAC = finalAC + 2;
  }

  return {
    name,
    cr,
    theme,
    chassisType: chassis.type,
    profBonus,
    skills: extras.skills,
    senses: extras.senses,
    stats: {
      str: stats.str, dex: stats.dex, con: stats.con,
      int: stats.int, wis: stats.wis, cha: stats.cha,
      hp: finalHP,
      ac: finalAC,
      size: resolveSize(theme, chassis.type, tier),
      speeds
    },
    traits,
    actions,
    resistances: [...new Set(resistances)],
    immunities: [...new Set(immunities)],
    conditionImmunities: [...new Set(conditionImmunities)],
    creatureType: theme === "any" ? "monstrosity" : theme,
    spellInfo,
    solo: isSolo
  };
}

export { assembleCreature };
