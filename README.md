# Typewell

Live site: https://typing.denghanjie.vip

Source: https://github.com/denghanjie/typewell

A no-dependency typing tutor for TOEFL, IELTS and AP Computer Science A students. Open `index.html` directly, or serve this folder:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Visit http://localhost:8765. Guest practice requires no account or API. Student accounts require the Python service described below.

## Learning flow

1. Foundations: home row, eight fingers, reaches, capitals, numbers and symbols.
2. Exam tracks: vocabulary, sentences and passages; AP CSA includes Java code.
3. Start practice and type into the box. The keyboard and hand guide highlight the next key and the corresponding finger. Capitals and symbols highlight the opposite Shift.
4. Correct red characters with Backspace. Finish the full text to save a result and advance.
5. Paste teacher-selected material in “Practice your own material”. Smart quotes and dashes are normalized. Tab inserts four spaces on the AP CSA track; Shift+Tab moves focus normally.

The 185 lessons include 7 foundations drills, 48 TOEFL exercises, 60 IELTS exercises, and 70 AP CSA exercises. The library mixes attributed source excerpts, selected vocabulary, and explicitly labeled original adaptations. AP CSA includes College Board released FRQs from 2023–2025. TOEFL and IELTS material comes from the existing local question collections; their source labels are retained without independently certifying the publisher status of those copies. See `content/SOURCES.md`. Java snippets are practice fragments and may assume surrounding declarations. This is a typing tutor, not an exam simulator or Java compiler. A physical US QWERTY keyboard is recommended; the layout remains usable on small screens. Software cannot verify physical finger usage.

## Metrics and privacy

WPM = currently correct characters / 5 / active minutes (minimum denominator: one second). Accuracy = correct inserted characters / all inserted characters, including mistakes subsequently corrected. Deletions do not count as new attempts. Timing begins at the first input and pauses when the box loses focus or the page becomes hidden. Practice is untimed; there is no score target or countdown pressure.

Guest mode keeps the last 50 results on the device and displays the latest 10. Signing in saves completed lesson IDs, titles, track, WPM, accuracy, active duration, character count, and completion date on the server. The latest unfinished built-in lesson can be resumed from its correct prefix, with active time and attempt counts preserved. Mistyped text and custom passage content are never uploaded. Custom practice saves summary metrics only. Guest results are imported only when the student clicks the import button.

Accounts use a username, password (10–128 characters), and one-time-displayed recovery code. Passwords use salted scrypt; recovery codes and session tokens are hashed. Sessions use Secure, HttpOnly, SameSite cookies over HTTPS. Password recovery rotates the code and revokes previous sessions. There is no email recovery. Save the recovery code privately and sign out on shared computers. Failed authentication and account creation are rate limited. The API rejects cross-origin changes and account-mismatched writes from stale tabs.

Failed result uploads remain in a per-account retry queue in this browser; Sync or reconnecting retries them without duplicates. Checkpoints are saved after a one-second typing pause, when leaving the input, and on Sync; failures are visible and can be retried using Sync. Only one latest checkpoint is stored per account. Concurrent devices use the last saved checkpoint. A page closed before its last write completes may resume at an earlier checkpoint. When local storage is unavailable, pending results remain in memory and the page must stay open until sync succeeds. Progress is self-reported practice data, not an authenticated exam score.

## Files

- `index.html`: semantic page and accessible controls
- `styles.css`: responsive design and finger colors
- `lessons.js`: generated offline lesson library
- `app.js`: typing, keyboard guidance, metrics and local progress
- `design/concept.png`: generated visual reference
- `design/verification.md`: design decisions and verification record

Design tokens: background #f7f8f5, white surfaces, ink #15202b, green #244d3b; 8–10px panel radii; system sans UI and system monospace practice text. Header, centered introduction, four track tabs, two-column practice/guide layout. On narrower screens the guide moves below practice. Keyboard colors consistently encode left/right pinky, ring, middle and index assignments.

## Server deployment

