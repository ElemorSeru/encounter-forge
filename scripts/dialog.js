import { generate } from "./generator.js";
import { crToDisplay } from "./cr-engine.js";
import {
  estimatePartyGeneric, estimatePartyFromActors,
  estimateRounds, estimateOutcome, derivePartyFromActors,
  computeEncounterEnvelope, nearestCRForStats
} from "./combat-estimator.js";
import EncounterForgeResultsDialog from "./results-dialog.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

function outcomeLabel(outcome) {
  const key = outcome.charAt(0).toUpperCase() + outcome.slice(1);
  return game.i18n.localize(`ENCOUNTERFORGE.Outcome.${key}`);
}

async function computeReadout({ pCount, pLevel, eCount, diff, isSolo, calibrate, partyActorIds }) {
  const count = isSolo ? 1 : eCount;

  let actors = [];
  if (calibrate && partyActorIds?.length) {
    actors = partyActorIds.map(id => game.actors.get(id)).filter(Boolean);
  }
  if (actors.length) {
    const derived = derivePartyFromActors(actors);
    pCount = derived.playerCount;
    pLevel = derived.playerLevel;
  }

  let partyEstimate = await estimatePartyGeneric(pCount, pLevel);
  if (actors.length) partyEstimate = await estimatePartyFromActors(actors);

  const envelope = computeEncounterEnvelope(partyEstimate, diff, count, isSolo);
  const targetCR = await nearestCRForStats(envelope.perEnemyHP, envelope.perEnemyDPR);
  const groupEstimate = { hp: envelope.groupHP, dpr: envelope.groupDPR };

  const rounds = estimateRounds(partyEstimate, groupEstimate);
  const outcome = estimateOutcome(rounds);

  return {
    cr: crToDisplay(targetCR),
    enemyDPR: groupEstimate.dpr.toFixed(1),
    enemyHP: Math.round(groupEstimate.hp),
    partyDPR: partyEstimate.dpr.toFixed(1),
    partyHP: Math.round(partyEstimate.hp),
    roundsDefeat: rounds.roundsToDefeat,
    roundsThreaten: rounds.roundsToThreaten,
    outcome,
    outcomeLabel: outcomeLabel(outcome),
    derivedParty: actors.length > 0,
    playerCount: pCount,
    playerLevel: pLevel
  };
}

function readForm(el) {
  return {
    pCount: parseInt(el.querySelector('[name="playerCount"]')?.value) || 4,
    pLevel: parseInt(el.querySelector('[name="playerLevel"]')?.value) || 1,
    eCount: parseInt(el.querySelector('[name="enemyCount"]')?.value) || 1,
    diff: el.querySelector('[name="difficulty"]')?.value || "medium",
    isSolo: el.querySelector('[name="solo"]')?.checked ?? false,
    calibrate: el.querySelector('[name="calibrate"]')?.checked ?? false,
    partyActorIds: [...el.querySelectorAll('[name="partyActors"]:checked')].map(c => c.value)
  };
}

function getPlayerActors(selectedIds) {
  const noOwner = game.i18n.localize("ENCOUNTERFORGE.Dialog.NoOwner");
  return game.actors
    .filter(a => a.hasPlayerOwner)
    .map(a => {
      const owners = game.users.filter(u => !u.isGM && a.testUserPermission(u, "OWNER"));
      return {
        id: a.id,
        name: a.name,
        img: a.img,
        owner: owners.length ? owners.map(u => u.name).join(", ") : noOwner,
        selected: selectedIds.includes(a.id)
      };
    })
    .sort((a, b) => {
      if (a.owner === noOwner && b.owner !== noOwner) return 1;
      if (b.owner === noOwner && a.owner !== noOwner) return -1;
      const ownerCmp = a.owner.localeCompare(b.owner, undefined, { numeric: true });
      return ownerCmp !== 0 ? ownerCmp : a.name.localeCompare(b.name, undefined, { numeric: true });
    });
}

