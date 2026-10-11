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

## Additional pages and service placeholders

The existing homepage design is retained. New pages are `membership.html`,
`events.html`, `publications.html`, `news.html`, `transparency.html`,
`volunteer.html`, `partnerships.html`, `newsletter.html`, `donate.html`, and
`privacy.html`. Their shared behavior is in `features.js`.

In **Admin → New features**, manage public events, publications, news, team
profiles, statutes and annual reports. Each item supports translated titles and
descriptions; English is the fallback. New page labels can be translated in
**Texts**. Empty collections show an honest “not yet published” message.
Enable registration enquiries per event. The committee must confirm admission
and event places; a submitted application is not an approved membership.

Service fields are deliberately empty until you have providers:

- **Application form endpoint**: HTTPS URL that accepts form-data POST with
  `Accept: application/json`, permits CORS from your website, and returns a 2xx
  status only after accepting the request. Receives the form fields plus
  `requestType` and `language`. Use the provider dashboard for application
  review and approval emails. Add its privacy policy link before enabling it.
- **Newsletter signup endpoint**: same contract; connect to a newsletter
  provider that handles confirmation and unsubscribe. Add its privacy link.
- **Donation payment link**: public HTTPS link to a hosted payment page.
  Payment details are handled by that provider, not this website.
- **Member portal link**: HTTPS link to your membership provider for secure
  sign-in, status, renewal and private documents. This site does not implement
  member authentication or store private member records.
- **Membership fee information**: amount, currency and period, once approved.

Until endpoints are configured, forms prepare an email and explicitly tell
visitors to send it themselves. A donation enquiry is available until a payment
link is supplied. Requests are never saved to browser storage or the public
GitHub repository. The website's existing Login remains for administrators.
Review the privacy page for the providers and organisational practices you
choose before enabling direct submissions. No services or fees are invented.

## Verification

Run these checks from the repository directory:

```sh
node tests/features.cjs
node tests/admin-features.cjs
python3 tests/pages.py
```

The JavaScript checks use DOM fixtures and simulated submission responses. They
cover email fallback, provider routing, failures, consent validation gating,
institutional organisation requirements, the membership `pending_review` payload,
public content filtering, event selection, language fallbacks, preview links,
and admin content changes. The Python check validates page links, assets,
anchors, translation keys and required membership fields. These checks do not
verify browser rendering, actual email delivery, payments or provider dashboards.
