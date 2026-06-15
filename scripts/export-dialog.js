import { VALID_DAMAGE_TYPES } from "./actor-creator.js";
import { addCustomEntry, updateCustomEntry, deleteCustomEntry } from "./custom-content.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const THEMES = ["any", "beast", "undead", "aberration", "humanoid", "elemental", "fiend", "fey", "construct", "dragon"];
const CHASSIS_TYPES = ["any", "brute", "lurker", "skirmisher", "controller", "artillery", "leader"];
const TRAIT_CATEGORIES = ["defensive", "offensive", "movement", "senses", "passive", "reactions", "legendary"];
const ACTION_CATEGORIES = ["melee", "ranged", "special"];
const ACTION_TYPES = ["mwak", "rwak", "msak", "rsak", "save", "util"];
const LEGENDARY_TYPES = ["none", "action", "lair", "resistance"];

// Returns an item's activities as a plain array regardless of whether system.activities is a Foundry Collection, a Map, or a plain object.
function getActivities(item) {
  const activities = item.system?.activities;
  if (!activities) return [];
  if (typeof activities.contents !== "undefined") return activities.contents;
  if (typeof activities.values === "function") return [...activities.values()];
  if (Array.isArray(activities)) return activities;
  return Object.values(activities);
}

// Removes roll-data modifiers (@mod) so the remaining dice formula can be parsed by diceAverage() for DPR estimation.
function stripRollDataModifiers(formula) {
  return String(formula ?? "").replace(/\s*\+\s*@[a-zA-Z0-9._]+/g, "").trim();
}

function extractDamageType(types) {
  if (types instanceof Set) return [...types][0];
  if (Array.isArray(types)) return types[0];
  if (types && typeof types === "object") return Object.keys(types).find(key => types[key]);
  return undefined;
}

function extractDamageFallback(item) {
  for (const activity of getActivities(item)) {
    const part = activity.damage?.parts?.[0];
    if (!part) continue;
    const formula = stripRollDataModifiers(part.base?.formula ?? part.formula ?? "");
    if (!formula) continue;
    const damageType = extractDamageType(part.base?.types ?? part.types);
    return [formula, damageType || "bludgeoning"];
  }
  return null;
}

function extractActionType(item) {
  for (const activity of getActivities(item)) {
    if (activity.type === "attack") {
      const isRanged = activity.attack?.type?.value === "ranged";
      const isSpell = activity.attack?.type?.classification === "spell";
      if (isSpell) return isRanged ? "rsak" : "msak";
      return isRanged ? "rwak" : "mwak";
    }
    if (activity.type === "save") return "save";
  }
  return "util";
}

function extractRange(item) {
  for (const activity of getActivities(item)) {
    if (activity.range?.value) return { value: activity.range.value, long: activity.range.long ?? null };
  }
  return { value: null, long: null };
}

// Pulls everything export/ReSync needs from a live Foundry item
function extractItemSnapshot(item) {
  const damageFallback = extractDamageFallback(item);
  const range = extractRange(item);

  return {
    sourceUuid: item.uuid,
    sourceName: item.name,
    itemType: item.type,
    name: item.name,
    description: item.system?.description?.value ?? "",
    damage_fallback: damageFallback,
    action_type: extractActionType(item),
    range: range.value,
    range_long: range.long,
    school: item.system?.school ?? null,
    cantrip: (item.system?.level ?? 0) === 0,
    _fullClone: item.toObject()
  };
}

function defaultCategory(kind, snapshot) {
  if (kind !== "action") return "passive";
  const actionType = snapshot?.action_type;
  if (actionType === "mwak" || actionType === "msak") return "melee";
  if (actionType === "rwak" || actionType === "rsak") return "ranged";
  return "special";
}

function buildOptions(values, prefix, current) {
  return values.map(value => ({
    value,
    label: game.i18n.localize(`${prefix}.${value.charAt(0).toUpperCase() + value.slice(1)}`),
    selected: value === current
  }));
}

// Builds spell school options from dnd5e's own config so labels stay consistent with the rest of the game's localization.
function buildSchoolOptions(current) {
  const schools = CONFIG.DND5E?.spellSchools ?? {};
  return Object.entries(schools).map(([value, data]) => ({
    value,
    label: game.i18n.localize(data.label ?? value),
    selected: value === current
  }));
}

