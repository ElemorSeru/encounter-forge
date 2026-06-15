import { loadJson } from "./utils.js";
import { getCRTier } from "./cr-engine.js";

export const HIT_CHANCE = 0.65;
const PARTY_HP_BASE = 10;
const PARTY_HP_PER_LEVEL = 6.5;

// Ratio of roundsToThreaten/roundsToDefeat per difficulty sets the outcome
const DIFFICULTY_TARGETS = {
  easy: { roundsToDefeat: 2, roundsToThreaten: 6 },
  medium: { roundsToDefeat: 3, roundsToThreaten: 5.4 },
  hard: { roundsToDefeat: 4, roundsToThreaten: 4.4 },
  deadly: { roundsToDefeat: 5, roundsToThreaten: 3.5 }
};

const ACTION_ECONOMY_STEP = 0.04;
const ACTION_ECONOMY_CAP = 1.2;
const SOLO_HP_FACTOR = 1.5;
const SOLO_DPR_FACTOR = 1.3;

let _classDPR = null;
let _crBaseline = null;

async function loadClassDPR() {
  if (!_classDPR) _classDPR = await loadJson("balance/class-dpr.json");
  return _classDPR;
}

async function loadCRBaseline() {
  if (!_crBaseline) _crBaseline = await loadJson("balance/cr-baseline.json");
  return _crBaseline;
}

function clampLevel(level) {
  return Math.min(Math.max(Math.floor(level) || 1, 1), 20);
}

export function diceAverage(formula) {
  if (typeof formula === "number") return formula;
  if (!formula) return 0;
  const match = String(formula).match(/^\s*(\d+)d(\d+)\s*([+-]\s*\d+)?/i);
  if (!match) {
    const flat = parseFloat(formula);
    return isNaN(flat) ? 0 : flat;
  }
  const count = Number(match[1]);
  const sides = Number(match[2]);
  const mod = match[3] ? Number(match[3].replace(/\s+/g, "")) : 0;
  return count * (sides + 1) / 2 + mod;
}

function spellDiceCount(tier) {
  if (tier <= 1) return 1;
  if (tier <= 3) return 2;
  if (tier <= 5) return 3;
  return 4;
}

function estimateActionDPR(actions) {
  return (actions || []).reduce((sum, action) => {
    if (!action._resolvedDamage) return sum;
    return sum + diceAverage(action._resolvedDamage[0]);
  }, 0);
}

// Extra DPR from a solo creature's legendary actions as a multiple of its normal action DPR
export function legendaryActionMultiplier(creature) {
  if (!creature.solo) return 0;
  const legendaryActions = (creature.traits || []).filter(t => t.legendary_type === "action");
  if (!legendaryActions.length) return 0;
  const avgCost = legendaryActions.reduce((sum, t) => sum + (t.legendary_cost ?? 1), 0) / legendaryActions.length;
  return avgCost > 0 ? 3 / avgCost : 0;
}

function estimateLegendaryDPR(creature, perActionDPR) {
  return perActionDPR * legendaryActionMultiplier(creature);
}

export function estimateSpellDPR(creature) {
  if (!creature.spellInfo) return 0;
  const tier = getCRTier(creature.cr);
  return spellDiceCount(tier) * 5 * HIT_CHANCE * 0.3;
}

export function estimateCreatureProfile(creature) {
  const hp = creature.stats?.hp ?? 0;
  const ac = creature.stats?.ac ?? 0;
  const actionDPR = estimateActionDPR(creature.actions) * HIT_CHANCE;
  const perActionDPR = creature.actions?.length ? actionDPR / creature.actions.length : 0;
  const legendaryDPR = creature.solo ? estimateLegendaryDPR(creature, perActionDPR) : 0;
  const spellDPR = estimateSpellDPR(creature);
  return { hp, ac, dpr: actionDPR + legendaryDPR + spellDPR };
}

// Size the whole encounter to the party and difficulty then split the total across count of enemies.
export function computeEncounterEnvelope(party, difficulty, count, isSolo = false) {
  const targets = DIFFICULTY_TARGETS[difficulty] ?? DIFFICULTY_TARGETS.medium;
  const n = Math.max(count, 1);

  const groupHPTotal = party.dpr * targets.roundsToDefeat;
  const economyFactor = Math.min(1 + (n - 1) * ACTION_ECONOMY_STEP, ACTION_ECONOMY_CAP);
  const groupDPRTotal = (party.hp / targets.roundsToThreaten) * economyFactor;

  let perEnemyHP = groupHPTotal / n;
  let perEnemyDPR = groupDPRTotal / n;

  if (isSolo) {
    perEnemyHP *= SOLO_HP_FACTOR;
    perEnemyDPR *= SOLO_DPR_FACTOR;
  }

  return {
    groupHP: perEnemyHP * n,
    groupDPR: perEnemyDPR * n,
    perEnemyHP,
    perEnemyDPR
  };
}

