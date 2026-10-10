// Shared GitHub storage for the GCNHR site content.
// Used by the admin page (admin/) and the on-page editor (editor.js).
// Content lives in content/content.js; uploaded pictures in assets/uploads/.
window.GCNHRGitHub = (() => {
  const API = "https://api.github.com";
  const CONTENT_PATH = "content/content.js";
  const UPLOAD_DIR = "assets/uploads";
  const TOKEN_KEY = "gcnhr-admin-token";
  const LANGUAGES = ["en", "fr", "fa", "ps", "uz"];

  function detectRepo() {
    const host = location.hostname;
    if (host.endsWith(".github.io")) {
      const owner = host.replace(".github.io", "");
      const name = location.pathname.split("/").filter(Boolean)[0];
      if (name && name !== "admin") return { owner, name, branch: "main" };
    }
    return { owner: "maiwand-ai", name: "GCNHR", branch: "main" };
  }

  /* ---- token storage (shared by admin page and on-page editor) ---- */

  function readToken() {
    try { return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY); } catch { return null; }
  }
  function saveToken(token, remember) {
    try { (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token); } catch { /* memory only */ }
  }
  function clearToken() {
    try { sessionStorage.removeItem(TOKEN_KEY); localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  }

  /* ---- encoding ---- */

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
    return normalizeContent(JSON.parse(match[1]));
  }

  function serializeContent(content) {
    return `// GCNHR site content. Edit it from /admin, or by hand. The part after "=" must stay valid JSON.\nwindow.SITE_CONTENT = ${JSON.stringify(content, null, 2)};\n`;
  }

  function normalizeContent(content) {
    content.settings ||= {};
    content.settings.stats ||= {};
    content.images ||= {};
    content.text ||= {};
    LANGUAGES.forEach((code) => { content.text[code] ||= {}; });
    return content;
  }

  /* ---- API client ---- */

  class Client {
    constructor(token, repo = detectRepo()) {
      this.token = token;
      this.repo = repo;
    }

    async request(path, options = {}) {
      const res = await fetch(`${API}/repos/${this.repo.owner}/${this.repo.name}${path}`, {
        ...options,
        cache: "no-store",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${this.token}`,
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

    // Confirms the token works and may write; returns the repository info.
    async verify() {
      const repo = await this.request("");
      if (!repo.permissions || !repo.permissions.push) {
        const error = new Error("This token can read the repository but cannot change it. Give it Contents: Read and write.");
        error.status = 403;
        throw error;
      }
      this.repo.branch = repo.default_branch || this.repo.branch;
      return repo;
    }

    async loadContent() {
      const file = await this.request(`/contents/${CONTENT_PATH}?ref=${this.repo.branch}`);
      return { content: parseContentFile(base64ToUtf8(file.content)), sha: file.sha };
    }

    async currentContentSha() {
      return (await this.request(`/contents/${CONTENT_PATH}?ref=${this.repo.branch}`)).sha;
    }

    // Writes the content file and any new pictures in a single commit.
    // pendingImages: { slot: { blob, path } }
    async publish(content, pendingImages, message) {
      const ref = await this.request(`/git/ref/heads/${this.repo.branch}`);
      const baseCommit = await this.request(`/git/commits/${ref.object.sha}`);
      const post = (path, body) => this.request(path, { method: "POST", body: JSON.stringify(body) });

      const files = [];
      for (const { blob, path } of Object.values(pendingImages)) {
        const created = await post("/git/blobs", { content: await blobToBase64(blob), encoding: "base64" });
        files.push({ path, mode: "100644", type: "blob", sha: created.sha });
      }
      const contentBlob = await post("/git/blobs", { content: utf8ToBase64(serializeContent(content)), encoding: "base64" });
      files.push({ path: CONTENT_PATH, mode: "100644", type: "blob", sha: contentBlob.sha });

      const tree = await post("/git/trees", { base_tree: baseCommit.tree.sha, tree: files });
      const commit = await post("/git/commits", { message, tree: tree.sha, parents: [ref.object.sha] });
      await this.request(`/git/refs/heads/${this.repo.branch}`, { method: "PATCH", body: JSON.stringify({ sha: commit.sha }) });
      return commit.sha;
    }
  }

  function describeError(error, repo = detectRepo()) {
    if (error.status === 401) return "This token was not accepted. Check that it is complete and has not expired.";
    if (error.status === 404) return `The repository ${repo.owner}/${repo.name} was not found, or this token has no access to it.`;
    return error.message;
  }

  /* ---- pictures ---- */

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

  // Resizes to at most `max` pixels on the longest side and encodes as WebP
  // (PNG/JPEG where the browser cannot encode WebP). Returns { blob, path, url }.
  async function prepareImage(file, slot, { max = 1400, square = false } = {}) {
    const img = await loadImage(file);
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!square) { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    let blob = await canvasToBlob(canvas, "image/webp", 0.82);
    let ext = "webp";
    if (!blob || blob.type !== "image/webp") {
      ext = square ? "png" : "jpg";
      blob = square ? await canvasToBlob(canvas, "image/png") : await canvasToBlob(canvas, "image/jpeg", 0.85);
    }
    return { blob, path: `${UPLOAD_DIR}/${slot}-${Date.now()}.${ext}`, url: URL.createObjectURL(blob) };
  }

  // Picture slots shown on the site, with the resize limit for each.
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

  return {
    CONTENT_PATH, LANGUAGES, IMAGE_SLOTS,
    detectRepo, readToken, saveToken, clearToken,
    Client, describeError, prepareImage, serializeContent, normalizeContent,
  };
})();
