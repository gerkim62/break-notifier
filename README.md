# Break notifier / WFM Schedule Companion

v0.4.35 fixes an overlay startup crash when a repaint runs before background state arrives. Null state and null optional snooze/dismissal maps are safe, the overlay stays hidden while state is absent, and normal alerts resume after a valid state update. Failed or throwing state requests do not crash the drawing timer, and an empty response does not discard already-loaded state.

v0.4.34 adds reminders before breaks and meals end, using the existing lead time and Breaks & meals switch. The page alert says, for example, Tea Break 1 ends in 05:00. End reminders have separate dismissal IDs from start reminders, honor snooze, and use the original interval end through overlaps and overnight breaks. DOM schedules also recognize explicit English labels such as Tea Break 1, Lunch Break and Meal for display and reminders, without inventing native state IDs; other labels stay unclassified.

v0.4.33 automatically loads visible schedules on opening WFM's My Schedule when the current week or individual saved days are missing or unknown. Stable rendered rows fill those gaps with the displayed activity names and times. A banner acknowledges today's discovered schedule. DOM data is labeled Loaded from WFM page and stays provisional; it never inherits successful RPC-check timestamps or invents native activity types. Existing published RPC days remain intact. Refresh can replace the fallback with the full native schedule. Passive DOM loading makes no WFM requests and respects banner dismissal.

v0.4.32 fixes misleading session-expired errors: an RPC exception from `CheckSession` now requests login only when it identifies an authentication failure. Other exceptions preserve the saved schedule and report an RPC error. Diagnostics record fixed categories for RPC compatibility, serialization, token, access, unsupported-action and server failures, without server messages or response bodies. The older v0.4.31 export cannot identify the underlying exception; reproduce the failure and export diagnostics after upgrading to distinguish these causes.

The updated extension is in [`extension/`](extension/), rebuilt on the supplied v0.4.17 popup. The day selector and events list use the supplied designs, with week navigation added. Settings uses the supplied HTML layout with 2/5/10-minute presets and no manual minutes field. The schedule uses one scrollbar: its header, picker, countdown and filters scroll away with the events; the small action footer stays available. The popup remains 380×600, with the existing themes and snooze repair. Your scroll position survives data updates and a trip to Settings. The original ZIP and both HTML design references remain available locally.

Next week opens on Monday, previous week on Sunday, and returning to the current week selects today. Any day can still be selected afterward.

The filter pills have been replaced with keyboard-accessible underline tabs, with breathing room between activity cards. Gaps say “between activities” or count down to the next activity; they do not imply free time. Empty filters say “No schedule detected.” Cached data appears immediately; missing data shows loading, retry or login feedback. Concurrent requests for one week share one RPC read.

v0.4.31 confirms shifts with one successful check **within the 12 hours before their start**, or on opening an unconfirmed shift already in progress. The confirmed schedule stays current until shift end, including overnight shifts. Future shifts outside their window remain provisional and use the cache. Missing weeks load immediately; days off and unknown days get one daily check on opening. Manual Refresh always retries. Checks run on opening a day or when an already-open popup enters its confirmation window; browser startup and badge alarms do not fetch schedules.

The existing amber timestamp and highlighted header Refresh button show an unconfirmed saved schedule. While checking, the popup shows **Checking…**. A failed check keeps a persistent amber message, **Couldn’t confirm this shift. Showing saved schedule.** Refresh appears only in the header; the warning adds a Log in action when authentication is required. Failure does not mark data confirmed or advance its successful-check timestamp. Failed automatic checks are not repeated on each open for the same shift; manual retry remains available.

The day thumb, underline and movable ring retain their displayed positions through interrupted navigation and share a smooth deceleration. Explicit tab/date changes slide horizontally in navigation order over 360 ms. Settings pushes in from the right with a subtle parallax, and Back reverses the stack. The departing view stays visible during navigation. Clock ticks, cached loads and storage updates do not replay navigation effects. System reduced motion applies immediately, including when the preference changes during an animation.

The header and countdown rings share one SVG design and show the same live progress, with uniform strokes and no blurred glow. The countdown still moves into the header when you select another day.

The session-expired toast includes a **Log in** action. Toasts pause dismissal while hovered, keyboard-focused, or checking login, then resume their remaining lifetime. They appear above the action footer.

Choose **System, Light or Dark** in **Settings → Display → Theme**. The preference is saved and applies to the popup, snooze controls, queue toasts and WFM banner. System follows OS appearance changes; explicit choices override it. Light mode uses readable completed-event text, selected dates, switch states, reminder controls and diagnostic actions. Theme changes do not fetch WFM or recolor the website under extension overlays.

- Install: extract `wfm-schedule-companion-v0.4.35-flat.zip`, then load its folder as an unpacked Chrome/Edge extension.
- Screenshots and pixel comparisons: [`verification/index.html`](verification/index.html).
- Source: [`extension/popup.js`](extension/popup.js), [`extension/schedule-components.mjs`](extension/schedule-components.mjs), [`extension/schedule-components.css`](extension/schedule-components.css), [`extension/ring.js`](extension/ring.js), [`extension/background.mjs`](extension/background.mjs).

Run `npm ci` and `npm test` to reproduce the screenshot, interaction and cache checks. The browser harness uses installed Google Chrome on Windows; its path is in `scripts/browser-harness.mjs`. It runs actual popup/content scripts and background handlers with browser API and schedule fixtures. No authenticated WFM service is required by these checks.

Run `npm run design` after changing design generation, and `npm run package` to produce the flat extension ZIP.

Git tracks the extension source, both original HTML design references, verification scripts, and the npm lockfile. Dependencies, local environment files, release ZIPs, and generated contents of `verification/` are ignored. Run `npm test` to generate the screenshot comparison report after cloning; run `npm run package` to build the extension ZIP. Existing local ZIPs and verification artifacts remain on disk.
