// GCNHR website admin.
// Reads and writes content/content.js (and uploaded images) in the GitHub
// repository through the GitHub API. GitHub Pages then republishes the site.

const GH = window.GCNHRGitHub;
const REPO = GH.detectRepo();
const PREVIEW_KEY = "gcnhr-preview";

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

const IMAGE_SLOTS = GH.IMAGE_SLOTS;

const state = {
  client: null,
  original: null,   // content as loaded from GitHub
  draft: null,      // content being edited
  contentSha: null, // blob sha of content.js when loaded
  pendingImages: {}, // slot -> { blob, ext, url }
  lang: "en",
  query: "",
};

const $ = (sel) => document.querySelector(sel);

/* ---------------- Loading ---------------- */

async function loadContent() {
  const { content, sha } = await state.client.loadContent();
  state.contentSha = sha;
  state.original = content;
  state.draft = structuredClone(content);
  state.pendingImages = {};
}

/* ---------------- Sign in ---------------- */

async function signIn(token) {
  state.client = new GH.Client(token, REPO);
  await state.client.verify();
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
    GH.saveToken(token, $("#remember").checked);
    showApp();
  } catch (error) {
    state.client = null;
    $("#login-error").textContent = GH.describeError(error, REPO);
  } finally {
    button.disabled = false;
    button.textContent = "Sign in";
  }
});

$("#logout-btn").addEventListener("click", () => {
  if (isDirty() && !confirm("You have unpublished changes. Sign out and discard them?")) return;
  GH.clearToken();
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
  renderFeatureItems();
  updateStatus();
}

document.querySelectorAll("[data-tab]").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll("[data-tab]").forEach((t) => t.setAttribute("aria-selected", String(t === tab)));
    ["texts", "images", "settings", "features"].forEach((name) => { $(`#panel-${name}`).hidden = name !== tab.dataset.tab; });
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
  if (JSON.stringify(draft.collections) !== JSON.stringify(original.collections)) count++;
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

async function replaceImage(slot, file) {
  updateStatus("Optimising image…");
  try {
    const prepared = await GH.prepareImage(file, slot.key, slot);
    if (state.pendingImages[slot.key]) URL.revokeObjectURL(state.pendingImages[slot.key].url);
    state.pendingImages[slot.key] = prepared;
    state.draft.images[slot.key] = prepared.path;
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
    const currentSha = await state.client.currentContentSha();
    if (currentSha !== state.contentSha
      && !confirm("Someone else published changes since you opened the admin. Publishing now will replace their text changes with yours. Continue?")) {
      updateStatus();
      return;
    }
    const changes = countChanges();
    await state.client.publish(state.draft, state.pendingImages, `Update website content from admin (${changes} change${changes === 1 ? "" : "s"})`);

    Object.values(state.pendingImages).forEach(({ url }) => URL.revokeObjectURL(url));
    await loadContent();
    renderTexts();
    renderImages();
    renderSettings();
  renderFeatureItems();
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
  const saved = GH.readToken();
  if (!saved) return;
  try {
    await signIn(saved);
    showApp();
  } catch {
    GH.clearToken();
    state.client = null;
  }
})();

/* Public feature content. Requests stay with the connected provider, never GitHub. */
function renderFeatureItems() {
  if (!state.draft) return;
  state.draft.collections ||= {};
  const kind = $("#collection-kind").value;
  const language = $("#collection-language").value;
  const items = state.draft.collections[kind] || [];
  const wrap = $("#collection-items"); wrap.replaceChildren();
  items.forEach((item, index) => {
    const card = document.createElement("div"); card.className = "settings-card";
    const fields = [["title", "Title", "text"], ["description", "Description", "textarea"]];
    if (kind !== "team") fields.push(["date", "Date", "date"]);
    fields.push(["category", kind === "team" ? "Role" : "Category", "text"]);
    if (kind === "events") fields.push(["location", "Location / online", "text"]);
    fields.push(["url", "Public page or document URL", "text"]);
    fields.forEach(([key, title, type]) => {
      const localized = key === "title" || key === "description";
      const label = document.createElement("label"); label.htmlFor = `item-${index}-${key}`; label.textContent = title;
      const input = document.createElement(type === "textarea" ? "textarea" : "input");
      if (type !== "textarea") input.type = type;
      input.id = label.htmlFor;
      input.dir = localized && ["fa", "ps"].includes(language) ? "rtl" : "ltr";
      input.value = localized ? (typeof item[key] === "string" ? (language === "en" ? item[key] : "") : item[key]?.[language] || "") : item[key] || "";
      input.oninput = () => {
        if (localized) {
          if (typeof item[key] === "string") item[key] = {en:item[key]};
          item[key] ||= {}; item[key][language] = input.value;
        } else item[key] = input.value;
        updateStatus();
      };
      card.append(label, input);
    });
    if (kind === "events") {
      const label = document.createElement("label"); label.textContent = " Accept registration enquiries";
      const input = document.createElement("input"); input.type = "checkbox"; input.checked = item.registrationOpen === true;
      input.onchange = () => { item.registrationOpen = input.checked; updateStatus(); }; label.prepend(input); card.append(label);
    }
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "btn btn-link"; remove.textContent = "Remove item";
    remove.onclick = () => {items.splice(index,1); renderFeatureItems(); updateStatus();}; card.append(remove); wrap.append(card);
  });
}
$("#collection-kind").addEventListener("change", renderFeatureItems);
$("#collection-language").addEventListener("change", renderFeatureItems);
$("#add-item").addEventListener("click", () => {
  const kind = $("#collection-kind").value;
  state.draft.collections ||= {}; state.draft.collections[kind] ||= [];
  state.draft.collections[kind].push({title:{en:""}, description:{en:""}, url:""});
  renderFeatureItems(); updateStatus();
});
