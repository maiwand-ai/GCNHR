# Geneva Center for Negotiations and Human Rights (GCNHR)

A responsive, multilingual one-page website for GCNHR, an independent non-profit association based in Geneva, Switzerland. Content is drawn from the association's statutes.

## Languages

English, French, Dari, Pashto and Uzbek (Latin script). Dari and Pashto switch the page to a right-to-left layout and Persian-script fonts. The chosen language is remembered, and any language can be linked directly with `?lang=en|fr|fa|ps|uz`.

All text lives in `translations.js`; each key matches a `data-i18n` attribute in `index.html`.

## Files

- `index.html` – page structure
- `styles.css` – design (colours taken from the logo: forest green, deep red, gold)
- `translations.js` – copy in all five languages
- `app.js` – language switching, mobile menu, scroll effects, contact form
- `assets/img/` – web-optimised logo, emblem, favicon and photography (generic Unsplash photos, free licence)
- `Correct logo/2.png` – original full-resolution logo (not loaded by the site)

## Before going live

- Set the real contact address in `CONTACT_EMAIL` at the top of `app.js` (currently `info@gcnhr.org`).
- The contact form opens the visitor's email app with the message filled in. To receive submissions directly, connect it to a form service (for example Formspree) or a backend.

## Run locally

```sh
python3 -m http.server 4173
```

Then open <http://localhost:4173>.