The live site is served by Nginx from `/var/www/typing.denghanjie.vip`. Publish only `index.html`, `styles.css`, `lessons.js`, `app.js`, `account.js`, and `race.js` there. The Python standard-library API binds `127.0.0.1:8794`; Nginx proxies `/api/` with the client's IP overwritten at the proxy. Python must include OpenSSL scrypt support. Production uses Python 3.14.

Install `server/server.py`, `server/races.py`, the generated `server/race-lessons.json`, and `server/backup.py` under `/opt/typewell`, create a dedicated `typewell` system user, and install the units from `deploy/` in `/etc/systemd/system/`. Enable `typewell.service` and `typewell-backup.timer`. The service stores SQLite data in `/var/lib/typewell` with restricted permissions. Daily consistent backups retain 30 snapshots under `/var/backups/typewell/accounts`; they are on the same server, so separate off-server backup is still recommended for disaster recovery. Never publish these paths or database files to Git or the web root. To restore, stop the service, preserve the current database and WAL files, restore a snapshot with typewell ownership and mode 0600, then start the service.

For a combined local preview (use a Python runtime with scrypt):

```sh
TYPEWELL_STATIC="$PWD" TYPEWELL_DB=/tmp/typewell-dev.sqlite3 TYPEWELL_ORIGIN=http://127.0.0.1:8795 PORT=8795 python3 server/server.py
```

Run `python3 -m unittest discover -s tests -v` for integration coverage of authentication, CSRF, rate limits, recovery, result idempotency, import rollback, account isolation, and checkpoints. The API tests use temporary databases and ephemeral local ports. Production deployment should also verify `/api/health`, service status, HTTPS cookie flags, and published static-file hashes. Back up the current static release and Nginx configuration before replacing them.

## Enriching the library

Edit `content/source-exercises.json` for sourced material, `content/starter-lessons.json` for short originals, or `content/long-exercises.json` for extended originals, then run `python3 scripts/build-lessons.py`. The builder validates unique titles, source metadata, US-QWERTY characters, lengths, and basic extraction artifacts. Practice type filters and topic/source search narrow the grouped lesson selector. The Next lesson button follows the currently filtered selector order. Source details and character/word counts appear above the practice text.

Lesson IDs hash the track, title, and text so ordering changes preserve progress, while changed content gets a fresh checkpoint identity. Long text is rendered once; each keystroke updates only changed character spans. Custom material accepts up to 20,000 characters.

## Race a friend

Two signed-in students can compete on any built-in lesson. One selects a track and lesson under **Race a friend**, creates a room, and shares the eight-character code. The other joins with that code. Both click **Ready to race**; the server schedules a shared five-second countdown. Race time includes pauses, loss of focus, and time spent reconnecting. The first server-confirmed full, correct passage wins; insertion accuracy still reflects corrected mistakes. The second player can finish and save their result after the winner is announced. Both players see usernames, progress, speed, and accuracy. There is no public matchmaking, chat, or public leaderboard.

The race panel updates roughly every 1.5 seconds. Active rooms can be restored on reload or via Reconnect, using the last server-saved correct prefix. Unsent keystrokes may be lost if the page closes. Transient network failures retry without clearing local text; complete submissions are idempotent and save directly to account history. A revision check prevents stale tabs overwriting newer progress. One account can participate in only one active room, and each room admits at most two distinct accounts. Students should use separate devices or separate browser profiles/private sessions for different accounts.

Leaving a waiting room cancels it; leaving after the countdown forfeits to the opponent (an existing winner remains the winner). A lost connection does not immediately forfeit: the opponent sees a connection-delay label after ten seconds and the original race clock continues. Waiting rooms expire after 15 minutes, races after 45 minutes. Completed scores stay in account history; transient room records older than seven days past expiry are pruned when a new room is created. Rooms and results are included in the existing SQLite backups.

Races are friendly practice, not an anti-cheat exam system: the server owns timing, room membership and finish order, but progress counters are browser-reported. Network latency can affect close finishes. Custom/private material is not shared in rooms. `scripts/build-lessons.py` generates the browser library and the server's canonical race registry together; deploy both when changing lessons. The additional race tests cover competing joins, non-member access, pre-start input, incorrect completion, idempotent results, stale revisions, reconnect starts, cancellations, expiry and forfeits.
