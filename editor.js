// On-page editor. Loaded by app.js when someone clicks "Login".
// Lets a signed-in editor change texts and pictures directly on the page and
// publish them to content/content.js through the shared GitHub module.
window.GCNHREditor = (() => {
  const GH = window.GCNHRGitHub;
  const site = window.GCNHRSite;
  const LANG_NAMES = { en: "English", fr: "Français", fa: "دری (Dari)", ps: "پښتو (Pashto)", uz: "Oʻzbekcha (Uzbek)" };
  const RTL = new Set(["fa", "ps"]);
  const SKIP_PICTURE_BUTTON = new Set(["emblem"]); // too small for an overlay; editable in the full admin

  const state = {
    active: false,
    client: null,
    original: null,
    draft: null,
    contentSha: null,
    pendingImages: {},
    popover: null,
  };

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  /* ---------------- Sign in ---------------- */

  async function start() {
    if (state.active) { toolbar?.scrollIntoView({ block: "end" }); return; }
    const saved = GH.readToken();
    if (saved) {
      try {
        await signIn(saved);
        return;
      } catch {
        GH.clearToken();
      }
    }
    showLogin();
  }

  async function signIn(token) {
    const client = new GH.Client(token);
    await client.verify();
    const { content, sha } = await client.loadContent();
    state.client = client;
    state.original = content;
    state.draft = clone(content);
    state.contentSha = sha;
    enterEditMode();
  }

  function showLogin() {
    const overlay = el("div", "gcnhr-ui gcnhr-overlay");
    overlay.innerHTML = `
      <form class="gcnhr-login" role="dialog" aria-modal="true" aria-labelledby="gcnhr-login-title">
        <button class="gcnhr-close" type="button" aria-label="Close">×</button>
        <h2 id="gcnhr-login-title">Sign in to edit the website</h2>
        <p>Use the GitHub access token for this website.</p>
        <label for="gcnhr-token">Access token</label>
        <input id="gcnhr-token" type="password" autocomplete="current-password" placeholder="github_pat_…" required>
        <label class="gcnhr-check"><input type="checkbox" id="gcnhr-remember"> Stay signed in on this device</label>
        <button class="gcnhr-btn gcnhr-btn-primary" type="submit">Sign in</button>
        <p class="gcnhr-error" role="alert"></p>
        <details>
          <summary>How do I get an access token?</summary>
          <ol>
            <li>Sign in to GitHub as the owner of the website repository.</li>
            <li>Open <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Fine-grained tokens → Generate new token</a>.</li>
            <li>Repository access: <em>Only select repositories</em> → the website repository.</li>
            <li>Permissions → Repository permissions → <em>Contents: Read and write</em>.</li>
            <li>Generate, copy and paste it here. Keep it private, like a password.</li>
          </ol>
        </details>
      </form>`;
    document.body.append(overlay);
    const form = overlay.querySelector("form");
    const input = overlay.querySelector("#gcnhr-token");
    const error = overlay.querySelector(".gcnhr-error");
    const close = () => overlay.remove();
    overlay.querySelector(".gcnhr-close").addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    overlay.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
    input.focus();

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = form.querySelector("[type=submit]");
      button.disabled = true;
      button.textContent = "Signing in…";
      error.textContent = "";
      try {
        await signIn(input.value.trim());
        GH.saveToken(input.value.trim(), overlay.querySelector("#gcnhr-remember").checked);
        close();
      } catch (err) {
        error.textContent = GH.describeError(err);
        button.disabled = false;
        button.textContent = "Sign in";
      }
    });
  }

  /* ---------------- Edit mode ---------------- */

  let toolbar;
  let statusEl;
  let langEl;
  let publishBtn;
  let discardBtn;

  function enterEditMode() {
    state.active = true;
    site.applyContent(state.draft);
    document.documentElement.classList.add("gcnhr-editing");
    markEditables();
    addPictureButtons();
    buildToolbar();
    document.addEventListener("click", onDocumentClick, true);
    document.querySelectorAll("[data-lang]").forEach((b) => b.addEventListener("click", () => { closePopover(); refresh(); }));
    window.addEventListener("beforeunload", (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = ""; } });
    refresh();
    toast("You are editing. Click any outlined text to change it, or use “Change photo” on a picture.");
  }

  function markEditables() {
    document.querySelectorAll("[data-i18n], [data-stat]").forEach((node) => {
      if (node.closest("option, .sr-only, .skip-link, .gcnhr-ui")) return;
      node.classList.add("gcnhr-editable");
    });
  }

  function addPictureButtons() {
    const seen = new Set();
    document.querySelectorAll("img[data-img]").forEach((img) => {
      const key = img.dataset.img;
      if (seen.has(key) || SKIP_PICTURE_BUTTON.has(key)) return;
      seen.add(key);
      const slot = GH.IMAGE_SLOTS.find((s) => s.key === key) || { key, max: 1400 };
      const host = img.parentElement;
      host.classList.add("gcnhr-pic-host");
      const button = el("button", "gcnhr-ui gcnhr-pic-btn");
      button.type = "button";
      button.dataset.slot = key;
      button.innerHTML = `<span aria-hidden="true">📷</span> <span class="gcnhr-pic-label">Change photo</span>`;
      // Keep the file input outside the button: cancelling the button click
      // would also cancel the input's bubbled click and suppress its picker.
      const input = el("input", "gcnhr-ui");
      input.type = "file";
      input.accept = "image/*";
      input.hidden = true;
      button.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); input.click(); });
      input.addEventListener("change", () => { if (input.files[0]) replacePicture(slot, input.files[0], button); input.value = ""; });
      img.insertAdjacentElement("afterend", button);
      button.insertAdjacentElement("afterend", input);
    });
  }

  async function replacePicture(slot, file, button) {
    const label = button.querySelector(".gcnhr-pic-label");
    label.textContent = "Optimising…";
    try {
      const prepared = await GH.prepareImage(file, slot.key, slot);
      state.pendingImages[slot.key] = prepared;
      state.draft.images[slot.key] = prepared.path;
      document.querySelectorAll(`img[data-img="${slot.key}"]`).forEach((img) => { img.src = prepared.url; });
      button.classList.add("is-changed");
      label.textContent = "Photo changed";
      refresh();
    } catch (err) {
      label.textContent = "Change photo";
      toast(`Could not use that picture: ${err.message}`, "error");
    }
  }

  function buildToolbar() {
    toolbar = el("div", "gcnhr-ui gcnhr-toolbar");
    toolbar.setAttribute("role", "region");
    toolbar.setAttribute("aria-label", "Website editor");
    toolbar.innerHTML = `
      <div class="gcnhr-tb-info">
        <strong>✎ Editing</strong>
        <span class="gcnhr-tb-lang"></span>
        <span class="gcnhr-tb-status"></span>
      </div>
      <div class="gcnhr-tb-actions">
        <button type="button" class="gcnhr-btn gcnhr-btn-ghost" data-act="discard">Discard</button>
        <button type="button" class="gcnhr-btn gcnhr-btn-primary" data-act="publish">Publish changes</button>
        <a class="gcnhr-btn gcnhr-btn-ghost" href="admin/" target="_blank" rel="noopener" title="Hidden texts, settings and all languages side by side">Full admin ↗</a>
        <button type="button" class="gcnhr-btn gcnhr-btn-link" data-act="exit">Exit</button>
        <button type="button" class="gcnhr-btn gcnhr-btn-link" data-act="logout">Sign out</button>
      </div>`;
    document.body.append(toolbar);
    statusEl = toolbar.querySelector(".gcnhr-tb-status");
    langEl = toolbar.querySelector(".gcnhr-tb-lang");
    publishBtn = toolbar.querySelector('[data-act="publish"]');
    discardBtn = toolbar.querySelector('[data-act="discard"]');
    publishBtn.addEventListener("click", publish);
    discardBtn.addEventListener("click", discard);
    toolbar.querySelector('[data-act="exit"]').addEventListener("click", () => {
      if (isDirty() && !confirm("You have unpublished changes. Leave edit mode and discard them?")) return;
      state.pendingImages = {};
      state.draft = clone(state.original);
      location.reload();
    });
    toolbar.querySelector('[data-act="logout"]').addEventListener("click", () => {
      if (isDirty() && !confirm("You have unpublished changes. Sign out and discard them?")) return;
      GH.clearToken();
      state.pendingImages = {};
      state.draft = clone(state.original);
      location.reload();
    });
  }

  /* ---------------- Change tracking ---------------- */

  function countChanges() {
    let count = Object.keys(state.pendingImages).length;
    const { draft, original } = state;
    Object.keys(draft.text).forEach((lang) => {
      const keys = new Set([...Object.keys(draft.text[lang] || {}), ...Object.keys(original.text[lang] || {})]);
      keys.forEach((k) => { if ((draft.text[lang][k] || "") !== ((original.text[lang] || {})[k] || "")) count++; });
    });
    Object.keys({ ...draft.settings.stats, ...original.settings.stats }).forEach((k) => {
      if ((draft.settings.stats[k] || "") !== (original.settings.stats[k] || "")) count++;
    });
    return count;
  }

  const isDirty = () => state.active && countChanges() > 0;

  function refresh() {
    const lang = site.language;
    langEl.textContent = LANG_NAMES[lang] || lang;
    const n = countChanges();
    statusEl.textContent = n ? `${n} unpublished change${n === 1 ? "" : "s"}` : "No unpublished changes";
    statusEl.classList.toggle("is-dirty", n > 0);
    publishBtn.disabled = n === 0;
    discardBtn.disabled = n === 0;
    document.querySelectorAll(".gcnhr-editable").forEach((node) => node.classList.toggle("gcnhr-changed", isChanged(node)));
  }

  function isChanged(node) {
    if (node.dataset.stat) return (state.draft.settings.stats[node.dataset.stat] || "") !== (state.original.settings.stats[node.dataset.stat] || "");
    const lang = site.language;
    const key = node.dataset.i18n;
    return (state.draft.text[lang][key] || "") !== ((state.original.text[lang] || {})[key] || "");
  }

  /* ---------------- Text editing ---------------- */

  function onDocumentClick(event) {
    if (event.target.closest(".gcnhr-ui")) return;
    const editable = event.target.closest(".gcnhr-editable");
    if (editable) {
      event.preventDefault();
      event.stopPropagation();
      openPopover(editable);
      return;
    }
    if (state.popover && !event.target.closest(".gcnhr-popover")) closePopover();
    // Stay on the page while editing: block links that would leave it.
    const link = event.target.closest("a[href]");
    if (link && !link.getAttribute("href").startsWith("#")) event.preventDefault();
  }

  function openPopover(node) {
    closePopover();
    const lang = site.language;
    const isStat = Boolean(node.dataset.stat);
    const key = isStat ? node.dataset.stat : node.dataset.i18n;
    const current = isStat ? (state.draft.settings.stats[key] || node.dataset.default || "") : (state.draft.text[lang][key] || "");
    const english = isStat ? "" : (state.draft.text.en[key] || "");

    const pop = el("div", "gcnhr-ui gcnhr-popover");
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", "Edit text");
    const head = el("div", "gcnhr-pop-head");
    head.append(el("strong", "", isStat ? "Key figure" : `Text · ${LANG_NAMES[lang]}`), el("span", "gcnhr-pop-key", key));
    const area = el("textarea");
    area.value = current;
    area.rows = Math.min(8, Math.max(2, Math.ceil(Math.max(current.length, english.length) / 48)));
    if (!isStat && RTL.has(lang)) { area.dir = "rtl"; area.classList.add("gcnhr-rtl"); }
    if (!current && !isStat) area.placeholder = "Not translated yet; visitors see the English text.";
    pop.append(head, area);
    if (lang !== "en" && english) {
      const ref = el("p", "gcnhr-pop-ref");
      ref.append(el("b", "", "English: "), document.createTextNode(english));
      pop.append(ref);
    }
    const actions = el("div", "gcnhr-pop-actions");
    const revert = el("button", "gcnhr-btn gcnhr-btn-link", "Undo changes");
    const done = el("button", "gcnhr-btn gcnhr-btn-primary", "Done");
    revert.type = done.type = "button";
    actions.append(revert, done);
    pop.append(actions);
    document.body.append(pop);

    const apply = (value) => {
      if (isStat) {
        state.draft.settings.stats[key] = value.trim().replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace("٪", "%");
      } else {
        state.draft.text[lang][key] = value;
      }
      site.setLanguage(lang, { persist: false }); // re-renders every place this text appears
      refresh();
    };
    area.addEventListener("input", () => apply(area.value));
    area.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); closePopover(); }
      if (e.key === "Escape") closePopover();
    });
    revert.addEventListener("click", () => {
      area.value = isStat ? (state.original.settings.stats[key] || "") : ((state.original.text[lang] || {})[key] || "");
      apply(area.value);
    });
    done.addEventListener("click", closePopover);

    positionPopover(pop, node);
    state.popover = { pop, node };
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);
  }

  function positionPopover(pop, node) {
    const rect = node.getBoundingClientRect();
    const width = Math.min(440, window.innerWidth - 24);
    pop.style.width = `${width}px`;
    let left = rect.left + window.scrollX;
    left = Math.max(12 + window.scrollX, Math.min(left, window.scrollX + window.innerWidth - width - 12));
    const below = rect.bottom + 10;
    const fitsBelow = below + pop.offsetHeight < window.innerHeight - 90; // leave room for the toolbar
    const top = fitsBelow ? below : Math.max(10, rect.top - pop.offsetHeight - 10);
    pop.style.left = `${left}px`;
    pop.style.top = `${top + window.scrollY}px`;
  }

  function closePopover() {
    if (!state.popover) return;
    state.popover.pop.remove();
    state.popover = null;
  }

  /* ---------------- Publish / discard ---------------- */

  function discard() {
    if (!confirm("Discard all unpublished changes on this page?")) return;
    closePopover();
    state.draft = clone(state.original);
    state.pendingImages = {};
    site.applyContent(state.draft);
    document.querySelectorAll(".gcnhr-pic-btn").forEach((b) => { b.classList.remove("is-changed"); b.querySelector(".gcnhr-pic-label").textContent = "Change photo"; });
    refresh();
  }

  async function publish() {
    closePopover();
    publishBtn.disabled = true;
    publishBtn.textContent = "Publishing…";
    try {
      const sha = await state.client.currentContentSha();
      if (sha !== state.contentSha
        && !confirm("Someone else published changes since you started editing. Publishing now will replace their text changes with yours. Continue?")) {
        return;
      }
      const n = countChanges();
      await state.client.publish(state.draft, state.pendingImages, `Update website content from on-page editor (${n} change${n === 1 ? "" : "s"})`);
      state.contentSha = await state.client.currentContentSha();
      state.original = clone(state.draft);
      state.pendingImages = {}; // previews keep showing until the live site has the new files
      document.querySelectorAll(".gcnhr-pic-btn").forEach((b) => { b.classList.remove("is-changed"); b.querySelector(".gcnhr-pic-label").textContent = "Change photo"; });
      toast("Published. The live website updates in about 1–2 minutes.", "ok");
    } catch (err) {
      toast(`Publishing failed: ${err.message}. Your changes are still here; try again.`, "error");
    } finally {
      publishBtn.textContent = "Publish changes";
      refresh();
    }
  }

  /* ---------------- Messages ---------------- */

  let toastTimer;
  function toast(message, kind = "") {
    document.querySelector(".gcnhr-toast")?.remove();
    const node = el("div", `gcnhr-ui gcnhr-toast ${kind}`, message);
    node.setAttribute("role", "status");
    document.body.append(node);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.remove(), kind === "error" ? 9000 : 6000);
  }

  return { start };
})();