export default class EncounterForgeDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "encounter-forge-dialog",
    classes: ["encounter-forge"],
    tag: "form",
    form: {
      handler: EncounterForgeDialog._onSubmit,
      closeOnSubmit: true
    },
    window: {
      title: "ENCOUNTERFORGE.Dialog.Title",
      icon: "fas fa-hat-wizard",
      resizable: false
    },
    position: { width: 660, height: "auto" },
    actions: {
      closeDialog: EncounterForgeDialog._onClose
    }
  };

  static PARTS = {
    form: {
      template: "modules/encounter-forge/templates/generator-dialog.hbs"
    }
  };

  // overrides optionals { name, img, tokenImg, lockEnemyCount, enemyCount } from openDialogFor()
  // resolveFn resolves the openDialogFor() with the generate() result (or null on close).
  constructor(overrides = null, resolveFn = null, options = {}) {
    super(options);
    this.overrides = overrides;
    this._resolveFn = resolveFn;
    this._resolved = false;
  }

  _resolve(value) {
    if (this._resolved) return;
    this._resolved = true;
    this._resolveFn?.(value);
  }

  async close(options) {
    this._resolve(null);
    return super.close(options);
  }

  async _prepareContext(_options) {
    const overrides = this.overrides;
    const remember = !overrides && game.settings.get("encounter-forge", "rememberLastUsed");
    const saved = remember ? (game.settings.get("encounter-forge", "lastUsedValues") ?? {}) : {};
    const v = (key, fallback) => saved[key] ?? fallback;

    const diff = v("difficulty", "medium");
    const theme = v("theme", "any");
    const disposition = v("disposition", -1);
    const playerCount = v("playerCount", 4);
    const playerLevel = v("playerLevel", 1);
    const calibrate = v("calibrate", false);
    const partyActorIds = v("partyActorIds", []);

    const enemyCountLocked = !!overrides?.lockEnemyCount;
    const enemyCount = enemyCountLocked
      ? Math.clamp(parseInt(overrides.enemyCount) || 1, 1, 10)
      : v("enemyCount", 1);

    const hideSolo = enemyCountLocked && enemyCount > 1;
    const solo = hideSolo ? false : v("solo", false);

    const showName = !!overrides;
    const nameValue = overrides?.name ?? "";

    this._enemyCountLocked = enemyCountLocked;

    const readout = await computeReadout({
      pCount: playerCount, pLevel: playerLevel, eCount: enemyCount,
      diff, isSolo: solo, calibrate, partyActorIds
    });

    return {
      playerCount, playerLevel, enemyCount, solo, calibrate,
      enemyCountLocked, hideSolo, showName, nameValue,
      readout,
      playerActors: getPlayerActors(partyActorIds),
      difficulties: [
        { value: "easy", label: game.i18n.localize("ENCOUNTERFORGE.Difficulty.Easy"), selected: diff === "easy" },
        { value: "medium", label: game.i18n.localize("ENCOUNTERFORGE.Difficulty.Medium"), selected: diff === "medium" },
        { value: "hard", label: game.i18n.localize("ENCOUNTERFORGE.Difficulty.Hard"), selected: diff === "hard" },
        { value: "deadly", label: game.i18n.localize("ENCOUNTERFORGE.Difficulty.Deadly"), selected: diff === "deadly" }
      ],
      dispositions: [
        { value: -1, label: game.i18n.localize("ENCOUNTERFORGE.Disposition.Hostile"), selected: disposition === -1 },
        { value: 0, label: game.i18n.localize("ENCOUNTERFORGE.Disposition.Neutral"), selected: disposition === 0 },
        { value: 1, label: game.i18n.localize("ENCOUNTERFORGE.Disposition.Friendly"), selected: disposition === 1 },
        { value: -2, label: game.i18n.localize("ENCOUNTERFORGE.Disposition.Secret"), selected: disposition === -2 }
      ],
      themes: [
        { value: "any", label: game.i18n.localize("ENCOUNTERFORGE.Theme.Any"), selected: theme === "any" },
        { value: "beast", label: game.i18n.localize("ENCOUNTERFORGE.Theme.Beast"), selected: theme === "beast" },
        { value: "undead", label: game.i18n.localize("ENCOUNTERFORGE.Theme.Undead"), selected: theme === "undead" },
        { value: "aberration", label: game.i18n.localize("ENCOUNTERFORGE.Theme.Aberration"), selected: theme === "aberration" },
        { value: "humanoid", label: game.i18n.localize("ENCOUNTERFORGE.Theme.Humanoid"), selected: theme === "humanoid" },
        { value: "elemental", label: game.i18n.localize("ENCOUNTERFORGE.Theme.Elemental"), selected: theme === "elemental" },
        { value: "fiend", label: game.i18n.localize("ENCOUNTERFORGE.Theme.Fiend"), selected: theme === "fiend" },
        { value: "fey", label: game.i18n.localize("ENCOUNTERFORGE.Theme.Fey"), selected: theme === "fey" },
        { value: "construct", label: game.i18n.localize("ENCOUNTERFORGE.Theme.Construct"), selected: theme === "construct" },
        { value: "dragon", label: game.i18n.localize("ENCOUNTERFORGE.Theme.Dragon"), selected: theme === "dragon" }
      ]
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const soloBox = this.element.querySelector('[name="solo"]');
    const enemyInput = this.element.querySelector('[name="enemyCount"]');
    const calibrateBox = this.element.querySelector('[name="calibrate"]');
    const actorPicker = this.element.querySelector(".ef-actor-picker");

    const sync = () => {
      if (this._enemyCountLocked) {
        enemyInput.disabled = true;
      } else if (soloBox?.checked) {
        enemyInput.value = 1;
        enemyInput.disabled = true;
      } else if (enemyInput) {
        enemyInput.disabled = false;
      }
      this._updateReadout();
    };
    if (soloBox && enemyInput) {
      soloBox.addEventListener("change", sync);
      sync();
    } else if (enemyInput && this._enemyCountLocked) {
      enemyInput.disabled = true;
    }

    const syncCalibrate = () => {
      actorPicker?.classList.toggle("ef-collapsed", !calibrateBox?.checked);
      this._updateReadout();
    };
    if (calibrateBox && actorPicker) {
      calibrateBox.addEventListener("change", syncCalibrate);
      syncCalibrate();
    }

    for (const name of ["playerCount", "playerLevel", "enemyCount", "difficulty"]) {
      this.element.querySelector(`[name="${name}"]`)?.addEventListener("change", () => this._updateReadout());
    }
    actorPicker?.addEventListener("change", () => this._updateReadout());

    this._updateReadout();
  }

  async _updateReadout() {
    const root = this.element;
    if (!root.querySelector(".ef-readout")) return;

    const readout = await computeReadout(readForm(root));

    const pCountInput = root.querySelector('[name="playerCount"]');
    const pLevelInput = root.querySelector('[name="playerLevel"]');
    if (pCountInput && pLevelInput) {
      const hint = readout.derivedParty ? game.i18n.localize("ENCOUNTERFORGE.Dialog.DerivedFromParty") : "";
      pCountInput.disabled = readout.derivedParty;
      pLevelInput.disabled = readout.derivedParty;
      pCountInput.title = hint;
      pLevelInput.title = hint;
      if (readout.derivedParty) {
        pCountInput.value = readout.playerCount;
        pLevelInput.value = readout.playerLevel;
      }
    }

    root.querySelector('[data-readout="cr"]').textContent = readout.cr;
    root.querySelector('[data-readout="enemy"]').textContent = `${readout.enemyDPR} / ${readout.enemyHP}`;
    root.querySelector('[data-readout="party"]').textContent = `${readout.partyDPR} / ${readout.partyHP}`;
    root.querySelector('[data-readout="rounds"]').textContent = `${readout.roundsDefeat} / ${readout.roundsThreaten}`;

    const outcomeEl = root.querySelector('[data-readout="outcome"]');
    outcomeEl.textContent = readout.outcomeLabel;
    outcomeEl.closest(".ef-readout-row").dataset.outcome = readout.outcome;
  }

  static async _onSubmit(_event, _form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    data.solo = !!data.solo;
    data.calibrate = !!data.calibrate;
    data.disposition = parseInt(data.disposition) ?? -1;
    if (data.solo) data.enemyCount = 1;

    if (this.overrides?.lockEnemyCount) {
      data.enemyCount = Math.clamp(parseInt(this.overrides.enemyCount) || 1, 1, 10);
    }

    let partyActorIds = data.partyActors ?? [];
    if (!Array.isArray(partyActorIds)) partyActorIds = [partyActorIds];
    data.partyActorIds = partyActorIds;
    delete data.partyActors;

    if (data.calibrate && partyActorIds.length) {
      const actors = partyActorIds.map(id => game.actors.get(id)).filter(Boolean);
      if (actors.length) {
        const derived = derivePartyFromActors(actors);
        data.playerCount = derived.playerCount;
        data.playerLevel = derived.playerLevel;
      }
    }

    if (this.overrides) {
      data.name = (data.overrideName ?? "").trim() || undefined;
      delete data.overrideName;
      if (this.overrides.img) data.img = this.overrides.img;
      if (this.overrides.tokenImg) data.tokenImg = this.overrides.tokenImg;
    } else if (game.settings.get("encounter-forge", "rememberLastUsed")) {
      await game.settings.set("encounter-forge", "lastUsedValues", {
        playerCount: data.playerCount,
        playerLevel: data.playerLevel,
        enemyCount: data.enemyCount,
        difficulty: data.difficulty,
        theme: data.theme,
        solo: data.solo,
        disposition: data.disposition,
        calibrate: data.calibrate,
        partyActorIds: data.partyActorIds
      });
    }

    const result = await generate(data);
    this._resolve(result);
    if (result.results?.length) {
      new EncounterForgeResultsDialog(result).render(true);
    }
  }

  static _onClose(_event, _target) {
    this.close();
  }
}
