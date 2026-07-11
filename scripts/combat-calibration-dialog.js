import {
  estimatePartyGeneric,
  computeEncounterEnvelope,
  estimateRounds,
  estimateOutcome,
  DEFAULT_DIFFICULTY_TARGETS,
  getAdjustedDifficultyTargets
} from "./combat-estimator.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const MODULE_ID = "encounter-forge";
const SETTING_KEY = "combatIntensity";
const MIN_OFFSET = -3;
const MAX_OFFSET = 3;

const PREVIEW_PLAYER_COUNT = 4;
const PREVIEW_PLAYER_LEVEL = 5;

const MAX_BAR_ROUNDS = 9;

const DIFFS = ["easy", "medium", "hard", "deadly"];

function offsetDisplay(offset) {
  if (offset > 0) return `+${offset}`;
  return String(offset);
}

function stepLabelKey(offset) {
  if (offset === 0) return "ENCOUNTERFORGE.Calibration.Step.0";
  return offset > 0
    ? `ENCOUNTERFORGE.Calibration.Step.P${offset}`
    : `ENCOUNTERFORGE.Calibration.Step.N${Math.abs(offset)}`;
}

function pipColorClass(offset) {
  if (offset < 0) return "neg";
  if (offset > 0) return "pos";
  return "zero";
}

async function buildDiffRows(offset) {
  const party = await estimatePartyGeneric(PREVIEW_PLAYER_COUNT, PREVIEW_PLAYER_LEVEL);

  return DIFFS.map(diff => {
    const diffKey = diff.charAt(0).toUpperCase() + diff.slice(1);
    const label = game.i18n.localize(`ENCOUNTERFORGE.Difficulty.${diffKey}`);

    const envelope = computeEncounterEnvelope(party, diff, 1, false, offset);
    const rounds = estimateRounds(party, { hp: envelope.groupHP, dpr: envelope.groupDPR });
    const outcome = estimateOutcome(rounds);

    const defeat = +rounds.roundsToDefeat.toFixed(1);
    const drain = +rounds.roundsToThreaten.toFixed(1);

    const outcomeKey = outcome.charAt(0).toUpperCase() + outcome.slice(1);

    return {
      diff,
      label,
      defeat,
      drain,
      defeatWidth: Math.min(100, Math.round((defeat / MAX_BAR_ROUNDS) * 100)),
      drainWidth: Math.min(100, Math.round((drain / MAX_BAR_ROUNDS) * 100)),
      outcome,
      outcomeLabel: game.i18n.localize(`ENCOUNTERFORGE.Outcome.${outcomeKey}`)
    };
  });
}

export default class EncounterForgeCombatCalibrationDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "encounter-forge-calibration-dialog",
    classes: ["encounter-forge"],
    window: {
      title: "ENCOUNTERFORGE.Calibration.Title",
      icon: "fas fa-sliders",
      resizable: false
    },
    position: { width: 480, height: "auto" },
    actions: {
      increment: EncounterForgeCombatCalibrationDialog._onIncrement,
      decrement: EncounterForgeCombatCalibrationDialog._onDecrement,
      setOffset: EncounterForgeCombatCalibrationDialog._onSetOffset,
      resetOffset: EncounterForgeCombatCalibrationDialog._onReset,
      closeDialog: EncounterForgeCombatCalibrationDialog._onClose
    }
  };

  static PARTS = {
    form: {
      template: "modules/encounter-forge/templates/combat-calibration-dialog.hbs"
    }
  };

  async _prepareContext(_options) {
    const offset = game.settings.get(MODULE_ID, SETTING_KEY) ?? 0;

    const pips = [];
    for (let s = MIN_OFFSET; s <= MAX_OFFSET; s++) {
      pips.push({
        step: s,
        active: s === offset,
        colorClass: s === offset ? pipColorClass(s) : ""
      });
    }

    const defaultRows = await buildDiffRows(0);
    const adjustedRows = offset !== 0 ? await buildDiffRows(offset) : defaultRows;

    const diffRows = adjustedRows.map((row, i) => ({
      ...row,
      defaultDefeat: defaultRows[i].defeat,
      defaultDrain: defaultRows[i].drain
    }));

    return {
      offset,
      offsetDisplay: offsetDisplay(offset),
      stepLabel: game.i18n.localize(stepLabelKey(offset)),
      isDefault: offset === 0,
      atMin: offset <= MIN_OFFSET,
      atMax: offset >= MAX_OFFSET,
      pips,
      diffRows
    };
  }

  static async _onIncrement(_event, _target) {
    const current = game.settings.get(MODULE_ID, SETTING_KEY) ?? 0;
    if (current >= MAX_OFFSET) return;
    const next = current + 1;
    await game.settings.set(MODULE_ID, SETTING_KEY, next);
    this.render();
  }

  static async _onDecrement(_event, _target) {
    const current = game.settings.get(MODULE_ID, SETTING_KEY) ?? 0;
    if (current <= MIN_OFFSET) return;
    const next = current - 1;
    await game.settings.set(MODULE_ID, SETTING_KEY, next);
    this.render();
  }

  static async _onSetOffset(_event, target) {
    const step = parseInt(target.dataset.step);
    if (isNaN(step) || step < MIN_OFFSET || step > MAX_OFFSET) return;
    await game.settings.set(MODULE_ID, SETTING_KEY, step);
    this.render();
  }

  static async _onReset(_event, _target) {
    await game.settings.set(MODULE_ID, SETTING_KEY, 0);
    this.render();
  }

  static _onClose(_event, _target) {
    this.close();
  }
}
