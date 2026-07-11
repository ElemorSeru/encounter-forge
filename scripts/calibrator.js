import { loadJson } from "./utils.js";
import { getCRTier, crToNumber } from "./cr-engine.js";
import {
  estimateCreatureProfile, findCandidates, pickRandom, diceAverage,
  HIT_CHANCE, SAVE_HIT_CHANCE, RECHARGE_MULTIPLIERS,
  estimateSpellDPR, legendaryActionMultiplier
} from "./combat-estimator.js";
import { getEnabledCustomEntries, registerCacheInvalidator } from "./custom-content.js";

const AC_NUDGE_MAX = 2;
const DPR_TOLERANCE = 0.15;
const HP_RATIO_NUDGE = 0.3;

const ACTION_DPR_TOLERANCE = 0.5;

let _actionPool = null;

registerCacheInvalidator(() => { _actionPool = null; });

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
  _actionPool.push(...getEnabledCustomEntries("actions"));
  return _actionPool;
}

function actionDPR(action, tierKey) {
  const dmg = action.damage_tiers?.[tierKey] || action._resolvedDamage;
  if (!dmg) return 0;
  const chance = action.action_type === "save" ? SAVE_HIT_CHANCE : HIT_CHANCE;
  const recharge = RECHARGE_MULTIPLIERS[action.recharge] ?? 1;
  const aoe = action.aoe_targets ?? 1;
  return diceAverage(dmg[0]) * chance * recharge * aoe;
}

async function swapActionForDPR(creature, targetDPR) {
  const pool = await loadActionPool();
  const tier = getCRTier(creature.cr);
  const tierKey = `tier${tier}`;
  const crNum = crToNumber(creature.cr);
  const usedIds = new Set(creature.actions.map(a => a.id));

  let replaceIdx = 0;
  let worstDPR = Infinity;
  creature.actions.forEach((a, idx) => {
    const d = actionDPR(a, tierKey);
    if (d < worstDPR) { worstDPR = d; replaceIdx = idx; }
  });

  // If we'd be removing the only melee attack, only consider melee replacements.
  const meleeCount = creature.actions.filter(a => a.action_type === "mwak").length;
  const replacingLastMelee = meleeCount === 1 && creature.actions[replaceIdx].action_type === "mwak";

  const allCandidates = pool.filter(a => {
    if (usedIds.has(a.id)) return false;
    if (!a.damage_tiers?.[tierKey]) return false;
    if (a.cr_min !== undefined && crNum < a.cr_min) return false;
    if (a.cr_max !== undefined && crNum > a.cr_max) return false;
    if (a.chassis_affinity && !a.chassis_affinity.includes(creature.chassisType) && !a.chassis_affinity.includes("any")) return false;
    if (creature.theme !== "any" && a.tags?.length > 0 && !a.tags.includes(creature.theme) && !a.tags.includes("any")) return false;
    return true;
  });

  const candidates = replacingLastMelee
    ? allCandidates.filter(a => a.action_type === "mwak")
    : allCandidates;

  if (!candidates.length) return;

  const valueFn = a => actionDPR(a, tierKey);
  let pool2 = findCandidates(candidates, valueFn, targetDPR, targetDPR * 0.2);

  if (!pool2.length) {
    let bestDiff = Infinity;
    for (const c of candidates) bestDiff = Math.min(bestDiff, Math.abs(valueFn(c) - targetDPR));
    pool2 = candidates.filter(c => Math.abs(valueFn(c) - targetDPR) <= bestDiff + 0.01);
  }

  // prefer themed candidates; fall back to closest-DPR themed before touching generic pool
  const themedCandidates = candidates.filter(a => creature.theme !== "any" && a.tags?.includes(creature.theme));
  const themedPool2 = pool2.filter(a => creature.theme !== "any" && a.tags?.includes(creature.theme));
  let chosen;
  if (themedPool2.length) {
    chosen = pickRandom(themedPool2);
  } else if (themedCandidates.length) {
    // widen tolerance to 40% and pick randomly - avoids always funnelling to one action
    const wideTolerance = targetDPR * 0.4;
    const wideThemed = themedCandidates.filter(a => Math.abs(valueFn(a) - targetDPR) <= wideTolerance);
    chosen = pickRandom(wideThemed.length ? wideThemed : themedCandidates);
  } else {
    chosen = pickRandom(pool2);
  }
  chosen._resolvedDamage = chosen.damage_tiers[tierKey];

  creature.actions[replaceIdx] = chosen;
}

function actionsDPR(actions) {
  return (actions || []).reduce((sum, a) => {
    if (!a._resolvedDamage) return sum;
    const chance = a.action_type === "save" ? SAVE_HIT_CHANCE : HIT_CHANCE;
    const recharge = RECHARGE_MULTIPLIERS[a.recharge] ?? 1;
    const aoe = a.aoe_targets ?? 1;
    return sum + diceAverage(a._resolvedDamage[0]) * chance * recharge * aoe;
  }, 0);
}

function scaleDamage(formula, delta) {
  if (!delta) return formula;
  const match = String(formula).trim().match(/^(\d+)d(\d+)\s*([+-]\s*\d+)?$/i);
  if (!match) return formula;
  const count = Number(match[1]);
  const sides = Number(match[2]);
  const existing = match[3] ? parseInt(match[3].replace(/\s+/g, ""), 10) : 0;
  const faceAvg = (sides + 1) / 2;
  const total = count * faceAvg + existing + delta;
  const newCount = Math.max(1, Math.round(total / faceAvg));
  const remainder = Math.round(total - newCount * faceAvg);
  if (remainder === 0) return `${newCount}d${sides}`;
  return `${newCount}d${sides}${remainder > 0 ? "+" : ""}${remainder}`;
}

function applyDamageScale(actions, totalDeltaDPR) {
  if (!actions?.length) return;
  const perActionDPR = totalDeltaDPR / actions.length;
  for (const action of actions) {
    if (!action._resolvedDamage) continue;
    const chance = action.action_type === "save" ? SAVE_HIT_CHANCE : HIT_CHANCE;
    const recharge = RECHARGE_MULTIPLIERS[action.recharge] ?? 1;
    const aoe = action.aoe_targets ?? 1;
    const effective = chance * recharge * aoe;
    const diceDelta = effective > 0 ? Math.round(perActionDPR / effective) : 0;
    if (!diceDelta) continue;
    action._resolvedDamage = [
      scaleDamage(action._resolvedDamage[0], diceDelta),
      action._resolvedDamage[1]
    ];
  }
}

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

    const remaining = targetActionTotal - actionsDPR(creature.actions);
    if (Math.abs(remaining) > ACTION_DPR_TOLERANCE) {
      applyDamageScale(creature.actions, remaining);
    }
  }

  return creature;
}
