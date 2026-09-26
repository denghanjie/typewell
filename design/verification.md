# Design and verification

Built-in image generation produced `concept.png`; the complete initial brief is retained in this chat. Brief: complete Typewell typing tutor, off-white/forest-green palette, centered heading, four exam/foundations tracks, left practice panel with live metrics and QWERTY keyboard, right three-step home-row guide, and matching colored finger diagram. UI is native HTML/CSS/JavaScript, with no raster controls or external runtime dependencies.

## Visual comparison

Inspected the concept and browser screenshot using view_image. Browser verification uses Codex IAB, including native concept viewport 1505 × 1045, desktop 1440 × 1000 and mobile 390 × 844. `preview.png` is the native-size viewport screenshot.

| Comparison | Reference and implementation | Resolution |
|---|---|---|
| Layout | Centered introduction and four tabs above two white panels | Matched structure; widened desktop content to match concept margins |
| Typography | Bold sans heading, restrained sans controls, large monospaced exercise | Adjusted desktop heading and exercise sizes after comparison |
| Palette | Off-white canvas, white panels, forest-green action and pastel keyboard | Preserved; semantic colors consistent across fingers and keys |
| Containers | Thin borders, subtle radii, open step guide inside right panel | Matched; no decorative card grid |
| Copy | Heading, subtitle, track names, main CTA and three steps | Preserved core copy; intentional functional additions listed below |
| Keyboard | Full US QWERTY guidance including Shift, punctuation and Space | Corrected generated concept's inconsistent finger colors and inaccurate key labels |
| Finger diagram | Two sets of five rounded finger bars | Implemented native diagram with home-key labels and live finger highlighting |
| Mobile | Reference is desktop-only | Guide stacks below practice; verified 390px page width equals scroll width |

Intentional differences: visible input field during practice; error/status text, next-key label, progress bar and guide toggle; posture help; custom material and history disclosures; original-material attribution. Keyboard uses standard US key labeling and correct finger assignments, rather than duplicating image-generation inaccuracies. Unnecessary OS-specific modifier duplicates were omitted. Font uses installed system sans/monospace so the app remains offline. No photos or generated decorative assets are required.

Above-the-fold copy review: reference heading, subtitle, track names, lesson title, metrics, CTA, step headings and tip preserved. Functional status/next-key/guide/posture controls intentionally added. Desktop composition and visual hierarchy were faithfully verified against the reference, with the functional/educational changes above; this is not a pixel-identical raster reproduction.

## Functional checks

- Syntax check passes for app.js.
- Start → wrong key → Backspace → complete: displays correction feedback and 96% accuracy after one corrected error; completion unlocks next lesson.
- Browser reload preserves completed result.
- All four track buttons and lesson selection display the corresponding material.
- AP CSA conditional: punctuation, Enter and four-space Tab accepted; next uppercase S highlights left ring plus right Shift.
- Custom smart quotes normalize to ASCII; multiline custom text completes at 100% accuracy and receives its own selector label.
- Guide visibility toggle hides and restores keyboard.
- Mobile has no horizontal page overflow.
- Browser error log is empty during tested workflows.

Limitations: no physical-finger detection; no cloud account or cross-device sync; generated exam-themed text rather than a licensed official test bank. Physical-keyboard classroom usability should still be tested with students before a broad rollout.
