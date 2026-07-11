const MODULE_ID = "encounter-forge";
const SETTING_KEY = "customContent";
const EXPORT_KINDS = ["traits", "actions", "spells"];
const EXPORT_FORMAT_VERSION = 1;

const _invalidators = [];

function registerCustomContentSetting() {
  game.settings.register(MODULE_ID, SETTING_KEY, {
    scope: "world",
    config: false,
    type: Object,
    default: { traits: [], actions: [], spells: [] }
  });
}

function registerCacheInvalidator(fn) {
  _invalidators.push(fn);
}

function invalidateContentCaches() {
  for (const fn of _invalidators) fn();
}

function getCustomContent() {
  const data = game.settings.get(MODULE_ID, SETTING_KEY) ?? {};
  return {
    traits: data.traits ?? [],
    actions: data.actions ?? [],
    spells: data.spells ?? []
  };
}

async function saveCustomContent(data) {
  await game.settings.set(MODULE_ID, SETTING_KEY, data);
  invalidateContentCaches();
}

function getEnabledCustomEntries(kind) {
  const data = getCustomContent();
  return (data[kind] ?? []).filter(entry => entry.enabled !== false);
}

async function addCustomEntry(kind, entry) {
  const data = getCustomContent();
  data[kind] = [...(data[kind] ?? []), entry];
  await saveCustomContent(data);
  return entry;
}

async function updateCustomEntry(kind, id, updates) {
  const data = getCustomContent();
  const list = data[kind] ?? [];
  const idx = list.findIndex(entry => entry.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...updates };
  await saveCustomContent(data);
  return list[idx];
}

async function deleteCustomEntry(kind, id) {
  const data = getCustomContent();
  data[kind] = (data[kind] ?? []).filter(entry => entry.id !== id);
  await saveCustomContent(data);
}

async function setCustomEntryEnabled(kind, id, enabled) {
  return updateCustomEntry(kind, id, { enabled });
}

function exportCustomContent() {
  const data = getCustomContent();
  const payload = {};
  for (const kind of EXPORT_KINDS) payload[kind] = data[kind] ?? [];

  return {
    encounterForgeCustomContent: true,
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    data: payload
  };
}

async function importCustomContent(payload) {
  if (!payload || typeof payload !== "object" || !payload.data || typeof payload.data !== "object") {
    throw new Error("Not a valid Encounter Forge custom content file.");
  }

  const data = getCustomContent();
  let imported = 0;

  for (const kind of EXPORT_KINDS) {
    const incoming = Array.isArray(payload.data[kind]) ? payload.data[kind] : [];
    if (!incoming.length) continue;

    const clones = incoming.map(entry => {
      const clone = foundry.utils.deepClone(entry);
      clone.id = foundry.utils.randomID();
      clone.enabled = clone.enabled ?? true;
      return clone;
    });

    data[kind] = [...(data[kind] ?? []), ...clones];
    imported += clones.length;
  }

  if (imported > 0) await saveCustomContent(data);
  return imported;
}

export {
  registerCustomContentSetting,
  registerCacheInvalidator,
  invalidateContentCaches,
  getCustomContent,
  saveCustomContent,
  getEnabledCustomEntries,
  addCustomEntry,
  updateCustomEntry,
  deleteCustomEntry,
  setCustomEntryEnabled,
  exportCustomContent,
  importCustomContent
};
