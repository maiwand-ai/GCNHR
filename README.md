# Geneva Center for Negotiations and Human Rights (GCNHR)

A responsive, multilingual one-page website for GCNHR, an independent non-profit association based in Geneva, Switzerland. Content is drawn from the association's statutes.

## Languages

English, French, Dari, Pashto and Uzbek (Latin script). Dari and Pashto switch the page to a right-to-left layout and Persian-script fonts. The chosen language is remembered, and any language can be linked directly with `?lang=en|fr|fa|ps|uz`.

## Editing the website

### On the page

Click **Login** in the site header (in the menu on phones) and sign in with your access token (see below). The page switches to edit mode:

- Click any outlined text to change it. Switch language with the normal language buttons to edit that language; the English text is shown for reference.
- Use **Change photo** on a picture to replace it (it is resized and optimised automatically).
- The bar at the bottom shows unpublished changes. **Publish changes** saves everything; **Discard** throws away unpublished changes; **Full admin** opens the admin page.

### Admin page

Open `/admin/` on the live site (https://maiwand-ai.github.io/GCNHR/admin/) and sign in with a GitHub access token:

1. Signed in to GitHub as the repository owner, go to https://github.com/settings/personal-access-tokens/new
2. Repository access: **Only select repositories** → this repository.
3. Permissions → Repository permissions → **Contents: Read and write**.
4. Generate the token and paste it into the admin sign-in page. Keep it private.

In the admin you can edit every text in all five languages, replace pictures (they are resized and optimised automatically), and change settings such as the contact email, default language and key figures. **Preview** shows your unpublished changes; **Publish changes** saves everything in one commit and the live site updates in about 1–2 minutes. Every publish is kept in the repository history, so earlier versions can be restored.

If you also edit files locally, run `git pull` first to get the changes made in the admin.

## Content

All editable content lives in `content/content.js`: `settings`, `images` (one path per picture slot) and `text` (one set of keys per language). Each text key matches a `data-i18n` attribute and each image slot a `data-img` attribute in `index.html`. Pictures uploaded from the admin go to `assets/uploads/`.

## Files

- `index.html` – page structure
- `styles.css` – design (colours taken from the logo: forest green, deep red, gold)
- `content/content.js` – all texts, picture paths and settings (edited by the admin)
- `admin/` – the admin page; `admin/github.js` is the GitHub storage code shared with the on-page editor
- `editor.js`, `editor.css` – the on-page editor (loaded only after Login)
- `app.js` – language switching, mobile menu, scroll effects, contact form
- `assets/img/` – web-optimised logo, emblem, favicon and photography (generic Unsplash photos, free licence)
- `Correct logo/2.png` – original full-resolution logo (not loaded by the site)

## Before going live

- Set the real contact address in the admin under Settings (currently `info@gcnhr.org`).
- The contact form opens the visitor's email app with the message filled in. To receive submissions directly, connect it to a form service (for example Formspree) or a backend.

## Run locally

```sh
python3 -m http.server 4173
```

Then open <http://localhost:4173>.