// Find the CR whose baseline hp/dpr is closest and use to pick a flavor tier
export async function nearestCRForStats(hp, dpr) {
  const baseline = await loadCRBaseline();
  let bestCR = "0";
  let bestDist = Infinity;

  for (const [cr, stats] of Object.entries(baseline)) {
    const hpDist = Math.abs(hp - stats.hp) / Math.max(stats.hp, 1);
    const dprDist = Math.abs(dpr - stats.dpr) / Math.max(stats.dpr, 1);
    const dist = hpDist + dprDist;
    if (dist < bestDist) {
      bestDist = dist;
      bestCR = cr;
    }
  }

  return bestCR;
}

export async function estimateGroupFromCreatures(creatures) {
  return creatures.reduce((acc, creature) => {
    const profile = estimateCreatureProfile(creature);
    acc.hp += profile.hp;
    acc.dpr += profile.dpr;
    acc.ac = acc.ac ? (acc.ac + profile.ac) / 2 : profile.ac;
    return acc;
  }, { hp: 0, ac: 0, dpr: 0 });
}

export async function estimatePartyGeneric(playerCount, playerLevel) {
  const classDPR = await loadClassDPR();
  const level = clampLevel(playerLevel);
  const classes = Object.values(classDPR.classes);
  const avgDPR = classes.reduce((sum, c) => sum + c.levels[level - 1], 0) / classes.length;
  const hpPerCharacter = PARTY_HP_BASE + (level - 1) * PARTY_HP_PER_LEVEL;
  return {
    dpr: avgDPR * playerCount,
    hp: hpPerCharacter * playerCount
  };
}

export function derivePartyFromActors(actors) {
  const levels = actors.map(a => clampLevel(a.system?.details?.level ?? 1));
  const avgLevel = Math.round(levels.reduce((sum, l) => sum + l, 0) / levels.length);
  return { playerCount: actors.length, playerLevel: avgLevel };
}

export async function estimatePartyFromActors(actors) {
  const classDPR = await loadClassDPR();
  const classes = Object.values(classDPR.classes);
  let totalDPR = 0;
  let totalHP = 0;

  for (const actor of actors) {
    const level = clampLevel(actor.system?.details?.level ?? 1);
    totalHP += actor.system?.attributes?.hp?.max ?? (PARTY_HP_BASE + (level - 1) * PARTY_HP_PER_LEVEL);

    const classItems = (actor.items ?? []).filter(i => i.type === "class");
    let dpr = null;
    if (classItems.length) {
      const primary = classItems.reduce((a, b) => (b.system.levels > (a?.system.levels ?? 0) ? b : a), null);
      const curve = classDPR.classes[primary.name.toLowerCase().trim()];
      if (curve) dpr = curve.levels[level - 1];
    }
    if (dpr === null) {
      dpr = classes.reduce((sum, c) => sum + c.levels[level - 1], 0) / classes.length;
    }
    totalDPR += dpr;
  }

  return { dpr: totalDPR, hp: totalHP };
}

export function estimateRounds(party, group) {
  const roundsToDefeat = party.dpr > 0 ? group.hp / party.dpr : Infinity;
  const roundsToThreaten = group.dpr > 0 ? party.hp / group.dpr : Infinity;
  return {
    roundsToDefeat: Math.max(1, Math.round(roundsToDefeat * 10) / 10),
    roundsToThreaten: Math.max(1, Math.round(roundsToThreaten * 10) / 10)
  };
}

export function estimateOutcome(rounds) {
  const ratio = rounds.roundsToThreaten / rounds.roundsToDefeat;
  if (ratio >= 2.5) return "easy";
  if (ratio >= 1.5) return "manageable";
  if (ratio >= 0.9) return "risky";
  return "dangerous";
}

export function findCandidates(pool, valueFn, target, tolerance) {
  return pool.filter(item => Math.abs(valueFn(item) - target) <= tolerance);
}

export function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
