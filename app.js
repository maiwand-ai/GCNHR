// All editable content (texts, images, settings) comes from content/content.js,
// which the admin page at /admin updates.
const CONTENT = readPreview() || window.SITE_CONTENT || { settings: {}, images: {}, text: { en: {} } };

// "Preview" in the admin opens the site with ?preview=1 and the unpublished draft in localStorage.
function readPreview() {
  if (!new URLSearchParams(window.location.search).has("preview")) return null;
  try {
    const draft = JSON.parse(localStorage.getItem("gcnhr-preview"));
    if (!draft) return null;
    const banner = document.createElement("div");
    banner.className = "preview-banner";
    banner.textContent = "Preview of unpublished changes";
    document.body.prepend(banner);
    return draft;
  } catch {
    return null;
  }
}
const SETTINGS = CONTENT.settings || {};
const TEXT = CONTENT.text || { en: {} };
const CONTACT_EMAIL = SETTINGS.contactEmail || "info@gcnhr.org";

const RTL_LANGUAGES = new Set(["fa", "ps"]);
const HTML_LANG = { en: "en", fr: "fr", fa: "fa-AF", ps: "ps", uz: "uz" };
const STORAGE_KEY = "gcnhr-language";

const header = document.getElementById("site-header");
const nav = document.getElementById("primary-nav");
const menuToggle = document.querySelector(".menu-toggle");
const langButtons = document.querySelectorAll("[data-lang]");
let currentLanguage = "en";

function t(key) {
  return (TEXT[currentLanguage] && TEXT[currentLanguage][key]) || (TEXT.en && TEXT.en[key]) || "";
}

function readStoredLanguage() {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

function storeLanguage(language) {
  try { localStorage.setItem(STORAGE_KEY, language); } catch { /* storage unavailable */ }
}

function setLanguage(language, { persist = true } = {}) {
  if (!HTML_LANG[language]) language = "en";
  currentLanguage = language;

  const root = document.documentElement;
  root.lang = HTML_LANG[language];
  root.dir = RTL_LANGUAGES.has(language) ? "rtl" : "ltr";

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const value = t(el.dataset.i18n);
    if (value) el.textContent = value;
  });

  const easternDigits = RTL_LANGUAGES.has(language);
  const stats = SETTINGS.stats || {};
  document.querySelectorAll("[data-stat]").forEach((el) => {
    if (el.dataset.default === undefined) el.dataset.default = el.textContent;
    const value = String(stats[el.dataset.stat] || el.dataset.default);
    el.textContent = easternDigits ? value.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]).replace("%", "٪") : value;
  });

  document.title = `GCNHR | ${t("brandName")}`;
  document.querySelector('meta[name="description"]')?.setAttribute("content", t("heroLead"));
  menuToggle.setAttribute("aria-label", t("menu"));

  langButtons.forEach((btn) => btn.setAttribute("aria-pressed", String(btn.dataset.lang === language)));

  try {
    const url = new URL(window.location.href);
    url.searchParams.set("lang", language);
    history.replaceState(null, "", url);
  } catch { /* some browsers block this on pages opened from disk */ }

  if (persist) storeLanguage(language);
}

// Swap in images chosen in the admin; the src in index.html is the fallback.
const IMAGES = CONTENT.images || {};
document.querySelectorAll("[data-img]").forEach((img) => {
  const src = IMAGES[img.dataset.img];
  if (src && src !== img.getAttribute("src")) img.src = src;
});

langButtons.forEach((btn) => btn.addEventListener("click", () => setLanguage(btn.dataset.lang)));

const urlLanguage = new URLSearchParams(window.location.search).get("lang");
setLanguage(urlLanguage || readStoredLanguage() || SETTINGS.defaultLanguage || "en", { persist: Boolean(urlLanguage) });

// Header background once the page scrolls past the hero top.
const updateHeader = () => header.classList.toggle("is-scrolled", window.scrollY > 40);
updateHeader();
window.addEventListener("scroll", updateHeader, { passive: true });

// Mobile menu.
function closeMenu() {
  menuToggle.setAttribute("aria-expanded", "false");
  nav.classList.remove("is-open");
  header.classList.remove("menu-open");
}

menuToggle.addEventListener("click", () => {
  const open = menuToggle.getAttribute("aria-expanded") !== "true";
  menuToggle.setAttribute("aria-expanded", String(open));
  nav.classList.toggle("is-open", open);
  header.classList.toggle("menu-open", open);
});
nav.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });

// Highlight the nav link for the section in view.
const navLinks = [...nav.querySelectorAll('a[href^="#"]')];
const sectionObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    navLinks.forEach((a) => a.classList.toggle("is-active", a.getAttribute("href") === `#${entry.target.id}`));
  });
}, { rootMargin: "-45% 0px -50% 0px" });
navLinks.forEach((a) => {
  const section = document.querySelector(a.getAttribute("href"));
  if (section) sectionObserver.observe(section);
});

// Fade sections in as they enter the viewport.
if ("IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0, rootMargin: "0px 0px -40px 0px" });
  document.querySelectorAll(".reveal").forEach((el) => revealObserver.observe(el));
  document.documentElement.classList.add("reveal-ready");
}

// Contact form: validate, then open the visitor's email client with the message filled in.
const form = document.getElementById("contact-form");
const note = document.getElementById("form-note");

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const fields = ["name", "email", "message"].map((name) => form.elements[name]);
  let valid = true;
  fields.forEach((field) => {
    const ok = field.value.trim() !== "" && field.checkValidity();
    field.classList.toggle("is-invalid", !ok);
    field.setAttribute("aria-invalid", String(!ok));
    if (!ok) valid = false;
  });

  note.classList.toggle("is-error", !valid);
  if (!valid) {
    note.textContent = t("formError");
    fields.find((f) => f.classList.contains("is-invalid"))?.focus();
    return;
  }

  const topic = form.elements.topic;
  const subject = `[GCNHR] ${topic.options[topic.selectedIndex].text}`;
  const body = `${form.elements.message.value.trim()}\n\n— ${form.elements.name.value.trim()} <${form.elements.email.value.trim()}>`;
  window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  note.textContent = t("formSuccess");
});

document.querySelectorAll(".js-email").forEach((a) => { a.href = `mailto:${CONTACT_EMAIL}`; a.textContent = CONTACT_EMAIL; });
document.getElementById("year").textContent = new Date().getFullYear();
