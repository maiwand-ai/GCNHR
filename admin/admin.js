// GCNHR website admin.
// Reads and writes content/content.js (and uploaded images) in the GitHub
// repository through the GitHub API. GitHub Pages then republishes the site.

const REPO = detectRepo();
const CONTENT_PATH = "content/content.js";
const UPLOAD_DIR = "assets/uploads";
const TOKEN_KEY = "gcnhr-admin-token";
const PREVIEW_KEY = "gcnhr-preview";
const API = "https://api.github.com";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "fa", label: "دری", rtl: true },
  { code: "ps", label: "پښتو", rtl: true },
  { code: "uz", label: "Oʻzbekcha" },
];

const SECTIONS = [
  ["Header and menu", /^(skip|brandName|menu|nav)/],
  ["Top banner", /^(hero|badge)/],
  ["About", /^(about|fact)/],
  ["Mission and objectives", /^(mission|obj)/],
  ["Quote", /^quote/],
  ["Activities", /^(work|act\d)/],
  ["Photo gallery", /^(gallery|g\d)/],
  ["International Geneva", /^(geneva|gl\d)/],
  ["Principles", /^(prin|p\d)/],
  ["Governance", /^gov/],
  ["Get involved", /^inv/],
  ["Contact and form", /^(contact|form|topic)/],
  ["Footer", /^(footer|rights|backTop)/],
  ["Other", /./],
];

const IMAGE_SLOTS = [
  { key: "hero", label: "Top banner", where: "Large background photo at the top of the page.", max: 2000 },
  { key: "about", label: "About section", where: "Portrait photo next to “Who we are”.", max: 1400 },
  { key: "logo", label: "Logo", where: "Logo card in About and in the footer.", max: 640, square: true },
  { key: "emblem", label: "Header emblem", where: "Round emblem in the header. Use a square image.", max: 256, square: true },
  { key: "objWomen", label: "Objective 1 photo", where: "Afghan women's human rights card.", max: 1200 },
  { key: "objChildren", label: "Objective 5 photo", where: "Children's rights card.", max: 1200 },
  { key: "quote", label: "Quote background", where: "Full-width photo behind the quote.", max: 2000 },
  { key: "gallery1", label: "Gallery photo 1", where: "Tall photo on the left of the gallery.", max: 1400 },
  { key: "gallery2", label: "Gallery photo 2", where: "Wide photo, top row.", max: 1400 },
  { key: "gallery3", label: "Gallery photo 3", where: "Small photo, top right.", max: 1200 },
  { key: "gallery4", label: "Gallery photo 4", where: "Small photo, bottom row.", max: 1200 },
  { key: "gallery5", label: "Gallery photo 5", where: "Wide photo, bottom right.", max: 1400 },
  { key: "geneva", label: "International Geneva", where: "Photo next to the Geneva section.", max: 1400 },
  { key: "involve1", label: "Get involved: membership", where: "Photo on the “Become a member” card.", max: 1200 },
  { key: "involve2", label: "Get involved: partnership", where: "Photo on the “Partner with us” card.", max: 1200 },
  { key: "involve3", label: "Get involved: support", where: "Photo on the “Support our work” card.", max: 1200 },
];

const state = {
  token: null,
  original: null,   // content as loaded from GitHub
  draft: null,      // content being edited
  contentSha: null, // blob sha of content.js when loaded
  pendingImages: {}, // slot -> { blob, ext, url }
  lang: "en",
  query: "",
};

const $ = (sel) => document.querySelector(sel);

/* ---------------- Repository / API ---------------- */

function detectRepo() {
  const host = location.hostname;
  if (host.endsWith(".github.io")) {
    const owner = host.replace(".github.io", "");
    const name = location.pathname.split("/").filter(Boolean)[0];
    if (name && name !== "admin") return { owner, name, branch: "main" };
  }
  return { owner: "maiwand-ai", name: "GCNHR", branch: "main" };
}

async function gh(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${state.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try { message = (await res.json()).message || message; } catch { /* keep status text */ }
    const error = new Error(message);
    error.status = res.status;
    throw error;
  }
  return res.status === 204 ? null : res.json();
}

const repoPath = (suffix) => `/repos/${REPO.owner}/${REPO.name}${suffix}`;

