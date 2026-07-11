import EncounterForgeDialog from "./dialog.js";
import { generate } from "./generator.js";
import { registerCustomContentSetting, exportCustomContent, importCustomContent } from "./custom-content.js";
import EncounterForgeExportDialog from "./export-dialog.js";
import EncounterForgeCustomContentDialog from "./custom-content-dialog.js";
import EncounterForgeCombatCalibrationDialog from "./combat-calibration-dialog.js";

// Allowed item types to export into Encounter Forge's custom content pools.
const EXPORTABLE_ITEM_TYPES = ["feat", "weapon", "spell"];

class EncounterForgeResetDefaults extends FormApplication {
  render() {
    this.close();
    Dialog.confirm({
      title: game.i18n.localize("ENCOUNTERFORGE.Settings.ResetConfirmTitle"),
      content: `<p>${game.i18n.localize("ENCOUNTERFORGE.Settings.ResetConfirmBody")}</p>`,
      yes: async () => {
        await game.settings.set("encounter-forge", "lastUsedValues", {});
        ui.notifications.info(game.i18n.localize("ENCOUNTERFORGE.Settings.ResetDone"));
      }
    });
  }
  async _updateObject() {}
  get template() { return ""; }
}

class EncounterForgeCustomContentMenu extends FormApplication {
  render() {
    this.close();
    new EncounterForgeCustomContentDialog().render(true);
  }
  async _updateObject() {}
  get template() { return ""; }
}

class EncounterForgeCombatCalibrationMenu extends FormApplication {
  render() {
    this.close();
    new EncounterForgeCombatCalibrationDialog().render(true);
  }
  async _updateObject() {}
  get template() { return ""; }
}

Hooks.once("init", () => {
  registerCustomContentSetting();
  game.settings.registerMenu("encounter-forge", "resetLastUsed", {
    name: "ENCOUNTERFORGE.Settings.ResetName",
    label: "ENCOUNTERFORGE.Settings.ResetLabel",
    hint: "ENCOUNTERFORGE.Settings.ResetHint",
    icon: "fas fa-rotate-left",
    type: EncounterForgeResetDefaults,
    restricted: false
  });

  game.settings.register("encounter-forge", "defaultFolder", {
    name: "ENCOUNTERFORGE.Settings.FolderName",
    hint: "ENCOUNTERFORGE.Settings.FolderHint",
    scope: "world",
    config: true,
    type: String,
    default: ""
  });

  game.settings.register("encounter-forge", "rememberLastUsed", {
    name: "ENCOUNTERFORGE.Settings.RememberName",
    hint: "ENCOUNTERFORGE.Settings.RememberHint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register("encounter-forge", "lastUsedValues", {
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.registerMenu("encounter-forge", "customContentMenu", {
    name: "ENCOUNTERFORGE.Settings.CustomContentName",
    label: "ENCOUNTERFORGE.Settings.CustomContentLabel",
    hint: "ENCOUNTERFORGE.Settings.CustomContentHint",
    icon: "fas fa-list",
    type: EncounterForgeCustomContentMenu,
    restricted: true
  });

  game.settings.register("encounter-forge", "combatIntensity", {
    scope: "world",
    config: false,
    type: Number,
    default: 0
  });

  game.settings.register("encounter-forge", "dprFirstDamage", {
    name: "ENCOUNTERFORGE.Settings.DprFirstName",
    hint: "ENCOUNTERFORGE.Settings.DprFirstHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    restricted: true
  });

  game.settings.registerMenu("encounter-forge", "combatCalibrationMenu", {
    name: "ENCOUNTERFORGE.Settings.CombatCalibrationName",
    label: "ENCOUNTERFORGE.Settings.CombatCalibrationLabel",
    hint: "ENCOUNTERFORGE.Settings.CombatCalibrationHint",
    icon: "fas fa-sliders",
    type: EncounterForgeCombatCalibrationMenu,
    restricted: true
  });
});

Hooks.once("ready", () => {
  const mod = game.modules.get("encounter-forge");
  if (!mod) return;

  mod.api = {
    openDialog: () => new EncounterForgeDialog().render(true),
    openDialogFor: (overrides = null) => new Promise((resolve) => {
      new EncounterForgeDialog(overrides, resolve).render(true);
    }),
    generate: (options = {}) => generate(options),
    exportCustomContent: () => exportCustomContent(),
    importCustomContent: (payload) => importCustomContent(payload)
  };

  if (game.user.isGM) {
    console.log(
      "Encounter Forge | Ready\n" +
      "  API: game.modules.get('encounter-forge').api.generate(options)\n" +
      "  API: game.modules.get('encounter-forge').api.importCustomContent(payload) - load a content pack\n" +
      "  Hooks: encounterForge.generationStarted | encounterForge.creatureCreated | encounterForge.encounterComplete"
    );
  }
});

Hooks.on("renderActorDirectory", (app, html) => {
  if (!game.user.isGM) return;
  const el = html instanceof HTMLElement ? html : html[0];
  if (!el || el.querySelector(".encounter-forge-sidebar-btn")) return;
  const actions = el.querySelector(".header-actions");
  if (!actions) return;

  const generateBtn = document.createElement("button");
  generateBtn.className = "encounter-forge-sidebar-btn";
  generateBtn.title = game.i18n.localize("ENCOUNTERFORGE.Controls.Generate");
  generateBtn.innerHTML = `<i class="fas fa-hat-wizard"></i> ${game.i18n.localize("ENCOUNTERFORGE.Controls.Generate")}`;
  generateBtn.addEventListener("click", () => new EncounterForgeDialog().render(true));
  actions.append(generateBtn);

  const customContentBtn = document.createElement("button");
  customContentBtn.className = "encounter-forge-sidebar-btn encounter-forge-custom-content-btn";
  customContentBtn.title = game.i18n.localize("ENCOUNTERFORGE.Controls.CustomContent");
  customContentBtn.innerHTML = `<i class="fas fa-list"></i> ${game.i18n.localize("ENCOUNTERFORGE.Controls.CustomContent")}`;
  customContentBtn.addEventListener("click", () => new EncounterForgeCustomContentDialog().render(true));
  actions.append(customContentBtn);
});

function addExportHeaderButton(app) {
  if (!game.user.isGM) return;
  if (!EXPORTABLE_ITEM_TYPES.includes(app.document?.type)) return;

  const root = app.element instanceof HTMLElement ? app.element : app.element?.[0];
  const header = root?.querySelector(".window-header");
  if (!header || header.querySelector(".encounter-forge-export-btn")) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "header-control encounter-forge-export-btn";
  btn.dataset.tooltip = game.i18n.localize("ENCOUNTERFORGE.Export.HeaderButton");
  btn.innerHTML = '<i class="fas fa-file-export"></i>';
  btn.addEventListener("click", event => {
    event.preventDefault();
    new EncounterForgeExportDialog({ item: app.document }).render(true);
  });

  const title = header.querySelector(".window-title");
  if (title) title.after(btn);
  else header.prepend(btn);
}

Hooks.on("renderItemSheet5e2", addExportHeaderButton);
Hooks.on("renderItemSheet5e", addExportHeaderButton);

