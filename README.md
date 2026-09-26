# Typewell

Live site: https://typing.denghanjie.vip

Source: https://github.com/denghanjie/typewell

A no-dependency typing tutor for TOEFL, IELTS and AP Computer Science A students. Open `index.html` directly, or serve this folder:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Visit http://localhost:8765. No install, account, network service, or API key is needed.

## Learning flow

1. Foundations: home row, eight fingers, reaches, capitals, numbers and symbols.
2. Exam tracks: vocabulary, sentences and passages; AP CSA includes Java code.
3. Start practice and type into the box. The keyboard and hand guide highlight the next key and the corresponding finger. Capitals and symbols highlight the opposite Shift.
4. Correct red characters with Backspace. Finish the full text to save a result and advance.
5. Paste teacher-selected material in “Practice your own material”. Smart quotes and dashes are normalized. Tab inserts four spaces on the AP CSA track; Shift+Tab moves focus normally.

The 176 lessons include 7 foundations drills, 45 TOEFL exercises, 57 IELTS exercises, and 67 AP CSA exercises. The library mixes attributed source excerpts, selected vocabulary, and explicitly labeled original adaptations. AP CSA includes College Board released FRQs from 2023–2025. TOEFL and IELTS material comes from the existing local question collections; their source labels are retained without independently certifying the publisher status of those copies. See `content/SOURCES.md`. Java snippets are practice fragments and may assume surrounding declarations. This is a typing tutor, not an exam simulator or Java compiler. A physical US QWERTY keyboard is recommended; the layout remains usable on small screens. Software cannot verify physical finger usage.

## Metrics and privacy

WPM = currently correct characters / 5 / active minutes (minimum denominator: one second). Accuracy = correct inserted characters / all inserted characters, including mistakes subsequently corrected. Deletions do not count as new attempts. Timing begins at the first input and pauses when the box loses focus or the page becomes hidden. Practice is untimed; there is no score target or countdown pressure.

The last 50 completed results are kept in localStorage; the latest 10 are displayed. A result stores lesson title, WPM, accuracy and completion date. Custom text is not persisted. Nothing is sent to a server. When browser storage is unavailable, results remain in memory for the current session.

## Files

- `index.html`: semantic page and accessible controls
- `styles.css`: responsive design and finger colors
- `lessons.js`: generated offline lesson library
- `app.js`: typing, keyboard guidance, metrics and local progress
- `design/concept.png`: generated visual reference
- `design/verification.md`: design decisions and verification record

Design tokens: background #f7f8f5, white surfaces, ink #15202b, green #244d3b; 8–10px panel radii; system sans UI and system monospace practice text. Header, centered introduction, four track tabs, two-column practice/guide layout. On narrower screens the guide moves below practice. Keyboard colors consistently encode left/right pinky, ring, middle and index assignments.

## Server deployment

The live site is served by Nginx from `/var/www/typing.denghanjie.vip`. Only `index.html`, `styles.css`, `lessons.js`, and `app.js` are published to the web root. Nginx configurations are in `deploy/`; the bootstrap configuration allows the existing Certbot installation to obtain the initial certificate with webroot `/var/lib/letsencrypt`. The HTTPS configuration redirects HTTP to HTTPS and uses the domain-specific certificate. Updates require copying those four app files into the web root; no application server or build step is needed.

## Enriching the library

Edit `content/source-exercises.json` for sourced material or `content/starter-lessons.json` for originals, then run `python3 scripts/build-lessons.py`. The builder validates unique titles, source metadata, US-QWERTY characters, lengths, and basic extraction artifacts. Practice type filters and topic/source search narrow the grouped lesson selector. The Next lesson button follows the currently filtered selector order. Source details and character/word counts appear above the practice text.