function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
const utf8ToBase64 = (text) => bytesToBase64(new TextEncoder().encode(text));
const base64ToUtf8 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), (c) => c.charCodeAt(0)));
const blobToBase64 = async (blob) => bytesToBase64(new Uint8Array(await blob.arrayBuffer()));

function parseContentFile(source) {
  const match = source.match(/window\.SITE_CONTENT\s*=\s*([\s\S]*?);?\s*$/);
  if (!match) throw new Error("content/content.js is not in the expected format.");
  return JSON.parse(match[1]);
}

function serializeContent(content) {
  return `// GCNHR site content. Edit it from /admin, or by hand. The part after "=" must stay valid JSON.\nwindow.SITE_CONTENT = ${JSON.stringify(content, null, 2)};\n`;
}

async function loadContent() {
  const file = await gh(repoPath(`/contents/${CONTENT_PATH}?ref=${REPO.branch}`));
  state.contentSha = file.sha;
  state.original = parseContentFile(base64ToUtf8(file.content));
  state.original.settings ||= {};
  state.original.settings.stats ||= {};
  state.original.images ||= {};
  state.original.text ||= {};
  LANGUAGES.forEach(({ code }) => { state.original.text[code] ||= {}; });
  state.draft = structuredClone(state.original);
  state.pendingImages = {};
}

/* ---------------- Sign in ---------------- */

function readToken() {
  try { return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

function saveToken(token, remember) {
  try {
    (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
  } catch { /* storage unavailable: token lives in memory only */ }
}

function clearToken() {
  try { sessionStorage.removeItem(TOKEN_KEY); localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

async function signIn(token) {
  state.token = token;
  const repo = await gh(repoPath(""));
  if (!repo.permissions || !repo.permissions.push) {
    throw new Error("This token can read the repository but cannot change it. Give it Contents: Read and write.");
  }
  REPO.branch = repo.default_branch || REPO.branch;
  await loadContent();
}

$("#repo-name").textContent = `${REPO.owner}/${REPO.name}`;

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const token = $("#token").value.trim();
  const button = event.submitter || $("#login-form .btn");
  $("#login-error").textContent = "";
  button.disabled = true;
  button.textContent = "Signing in…";
  try {
    await signIn(token);
    saveToken(token, $("#remember").checked);
    showApp();
  } catch (error) {
    state.token = null;
    $("#login-error").textContent = error.status === 401
      ? "This token was not accepted. Check that it is complete and has not expired."
      : error.status === 404
        ? `The repository ${REPO.owner}/${REPO.name} was not found, or this token has no access to it.`
        : error.message;
  } finally {
    button.disabled = false;
    button.textContent = "Sign in";
  }
});

$("#logout-btn").addEventListener("click", () => {
  if (isDirty() && !confirm("You have unpublished changes. Sign out and discard them?")) return;
  clearToken();
  location.reload();
});

/* ---------------- Editor shell ---------------- */

function showApp() {
  $("#login-view").hidden = true;
  $("#app-view").hidden = false;
  $("#history-link").href = `https://github.com/${REPO.owner}/${REPO.name}/commits/${REPO.branch}`;
  renderLangTabs();
  renderTexts();
  renderImages();
  renderSettings();
  updateStatus();
}

document.querySelectorAll("[data-tab]").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll("[data-tab]").forEach((t) => t.setAttribute("aria-selected", String(t === tab)));
    ["texts", "images", "settings"].forEach((name) => { $(`#panel-${name}`).hidden = name !== tab.dataset.tab; });
  });
});

function isDirty() {
  if (!state.draft) return false;
  return Object.keys(state.pendingImages).length > 0 || JSON.stringify(state.draft) !== JSON.stringify(state.original);
}

function countChanges() {
  let count = Object.keys(state.pendingImages).length;
  const { draft, original } = state;
  LANGUAGES.forEach(({ code }) => {
    const keys = new Set([...Object.keys(draft.text[code] || {}), ...Object.keys(original.text[code] || {})]);
    keys.forEach((k) => { if ((draft.text[code][k] || "") !== (original.text[code][k] || "")) count++; });
  });
  if (JSON.stringify(draft.settings) !== JSON.stringify(original.settings)) count++;
  return count;
}