export default class EncounterForgeExportDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "encounter-forge-export-dialog",
    classes: ["encounter-forge"],
    tag: "form",
    form: {
      handler: EncounterForgeExportDialog._onSubmit,
      closeOnSubmit: true
    },
    window: {
      title: "ENCOUNTERFORGE.Export.Title",
      icon: "fas fa-file-export",
      resizable: true
    },
    position: { width: 640, height: "auto" },
    actions: {
      closeDialog: EncounterForgeExportDialog._onClose
    }
  };

  static PARTS = {
    form: {
      template: "modules/encounter-forge/templates/export-dialog.hbs"
    }
  };

  // Pass the item to export a live Foundry item for the first time, or { entry } to ReSync/edit an existing custom-content entry.
  constructor({ item = null, entry = null } = {}, options = {}) {
    super(options);
    this.sourceItem = item;
    this.entry = entry;
    this.snapshot = null;
    this.sourceMissing = false;
  }

  async _prepareContext(_options) {
    let sourceItem = this.sourceItem;

    if (this.entry && !sourceItem) {
      try {
        sourceItem = await fromUuid(this.entry.sourceUuid);
      } catch {
        sourceItem = null;
      }
      if (!sourceItem) this.sourceMissing = true;
    }

    this.snapshot = sourceItem ? extractItemSnapshot(sourceItem) : null;

    const e = this.entry ?? {};
    const s = this.snapshot ?? {};

    const kind = e.kind ?? (s.itemType === "spell" ? "spell" : (s.damage_fallback ? "action" : "trait"));
    const category = e.category ?? defaultCategory(kind, s);
    const isSpell = kind === "spell";

    const name = e.name ?? s.name ?? "";
    const description = e.description ?? s.description ?? "";
    const sourceName = e.sourceName ?? s.sourceName ?? "";

    const legendaryType = e.legendary_type ?? "none";
    const actionType = e.action_type ?? s.action_type ?? "mwak";
    const [damageFormula, damageType] = e.damage_fallback ?? s.damage_fallback ?? ["", "none"];
    const chassisAffinity = e.chassis_affinity ?? ["any"];
    const tags = e.tags ?? [];

    return {
      sourceMissing: this.sourceMissing,
      sourceName,
      isResync: !!this.entry,
      isSpell,
      kindOptions: [
        { value: "trait", label: game.i18n.localize("ENCOUNTERFORGE.Export.KindTrait"), selected: kind === "trait" },
        { value: "action", label: game.i18n.localize("ENCOUNTERFORGE.Export.KindAction"), selected: kind === "action" }
      ],
      kind,
      name,
      description,
      traitCategories: buildOptions(TRAIT_CATEGORIES, "ENCOUNTERFORGE.Category", category),
      actionCategories: buildOptions(ACTION_CATEGORIES, "ENCOUNTERFORGE.Category", category),
      category,
      crMin: e.cr_min ?? "",
      crMax: e.cr_max ?? "",
      crAdjustment: e.cr_adjustment ?? 0,
      legendaryOptions: buildOptions(LEGENDARY_TYPES, "ENCOUNTERFORGE.LegendaryType", legendaryType),
      legendaryCost: e.legendary_cost ?? 1,
      resistanceUses: e.resistance_uses ?? 1,
      actionTypeOptions: buildOptions(ACTION_TYPES, "ENCOUNTERFORGE.ActionType", actionType),
      range: e.range ?? s.range ?? "",
      rangeLong: e.range_long ?? s.range_long ?? "",
      damageFormula,
      damageTypeOptions: buildOptions(["none", ...VALID_DAMAGE_TYPES], "ENCOUNTERFORGE.DamageType", damageType),
      tags: THEMES.map(theme => ({
        value: theme,
        label: game.i18n.localize(`ENCOUNTERFORGE.Theme.${theme.charAt(0).toUpperCase() + theme.slice(1)}`),
        checked: tags.includes(theme)
      })),
      chassisOptions: CHASSIS_TYPES.map(c => ({
        value: c,
        label: game.i18n.localize(`ENCOUNTERFORGE.Chassis.${c.charAt(0).toUpperCase() + c.slice(1)}`),
        checked: chassisAffinity.includes(c)
      })),
      schoolOptions: buildSchoolOptions(e.school ?? s.school ?? "evo"),
      cantrip: e.cantrip ?? s.cantrip ?? false,
      tierMin: e.tier_min ?? 1,
      tierMax: e.tier_max ?? 6
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const root = this.element;

    const kindSelect = root.querySelector('[name="kind"]');
    const traitCategorySelect = root.querySelector('[data-section="trait-category"] select');
    const actionCategorySelect = root.querySelector('[data-section="action-category"] select');

    const getKind = () => context.isSpell ? "spell" : (kindSelect?.value ?? context.kind);
    const getCategory = kind => {
      if (kind === "trait") return traitCategorySelect?.value ?? context.category;
      if (kind === "action") return actionCategorySelect?.value ?? context.category;
      return null;
    };

    const setSection = (name, visible) => {
      root.querySelectorAll(`[data-section="${name}"]`).forEach(section => {
        section.classList.toggle("ef-collapsed", !visible);
        section.querySelectorAll("input, select, textarea").forEach(el => {
          el.disabled = !visible;
        });
      });
    };

    const sync = () => {
      const kind = getKind();
      const category = getCategory(kind);

      setSection("trait", kind === "trait");
      setSection("action", kind === "action");
      setSection("spell", kind === "spell");
      setSection("trait-category", kind === "trait");
      setSection("action-category", kind === "action");
      setSection("legendary", kind === "trait" && category === "legendary");
    };

    kindSelect?.addEventListener("change", sync);
    traitCategorySelect?.addEventListener("change", sync);
    actionCategorySelect?.addEventListener("change", sync);

    sync();
  }

  static async _onSubmit(_event, _form, formData) {
    const data = foundry.utils.expandObject(formData.object);

    const tags = Array.isArray(data.tags) ? data.tags : (data.tags ? [data.tags] : []);
    const chassisAffinity = Array.isArray(data.chassisAffinity)
      ? data.chassisAffinity
      : (data.chassisAffinity ? [data.chassisAffinity] : ["any"]);

    const isSpell = this.entry ? this.entry.kind === "spell" : this.snapshot?.itemType === "spell";
    const kind = isSpell ? "spell" : (data.kind ?? this.entry?.kind ?? "trait");
    const id = this.entry?.id ?? foundry.utils.randomID();

    const entry = {
      id,
      enabled: this.entry?.enabled ?? true,
      kind,
      sourceUuid: this.snapshot?.sourceUuid ?? this.entry?.sourceUuid ?? null,
      sourceName: this.snapshot?.sourceName ?? this.entry?.sourceName ?? data.name,
      name: data.name,
      description: data.description ?? "",
      tags,
      cr_min: data.crMin !== "" && data.crMin !== undefined ? Number(data.crMin) : undefined,
      cr_max: data.crMax !== "" && data.crMax !== undefined ? Number(data.crMax) : undefined,
      _fullClone: this.snapshot?._fullClone ?? this.entry?._fullClone
    };

    if (kind === "trait") {
      entry.category = data.categoryTrait || "passive";
      entry.cr_adjustment = Number(data.crAdjustment) || 0;
      if (entry.category === "legendary" && data.legendaryType && data.legendaryType !== "none") {
        entry.legendary_type = data.legendaryType;
        entry.legendary_cost = Number(data.legendaryCost) || 1;
        if (data.legendaryType === "resistance") entry.resistance_uses = Number(data.resistanceUses) || 1;
      }
    } else if (kind === "action") {
      entry.category = data.categoryAction || "special";
      entry.action_type = data.actionType || "mwak";
      entry.range = data.range !== "" && data.range !== undefined ? Number(data.range) : undefined;
      entry.range_long = data.rangeLong !== "" && data.rangeLong !== undefined ? Number(data.rangeLong) : undefined;
      const actionDamageType = data.damageTypeAction === "none" ? "force" : data.damageTypeAction;
      entry.damage_fallback = data.damageFormulaAction ? [data.damageFormulaAction, actionDamageType] : null;
      entry.chassis_affinity = chassisAffinity;
    } else if (kind === "spell") {
      entry.school = data.school || "evo";
      entry.cantrip = !!data.cantrip;
      entry.tier_min = Number(data.tierMin) || 1;
      entry.tier_max = Number(data.tierMax) || 6;
      const spellDamageType = data.damageTypeSpell === "none" ? "force" : data.damageTypeSpell;
      entry.fallback = {
        type: data.damageFormulaSpell ? (data.actionType === "save" ? "save" : "attack") : "util",
        damage: data.damageFormulaSpell ? [data.damageFormulaSpell, spellDamageType] : ["0", "force"]
      };
    }

    const storageKey = `${kind}s`;

    if (this.entry) {
      const oldStorageKey = `${this.entry.kind}s`;
      if (oldStorageKey !== storageKey) {
        await deleteCustomEntry(oldStorageKey, id);
        await addCustomEntry(storageKey, entry);
      } else {
        await updateCustomEntry(storageKey, id, entry);
      }
      ui.notifications.info(game.i18n.format("ENCOUNTERFORGE.Export.ReSynced", { name: entry.name }));
    } else {
      await addCustomEntry(storageKey, entry);
      ui.notifications.info(game.i18n.format("ENCOUNTERFORGE.Export.Exported", { name: entry.name }));
    }
  }

  static _onClose(_event, _target) {
    this.close();
  }
}
