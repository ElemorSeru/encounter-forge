import { crToDisplay } from "./cr-engine.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

function outcomeLabel(outcome) {
  const key = outcome.charAt(0).toUpperCase() + outcome.slice(1);
  return game.i18n.localize(`ENCOUNTERFORGE.Outcome.${key}`);
}

export default class EncounterForgeResultsDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "encounter-forge-results",
    classes: ["encounter-forge"],
    window: {
      title: "ENCOUNTERFORGE.Results.Title",
      icon: "fas fa-dice-d20",
      resizable: true
    },
    position: { width: 420, height: "auto" },
    actions: {
      closeDialog: EncounterForgeResultsDialog._onClose
    }
  };

  static PARTS = {
    form: {
      template: "modules/encounter-forge/templates/results-dialog.hbs"
    }
  };

  constructor(result, options = {}) {
    super(options);
    this.result = result;
  }

  async _prepareContext(_options) {
    const { results, partyEstimate, groupActual, rounds, outcome } = this.result;

    return {
      creatures: results.map(r => ({
        name: r.name,
        img: r.img,
        cr: crToDisplay(r.cr),
        dpr: r.profile.dpr.toFixed(1),
        hp: r.profile.hp,
        ac: r.profile.ac
      })),
      partyDPR: partyEstimate.dpr.toFixed(1),
      partyHP: Math.round(partyEstimate.hp),
      groupDPR: groupActual.dpr.toFixed(1),
      groupHP: Math.round(groupActual.hp),
      groupAC: Math.round(groupActual.ac),
      roundsDefeat: rounds.roundsToDefeat,
      roundsThreaten: rounds.roundsToThreaten,
      outcome,
      outcomeLabel: outcomeLabel(outcome)
    };
  }

  static _onClose(_event, _target) {
    this.close();
  }
}