function updateStatus(message, kind) {
  const status = $("#status");
  const dirty = isDirty();
  $("#publish-btn").disabled = !dirty;
  if (message) {
    status.textContent = message;
    status.className = `status ${kind || ""}`;
  } else if (dirty) {
    const n = countChanges();
    status.textContent = `${n} unpublished change${n === 1 ? "" : "s"}`;
    status.className = "status dirty";
  } else {
    status.textContent = "All changes published";
    status.className = "status";
  }
}

function showNotice(html, kind) {
  const notice = $("#notice");
  notice.innerHTML = html;
  notice.className = `notice ${kind || ""}`;
  notice.hidden = false;
}

window.addEventListener("beforeunload", (event) => {
  if (isDirty()) { event.preventDefault(); event.returnValue = ""; }
});

/* ---------------- Texts ---------------- */

function fieldLabel(key) {
  const rules = [
    [/^obj(\d)t$/, "Objective $1: title"], [/^obj(\d)d$/, "Objective $1: description"],
    [/^act(\d)t$/, "Activity $1: title"], [/^act(\d)d$/, "Activity $1: description"],
    [/^p(\d)t$/, "Principle $1: title"], [/^p(\d)d$/, "Principle $1: description"],
    [/^gov(\d)t$/, "Body $1: name"], [/^gov(\d)d$/, "Body $1: description"],
    [/^inv(\d)t$/, "Card $1: title"], [/^inv(\d)d$/, "Card $1: description"], [/^inv(\d)c$/, "Card $1: link text"],
    [/^g(\d)$/, "Gallery caption $1"], [/^gl(\d)$/, "List item $1"], [/^fact(\d)$/, "Figure $1 label"],
    [/^nav(\w+)$/, "Menu link: $1"], [/^badge(\d)$/, "Badge $1"], [/^heroCta(\d)$/, "Button $1"], [/^topic(\w+)$/, "Subject option: $1"],
  ];
  for (const [re, label] of rules) if (re.test(key)) return key.replace(re, label);
  return key
    .replace(/Cta/g, " button")
    .replace(/Eyebrow/g, " small heading")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/ ([A-Z])/g, (m, c) => ` ${c.toLowerCase()}`);
}

function renderLangTabs() {
  const wrap = $("#lang-tabs");
  wrap.innerHTML = "";
  LANGUAGES.forEach(({ code, label }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.lang = code;
    btn.textContent = label;
    btn.setAttribute("aria-pressed", String(code === state.lang));
    btn.addEventListener("click", () => { state.lang = code; renderLangTabs(); renderTexts(); });
    wrap.append(btn);
  });
}

function renderTexts() {
  const container = $("#text-sections");
  const openSections = new Set([...container.querySelectorAll("details[open]")].map((d) => d.dataset.section));
  container.innerHTML = "";
  const lang = LANGUAGES.find((l) => l.code === state.lang);
  const english = state.draft.text.en;
  const keys = Object.keys(english);
  const query = state.query.toLowerCase();
  const used = new Set();
  let shown = 0;

  SECTIONS.forEach(([title, re], index) => {
    const sectionKeys = keys.filter((k) => !used.has(k) && re.test(k));
    sectionKeys.forEach((k) => used.add(k));
    const visible = sectionKeys.filter((k) => !query
      || k.toLowerCase().includes(query)
      || fieldLabel(k).toLowerCase().includes(query)
      || (english[k] || "").toLowerCase().includes(query)
      || (state.draft.text[lang.code][k] || "").toLowerCase().includes(query));
    if (!visible.length) return;
    shown += visible.length;

    const details = document.createElement("details");
    details.className = "text-section";
    details.dataset.section = title;
    details.open = Boolean(query) || openSections.has(title) || (openSections.size === 0 && index === 0);
    const summary = document.createElement("summary");
    summary.innerHTML = `<span></span><span class="count"></span>`;
    summary.firstChild.textContent = title;
    summary.lastChild.textContent = `${visible.length} text${visible.length === 1 ? "" : "s"}`;
    details.append(summary);

    visible.forEach((key) => details.append(textField(key, lang)));
    container.append(details);
  });

  if (!shown) container.innerHTML = `<p class="empty">No texts match your search.</p>`;
}

