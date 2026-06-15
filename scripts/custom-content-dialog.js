import { getCustomContent, deleteCustomEntry, setCustomEntryEnabled, exportCustomContent, importCustomContent } from "./custom-content.js";
import EncounterForgeExportDialog from "./export-dialog.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const KIND_LABELS = {
  traits: "ENCOUNTERFORGE.CustomContent.Traits",
  actions: "ENCOUNTERFORGE.CustomContent.Actions",
  spells: "ENCOUNTERFORGE.CustomContent.Spells"
};

function capitalize(str) {
  // Older exports could store category as an array if the form briefly
  // submitted duplicate-named fields; fall back to the first usable value.
  if (Array.isArray(str)) str = str.find(value => typeof value === "string" && value) ?? str[0];
  if (typeof str !== "string" || !str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function entryCategoryLabel(kind, entry) {
  if (kind === "spells") {
    return entry.cantrip
      ? game.i18n.localize("ENCOUNTERFORGE.Export.Cantrip")
      : game.i18n.localize("ENCOUNTERFORGE.CustomContent.Spell");
  }
  return game.i18n.localize(`ENCOUNTERFORGE.Category.${capitalize(entry.category)}`);
}

export default class EncounterForgeCustomContentDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "encounter-forge-custom-content-dialog",
    classes: ["encounter-forge"],
    window: {
      title: "ENCOUNTERFORGE.CustomContent.Title",
      icon: "fas fa-list",
      resizable: true
    },
    position: { width: 520, height: "auto" },
    actions: {
      closeDialog: EncounterForgeCustomContentDialog._onClose,
      toggleEnabled: EncounterForgeCustomContentDialog._onToggleEnabled,
      resync: EncounterForgeCustomContentDialog._onResync,
      deleteEntry: EncounterForgeCustomContentDialog._onDelete,
      exportContent: EncounterForgeCustomContentDialog._onExport,
      importContent: EncounterForgeCustomContentDialog._onImport
    }
  };

  static PARTS = {
    form: {
      template: "modules/encounter-forge/templates/custom-content-dialog.hbs"
    }
  };

  async _prepareContext(_options) {
    const data = getCustomContent();

    const groups = Object.entries(KIND_LABELS).map(([kind, labelKey]) => ({
      kind,
      label: game.i18n.localize(labelKey),
      entries: (data[kind] ?? []).map(entry => ({
        id: entry.id,
        kind,
        name: entry.name,
        enabled: entry.enabled !== false,
        categoryLabel: entryCategoryLabel(kind, entry),
        sourceName: entry.sourceName
      }))
    }));

    return {
      groups,
      hasAny: groups.some(g => g.entries.length),
      resyncTooltip: game.i18n.localize("ENCOUNTERFORGE.CustomContent.ReSyncTooltip")
    };
  }

  static async _onToggleEnabled(_event, target) {
    const { id, kind } = target.dataset;
    await setCustomEntryEnabled(kind, id, target.checked);
  }

  static _onResync(_event, target) {
    const { id, kind } = target.dataset;
    const entry = (getCustomContent()[kind] ?? []).find(e => e.id === id);
    if (!entry) return;

    const dialog = new EncounterForgeExportDialog({ entry });
    Hooks.once("closeEncounterForgeExportDialog", () => this.render());
    dialog.render(true);
  }

  static _onDelete(_event, target) {
    const { id, kind } = target.dataset;
    const entry = (getCustomContent()[kind] ?? []).find(e => e.id === id);
    if (!entry) return;

    Dialog.confirm({
      title: game.i18n.localize("ENCOUNTERFORGE.CustomContent.DeleteConfirmTitle"),
      content: `<p>${game.i18n.format("ENCOUNTERFORGE.CustomContent.DeleteConfirmBody", { name: entry.name })}</p>`,
      yes: async () => {
        await deleteCustomEntry(kind, id);
        this.render();
      }
    });
  }

  // Downloads the world's entire custom content pool as a JSON file, so it can
  // be shared with, and imported into, another world.
  static _onExport(_event, _target) {
    const payload = exportCustomContent();
    const totalEntries = Object.values(payload.data).reduce((sum, list) => sum + list.length, 0);
    if (!totalEntries) {
      ui.notifications.warn(game.i18n.localize("ENCOUNTERFORGE.CustomContent.ExportEmpty"));
      return;
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `encounter-forge-custom-content-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // Opens a file picker for a previously exported JSON file and merges its
  // entries into this world's custom content pools as new entries.
  static _onImport(_event, _target) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;

      try {
        const payload = JSON.parse(await file.text());
        const imported = await importCustomContent(payload);
        if (imported > 0) {
          ui.notifications.info(game.i18n.format("ENCOUNTERFORGE.CustomContent.ImportSuccess", { count: imported }));
          this.render();
        } else {
          ui.notifications.warn(game.i18n.localize("ENCOUNTERFORGE.CustomContent.ImportEmpty"));
        }
      } catch (err) {
        console.error("Encounter Forge | Failed to import custom content", err);
        ui.notifications.error(game.i18n.localize("ENCOUNTERFORGE.CustomContent.ImportError"));
      }
    });
    input.click();
  }

  static _onClose(_event, _target) {
    this.close();
  }
}
