import { crToDisplay } from "./cr-engine.js";
import { assembleCreature } from "./creature-assembler.js";
import { createActor } from "./actor-creator.js";
import { calibrateCreature } from "./calibrator.js";
import {
  estimatePartyGeneric, estimatePartyFromActors, estimateCreatureProfile,
  estimateRounds, estimateOutcome, derivePartyFromActors,
  computeEncounterEnvelope, nearestCRForStats
} from "./combat-estimator.js";

async function generate({ playerCount, playerLevel, enemyCount, difficulty, theme, name, img, tokenImg, solo, disposition, folder, calibrate, partyActorIds } = {}) {
  let pCount = Math.clamp(parseInt(playerCount) || 4, 1, 8);
  let pLevel = Math.clamp(parseInt(playerLevel) || 1, 1, 20);
  const eCount = Math.clamp(parseInt(enemyCount) || 1, 1, 10);
  const diff = difficulty || "medium";
  const faction = theme || "any";
  const isSolo = !!solo;
  const isCalibrated = !!calibrate;
  const count = isSolo ? 1 : eCount;

  let partyActors = [];
  if (isCalibrated && partyActorIds?.length) {
    partyActors = partyActorIds.map(id => game.actors.get(id)).filter(Boolean);
    if (partyActors.length) {
      const derived = derivePartyFromActors(partyActors);
      pCount = derived.playerCount;
      pLevel = derived.playerLevel;
    }
  }

  const partyEstimate = partyActors.length
    ? await estimatePartyFromActors(partyActors)
    : await estimatePartyGeneric(pCount, pLevel);

  // Sizes the whole encounter to the party and difficulty; targetCR is only used for picking a flavor tier per creature.
  const intensityOffset = game.settings.get("encounter-forge", "combatIntensity") ?? 0;
  const envelope = computeEncounterEnvelope(partyEstimate, diff, count, isSolo, intensityOffset);
  const targetCR = await nearestCRForStats(envelope.perEnemyHP, envelope.perEnemyDPR);

  ui.notifications.info(
    `${game.i18n.localize("ENCOUNTERFORGE.Notify.Generating")} (CR ${crToDisplay(targetCR)})`
  );

  Hooks.callAll("encounterForge.generationStarted", {
    playerCount: pCount,
    playerLevel: pLevel,
    enemyCount: eCount,
    difficulty: diff,
    theme: faction,
    targetCR,
    solo: isSolo,
    calibrate: isCalibrated
  });

  const actors = [];
  const results = [];
  for (let i = 0; i < count; i++) {
    try {
      const creature = await assembleCreature(targetCR, faction, name, isSolo);
      creature.img = img || null;
      creature.tokenImg = tokenImg || null;
      creature.solo = isSolo;
      creature.disposition = disposition ?? CONST.TOKEN_DISPOSITIONS.HOSTILE;
      creature.folder = folder ?? null;

      await calibrateCreature(creature, { hp: envelope.perEnemyHP, dpr: envelope.perEnemyDPR });

      const profile = estimateCreatureProfile(creature);
      const actor = await createActor(creature);
      if (actor) {
        actors.push(actor);
        results.push({ name: creature.name, img: actor.img, cr: creature.cr, profile });
      }
    } catch (err) {
      console.error("Encounter Forge | Error generating creature:", err);
      ui.notifications.error(game.i18n.localize("ENCOUNTERFORGE.Notify.Error"));
    }
  }

  const groupActual = results.reduce((acc, r) => {
    acc.hp += r.profile.hp;
    acc.dpr += r.profile.dpr;
    acc.ac = acc.ac ? (acc.ac + r.profile.ac) / 2 : r.profile.ac;
    return acc;
  }, { hp: 0, ac: 0, dpr: 0 });

  const groupExpected = { hp: envelope.groupHP, dpr: envelope.groupDPR, ac: groupActual.ac };
  const rounds = estimateRounds(partyEstimate, groupActual);
  const outcome = estimateOutcome(rounds);

  Hooks.callAll("encounterForge.encounterComplete", {
    actors,
    theme: faction,
    targetCR,
    count: actors.length,
    solo: isSolo,
    calibrate: isCalibrated,
    results, partyEstimate, groupActual, groupExpected, rounds, outcome
  });

  actors.results = results;
  actors.partyEstimate = partyEstimate;
  actors.groupActual = groupActual;
  actors.groupExpected = groupExpected;
  actors.rounds = rounds;
  actors.outcome = outcome;
  actors.targetCR = targetCR;

  return actors;
}

export { generate };