function textField(key, lang) {
  const field = document.createElement("div");
  field.className = "field";
  const id = `t-${lang.code}-${key}`;
  const value = state.draft.text[lang.code][key] || "";
  const reference = state.draft.text.en[key] || "";

  const label = document.createElement("label");
  label.htmlFor = id;
  label.textContent = fieldLabel(key);
  const keyHint = document.createElement("span");
  keyHint.className = "key";
  keyHint.textContent = key;
  label.append(keyHint);

  const long = Math.max(value.length, reference.length) > 70;
  const input = document.createElement(long ? "textarea" : "input");
  input.id = id;
  input.value = value;
  if (long) input.rows = Math.min(6, Math.ceil(Math.max(value.length, reference.length) / 90) + 1);
  if (lang.rtl) { input.classList.add("rtl-field"); input.dir = "rtl"; }
  if (lang.code !== "en" && !value) input.placeholder = "Not translated yet; the English text is shown instead.";

  const markChanged = () => field.classList.toggle("changed", (state.draft.text[lang.code][key] || "") !== (state.original.text[lang.code][key] || ""));
  input.addEventListener("input", () => {
    state.draft.text[lang.code][key] = input.value;
    markChanged();
    updateStatus();
  });
  markChanged();

  field.append(label, input);
  if (lang.code !== "en") {
    const ref = document.createElement("p");
    ref.className = "ref";
    ref.innerHTML = "<b>English:</b> ";
    ref.append(document.createTextNode(reference));
    field.append(ref);
  }
  return field;
}

let searchTimer;
$("#search").addEventListener("input", (event) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.query = event.target.value.trim(); renderTexts(); }, 150);
});

/* ---------------- Images ---------------- */

function imageUrl(slot) {
  const pending = state.pendingImages[slot];
  if (pending) return pending.url;
  const path = state.draft.images[slot];
  return path ? `../${path}` : "";
}

function renderImages() {
  const grid = $("#image-grid");
  grid.innerHTML = "";
  IMAGE_SLOTS.forEach((slot) => {
    const card = document.createElement("article");
    card.className = `image-card${slot.square ? " square" : ""}${state.pendingImages[slot.key] ? " changed" : ""}`;
    card.innerHTML = `
      <div class="thumb">${state.pendingImages[slot.key] ? '<span class="badge">New, not published</span>' : ""}</div>
      <div class="body">
        <h3></h3><p></p>
        <div class="actions">
          <label class="btn btn-ghost"><input type="file" accept="image/*">Replace…</label>
          ${state.pendingImages[slot.key] ? '<button class="btn btn-link" type="button" data-undo>Undo</button>' : ""}
        </div>
      </div>`;
    card.querySelector(".thumb").style.backgroundImage = `url("${imageUrl(slot.key)}")`;
    card.querySelector("h3").textContent = slot.label;
    card.querySelector("p").textContent = slot.where;
    card.querySelector("input").addEventListener("change", (event) => {
      const file = event.target.files[0];
      if (file) replaceImage(slot, file);
    });
    card.querySelector("[data-undo]")?.addEventListener("click", () => {
      URL.revokeObjectURL(state.pendingImages[slot.key].url);
      delete state.pendingImages[slot.key];
      state.draft.images[slot.key] = state.original.images[slot.key];
      renderImages();
      updateStatus();
    });
    grid.append(card);
  });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("This file could not be read as an image.")); };
    img.src = url;
  });
}

const canvasToBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

