const MODULE_ID = "encounter-forge";
const UPDATE_REPO = "ElemorSeru/encounter-forge";
const UPDATE_CACHE_HOURS = 12;
const UPDATE_MAIN_WINDOW_CLASS = "EncounterForgeDialog";
const UPDATE_MAIN_WINDOW_ID = "encounter-forge-dialog";

let updateInfo = null;

function updateCompareVersions(a, b) {
  const pa = String(a ?? "").replace(/^v/i, "").split(".").map(n => parseInt(n, 10) || 0);
  const pb = String(b ?? "").replace(/^v/i, "").split(".").map(n => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0, y = pb[i] ?? 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

function updateEscapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function updateMarkdownToHtml(md) {
  const lines = String(md ?? "").replace(/\r\n/g, "\n").split("\n");
  let html = "";
  let inList = false;
  for (const raw of lines) {
    const trimmed = raw.trim();
    const escaped = updateEscapeHtml(trimmed).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
    if (/^#{1,3}\s+/.test(trimmed)) {
      if (inList) { html += "</ul>"; inList = false; }
      html += `<h4>${escaped.replace(/^#{1,3}\s+/, "")}</h4>`;
    } else if (/^[-*]\s+/.test(trimmed)) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${escaped.replace(/^[-*]\s+/, "")}</li>`;
    } else if (trimmed === "") {
      if (inList) { html += "</ul>"; inList = false; }
    } else {
      if (inList) { html += "</ul>"; inList = false; }
      html += `<p>${escaped}</p>`;
    }
  }
  if (inList) html += "</ul>";
  return html;
}

async function updateFetchReleases() {
  const res = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases`, {
    headers: { Accept: "application/vnd.github+json" }
  });
  if (!res.ok) throw new Error("github releases request failed: " + res.status);
  return await res.json();
}

async function checkForUpdate() {
  const installed = game.modules.get(MODULE_ID)?.version;
  if (!installed) return null;

  const cached = game.settings.get(MODULE_ID, "updateCheckCache");
  const now = Date.now();
  if (cached?.checkedAt && cached.installedVersion === installed && (now - cached.checkedAt) < UPDATE_CACHE_HOURS * 3600 * 1000) {
    return cached.result ?? null;
  }

  let releases;
  try {
    releases = await updateFetchReleases();
  } catch (err) {
    console.warn("[encounter-forge] update check failed:", err);
    return cached?.result ?? null;
  }

  const newer = [];
  for (const rel of Array.isArray(releases) ? releases : []) {
    if (rel.draft) continue;
    const tag = rel.tag_name ?? rel.name ?? "";
    if (updateCompareVersions(tag, installed) <= 0) break;
    newer.push({ version: tag, date: rel.published_at, body: rel.body ?? "" });
  }

  const result = newer.length ? { latest: newer[0].version, releases: newer } : null;
  await game.settings.set(MODULE_ID, "updateCheckCache", { checkedAt: now, installedVersion: installed, result });
  return result;
}

function updateResolveDialogClass() {
  return foundry.applications?.api?.DialogV2;
}

function updateBuildChangelogContent(info) {
  let html = '<div class="ef-update-changelog">';
  for (const rel of info.releases) {
    const dateStr = rel.date ? new Date(rel.date).toLocaleDateString(game.i18n.lang, { year: "numeric", month: "short", day: "numeric" }) : "";
    html += `<div class="ef-update-release">
      <div class="ef-update-release-head">
        <span class="ef-update-version">${updateEscapeHtml(rel.version)}</span>
        <span class="ef-update-date">${updateEscapeHtml(dateStr)}</span>
      </div>
      ${updateMarkdownToHtml(rel.body || game.i18n.localize("ENCOUNTERFORGE.UpdateCheck.NoNotes"))}
    </div>`;
  }
  html += `<div class="ef-update-foot"><a href="https://github.com/${UPDATE_REPO}/releases" target="_blank" rel="noopener">${game.i18n.localize("ENCOUNTERFORGE.UpdateCheck.ViewHistory")}</a></div>`;
  html += "</div>";
  return html;
}

async function openChangelogPanel(info) {
  if (!info) return;
  const DialogClass = updateResolveDialogClass();
  if (!DialogClass) {
    console.error(`[${MODULE_ID}] DialogV2 unavailable, cannot show changelog panel.`);
    return;
  }
  await DialogClass.wait({
    classes: ["ef-update-dialog"],
    window: { title: game.i18n.localize("ENCOUNTERFORGE.UpdateCheck.Title"), resizable: true },
    position: { width: 480, height: 520 },
    content: updateBuildChangelogContent(info),
    buttons: [
      { action: "close", label: game.i18n.localize("ENCOUNTERFORGE.UpdateCheck.Close"), default: true, callback: () => true }
    ],
    rejectClose: false
  });
}

function injectUpdateBadge(app, element) {
  const el = element instanceof HTMLElement ? element : (element?.[0] ?? app?.element);
  const header = el?.querySelector?.(".window-header");
  const closeBtn = header?.querySelector?.('button[data-action="close"]');
  if (!header || !closeBtn) return;

  const existing = header.querySelector(".ef-update-badge");
  if (existing) existing.remove();
  if (!updateInfo) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "header-control fa-solid fa-arrows-rotate icon ef-update-badge";
  btn.dataset.tooltip = game.i18n.format("ENCOUNTERFORGE.UpdateCheck.Tooltip", { version: updateInfo.latest });
  btn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    openChangelogPanel(updateInfo);
  });
  closeBtn.insertAdjacentElement("beforebegin", btn);
}

function refreshUpdateSurfaces() {
  const mainApp = foundry.applications?.instances?.get?.(UPDATE_MAIN_WINDOW_ID);
  if (mainApp) injectUpdateBadge(mainApp, mainApp.element);
}

function updateBuildDebugFakeInfo() {
  const versions = ["9.9.9", "9.9.8", "9.9.7", "9.9.6", "9.9.5"];
  const sections = [
    { heading: "Added", items: ["New feature entry with a longer description to check text wrapping inside the changelog panel.", "Second bullet point for this release.", "Third bullet point, just to pad things out a bit more."] },
    { heading: "Fixed", items: ["Fixed a bug where something didn't behave as expected.", "Fixed another edge case found during testing."] },
    { heading: "Changed", items: ["Changed some internal behavior that shouldn't be user-visible."] }
  ];
  const releases = versions.map((v, i) => {
    const date = new Date(Date.now() - i * 7 * 24 * 3600 * 1000).toISOString();
    const body = sections.map(s => `### ${s.heading}\n` + s.items.map(item => `- ${item}`).join("\n")).join("\n\n");
    return { version: `v${v}`, date, body };
  });
  return { latest: releases[0].version, releases };
}

function debugPreviewUpdate(fakeInfo) {
  updateInfo = fakeInfo ?? updateBuildDebugFakeInfo();
  refreshUpdateSurfaces();
}

export function registerUpdateChecker() {
  Hooks.on(`render${UPDATE_MAIN_WINDOW_CLASS}`, (app, element) => injectUpdateBadge(app, element));

  game.settings.register(MODULE_ID, "updateCheckCache", {
    scope: "client",
    config: false,
    type: Object,
    default: null,
  });

  Hooks.once("ready", async () => {
    const mod = game.modules.get(MODULE_ID);
    if (mod) {
      mod.api = mod.api ?? {};
      mod.api.debugPreviewUpdate = debugPreviewUpdate;
    }
    if (!game.user.isGM) return;
    updateInfo = await checkForUpdate();
    if (updateInfo) refreshUpdateSurfaces();
  });
}
