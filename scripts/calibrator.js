import { loadJson } from "./utils.js";
import { getCRTier, crToNumber } from "./cr-engine.js";
import {
  estimateCreatureProfile, findCandidates, pickRandom, diceAverage, HIT_CHANCE,
  estimateSpellDPR, legendaryActionMultiplier
} from "./combat-estimator.js";

const AC_NUDGE_MAX = 2;
const DPR_TOLERANCE = 0.15;
const HP_RATIO_NUDGE = 0.3;

const ACTION_DPR_TOLERANCE = 0.5;

let _actionPool = null;

async function loadActionPool() {
  if (_actionPool) return _actionPool;
  const cats = ["melee", "ranged", "special"];
  _actionPool = [];
  for (const cat of cats) {
    try {
      const data = await loadJson(`actions/${cat}.json`);
      _actionPool.push(...data);
    } catch (err) {
      console.error(`Encounter Forge | Could not load actions/${cat}.json:`, err);
    }
  }
  return _actionPool;
}

function actionDPR(action, tierKey) {
  const dmg = action.damage_tiers?.[tierKey] || action._resolvedDamage;
  if (!dmg) return 0;
  return diceAverage(dmg[0]) * HIT_CHANCE;
}

async function swapActionForDPR(creature, targetDPR) {
  const pool = await loadActionPool();
  const tier = getCRTier(creature.cr);
  const tierKey = `tier${tier}`;
  const crNum = crToNumber(creature.cr);
  const usedIds = new Set(creature.actions.map(a => a.id));

  const candidates = pool.filter(a => {
    if (usedIds.has(a.id)) return false;
    if (!a.damage_tiers?.[tierKey]) return false;
    if (a.cr_min !== undefined && crNum < a.cr_min) return false;
    if (a.cr_max !== undefined && crNum > a.cr_max) return false;
    if (a.chassis_affinity && !a.chassis_affinity.includes(creature.chassisType) && !a.chassis_affinity.includes("any")) return false;
    if (creature.theme !== "any" && a.tags?.length > 0 && !a.tags.includes(creature.theme) && !a.tags.includes("any")) return false;
    return true;
  });
  if (!candidates.length) return;

  const valueFn = a => actionDPR(a, tierKey);
  let pool2 = findCandidates(candidates, valueFn, targetDPR, targetDPR * 0.2);

  if (!pool2.length) {
    let bestDiff = Infinity;
    for (const c of candidates) bestDiff = Math.min(bestDiff, Math.abs(valueFn(c) - targetDPR));
    pool2 = candidates.filter(c => Math.abs(valueFn(c) - targetDPR) <= bestDiff + 0.01);
  }

  const chosen = pickRandom(pool2);
  chosen._resolvedDamage = chosen.damage_tiers[tierKey];

  let replaceIdx = 0;
  let worstDPR = Infinity;
  creature.actions.forEach((a, idx) => {
    const d = actionDPR(a, tierKey);
    if (d < worstDPR) {
      worstDPR = d;
      replaceIdx = idx;
    }
  });

  creature.actions[replaceIdx] = chosen;
}

function actionsDPR(actions) {
  return (actions || []).reduce((sum, a) => {
    if (!a._resolvedDamage) return sum;
    return sum + diceAverage(a._resolvedDamage[0]);
  }, 0) * HIT_CHANCE;
}

// Add flat modifier to a "XdY" or "XdY+Z" formula (e.g. "2d6", 3 -> "2d6+3"), average never drops below 1.
function addFlatModifier(formula, delta) {
  if (!delta) return formula;
  const match = String(formula).trim().match(/^(\d+d\d+)\s*([+-]\s*\d+)?$/i);
  if (!match) return formula;

  const dice = match[1];
  const existing = match[2] ? parseInt(match[2].replace(/\s+/g, ""), 10) : 0;
  const diceAvg = diceAverage(dice);

  let mod = existing + delta;
  mod = Math.max(mod, Math.ceil(1 - diceAvg));

  if (mod === 0) return dice;
  return `${dice}${mod > 0 ? "+" : ""}${mod}`;
}

// Closes the DPR gap remainder after swapActionForDPR to spread a flat damage bonus across all actions.
function applyFlatDamageBonus(actions, totalDeltaDPR) {
  if (!actions?.length) return;

  const perActionDPR = totalDeltaDPR / actions.length;
  const diceDelta = Math.round(perActionDPR / HIT_CHANCE);
  if (!diceDelta) return;

  for (const action of actions) {
    if (!action._resolvedDamage) continue;
    action._resolvedDamage = [
      addFlatModifier(action._resolvedDamage[0], diceDelta),
      action._resolvedDamage[1]
    ];
  }
}

// Set this creature's HP/DPR to the targets from computeEncounterEnvelope. Nudging AC based on how far it moved from its chassis baseline.
export async function calibrateCreature(creature, targets) {
  const profile = estimateCreatureProfile(creature);

  const targetHP = Math.max(1, Math.round(targets.hp));
  const targetDPR = Math.max(0, targets.dpr);

  const hpRatio = profile.hp > 0 ? targetHP / profile.hp : 1;
  const dprRatio = profile.dpr > 0 ? targetDPR / profile.dpr : 1;

  creature.stats.hp = targetHP;

  let acNudge = 0;
  if (hpRatio >= 1 + HP_RATIO_NUDGE) acNudge += 1;
  if (hpRatio <= 1 - HP_RATIO_NUDGE) acNudge -= 1;
  if (dprRatio > 1 + DPR_TOLERANCE) acNudge -= 1;
  if (dprRatio < 1 - DPR_TOLERANCE) acNudge += 1;
  acNudge = Math.min(Math.max(acNudge, -AC_NUDGE_MAX), AC_NUDGE_MAX);
  if (acNudge) creature.stats.ac = Math.max(10, creature.stats.ac + acNudge);

  if (creature.actions.length) {
    // Solve for action total once legendary DPR is added back on top so it lands on targetDPR.
    const spellDPR = estimateSpellDPR(creature);
    const extraActions = legendaryActionMultiplier(creature);
    const legendaryFactor = 1 + extraActions / creature.actions.length;
    const targetActionTotal = Math.max(0, (targetDPR - spellDPR) / legendaryFactor);

    if (Math.abs(dprRatio - 1) > DPR_TOLERANCE) {
      await swapActionForDPR(creature, targetActionTotal / creature.actions.length);
    }

    // Close whatever gap is left over with a flat damage bonus across the creature's actions.
    const remaining = targetActionTotal - actionsDPR(creature.actions);
    if (Math.abs(remaining) > ACTION_DPR_TOLERANCE) {
      applyFlatDamageBonus(creature.actions, remaining);
    }
  }

  return creature;
}