async function optimiseImage(file, slot) {
  const img = await loadImage(file);
  const scale = Math.min(1, slot.max / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!slot.square) { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  let blob = await canvasToBlob(canvas, "image/webp", 0.82);
  if (blob && blob.type === "image/webp") return { blob, ext: "webp" };
  blob = slot.square ? await canvasToBlob(canvas, "image/png") : await canvasToBlob(canvas, "image/jpeg", 0.85);
  return { blob, ext: slot.square ? "png" : "jpg" };
}

async function replaceImage(slot, file) {
  updateStatus("Optimising image…");
  try {
    const { blob, ext } = await optimiseImage(file, slot);
    if (state.pendingImages[slot.key]) URL.revokeObjectURL(state.pendingImages[slot.key].url);
    const path = `${UPLOAD_DIR}/${slot.key}-${Date.now()}.${ext}`;
    state.pendingImages[slot.key] = { blob, path, url: URL.createObjectURL(blob) };
    state.draft.images[slot.key] = path;
    renderImages();
    updateStatus();
  } catch (error) {
    updateStatus();
    showNotice(`Could not use that image: ${escapeHtml(error.message)}`, "error");
  }
}

/* ---------------- Settings ---------------- */

function renderSettings() {
  document.querySelectorAll("[data-setting]").forEach((input) => {
    input.value = state.draft.settings[input.dataset.setting] || (input.tagName === "SELECT" ? "en" : "");
    input.oninput = () => { state.draft.settings[input.dataset.setting] = input.value.trim(); updateStatus(); };
  });
  document.querySelectorAll("[data-stat]").forEach((input) => {
    input.value = state.draft.settings.stats[input.dataset.stat] || "";
    input.oninput = () => { state.draft.settings.stats[input.dataset.stat] = input.value.trim(); updateStatus(); };
  });
}

/* ---------------- Preview ---------------- */

$("#preview-btn").addEventListener("click", () => {
  const preview = structuredClone(state.draft);
  Object.entries(state.pendingImages).forEach(([slot, { url }]) => { preview.images[slot] = url; });
  try {
    localStorage.setItem(PREVIEW_KEY, JSON.stringify(preview));
  } catch {
    showNotice("Preview needs browser storage, which is blocked here. You can still publish.", "error");
    return;
  }
  window.open(`../?preview=1&lang=${state.lang}`, "_blank");
});

/* ---------------- Publish ---------------- */

$("#publish-btn").addEventListener("click", publish);

async function publish() {
  const button = $("#publish-btn");
  button.disabled = true;
  updateStatus("Publishing…");
  try {
    // Make sure nobody else changed the content since we loaded it.
    const current = await gh(repoPath(`/contents/${CONTENT_PATH}?ref=${REPO.branch}`));
    if (current.sha !== state.contentSha
      && !confirm("Someone else published changes since you opened the admin. Publishing now will replace their text changes with yours. Continue?")) {
      updateStatus();
      return;
    }

    const ref = await gh(repoPath(`/git/ref/heads/${REPO.branch}`));
    const baseCommit = await gh(repoPath(`/git/commits/${ref.object.sha}`));

    const files = [];
    for (const { blob, path } of Object.values(state.pendingImages)) {
      const created = await gh(repoPath("/git/blobs"), { method: "POST", body: JSON.stringify({ content: await blobToBase64(blob), encoding: "base64" }) });
      files.push({ path, mode: "100644", type: "blob", sha: created.sha });
    }
    const contentBlob = await gh(repoPath("/git/blobs"), {
      method: "POST",
      body: JSON.stringify({ content: utf8ToBase64(serializeContent(state.draft)), encoding: "base64" }),
    });
    files.push({ path: CONTENT_PATH, mode: "100644", type: "blob", sha: contentBlob.sha });

    const tree = await gh(repoPath("/git/trees"), { method: "POST", body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree: files }) });
    const changes = countChanges();
    const commit = await gh(repoPath("/git/commits"), {
      method: "POST",
      body: JSON.stringify({
        message: `Update website content from admin (${changes} change${changes === 1 ? "" : "s"})`,
        tree: tree.sha,
        parents: [ref.object.sha],
      }),
    });
    await gh(repoPath(`/git/refs/heads/${REPO.branch}`), { method: "PATCH", body: JSON.stringify({ sha: commit.sha }) });

    Object.values(state.pendingImages).forEach(({ url }) => URL.revokeObjectURL(url));
    await loadContent();
    renderTexts();
    renderImages();
    renderSettings();
    updateStatus("Published", "ok");
    showNotice(`Published. The live site updates in about 1–2 minutes: <a href="../" target="_blank" rel="noopener">open the website ↗</a>. If you still see the old version, refresh the page after a few minutes.`, "ok");
  } catch (error) {
    updateStatus();
    showNotice(`Publishing failed: ${escapeHtml(error.message)}. Your changes are still here; try again.`, "error");
  } finally {
    button.disabled = !isDirty();
  }
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/* ---------------- Start ---------------- */

(async () => {
  const saved = readToken();
  if (!saved) return;
  try {
    await signIn(saved);
    showApp();
  } catch {
    clearToken();
    state.token = null;
  }
})();
