export async function loadJson(relPath) {
  const lang = (game.i18n?.lang ?? "en").split("-")[0].toLowerCase();
  if (lang !== "en") {
    try {
      const res = await fetch(`modules/encounter-forge/data/${lang}/${relPath}`);
      if (res.ok) return res.json();
    } catch { /* language folder is missing so fall through the code */ }
  }
  const res = await fetch(`modules/encounter-forge/data/en/${relPath}`);
  if (!res.ok) throw new Error(`Encounter Forge | Failed to load data/en/${relPath}`);
  return res.json();
}
