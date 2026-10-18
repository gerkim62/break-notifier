# Break notifier / WFM Schedule Companion

The updated extension is in [`extension/`](extension/), rebuilt on the supplied v0.4.17 popup. The day selector and events list use the supplied designs, with week navigation added. Settings uses the supplied HTML layout with 2/5/10-minute presets and no manual minutes field. The schedule uses one scrollbar: its header, picker, countdown and filters scroll away with the events; the small action footer stays available. The popup remains 380×600, with the existing themes and snooze repair. Your scroll position survives data updates and a trip to Settings. The original ZIP and both HTML design references remain available locally.

v0.4.23 replaces the filled filter pills with keyboard-accessible underline tabs and adds breathing room between activity cards. Gaps say “between activities” or count down to the next activity; they do not imply free time. Empty filters say “No schedule detected.” The popup refreshes the current week on opening and loads each newly visited week once per popup session. Cached data appears immediately; missing data shows loading, retry or login feedback. Concurrent requests for one week share one RPC read. Background startup and badge alarms still do not fetch schedules.

The day thumb, underline and movable ring retain their displayed positions through interrupted navigation and share a smooth deceleration. Content transitions and Settings use restrained movement and fades. System reduced motion applies immediately, including when the preference changes during an animation.

The header and countdown rings share one SVG design and show the same live progress, with uniform strokes and no blurred glow. The countdown still moves into the header when you select another day.

The session-expired toast includes a **Log in** action. Toasts pause dismissal while hovered, keyboard-focused, or checking login, then resume their remaining lifetime. They appear above the action footer.

- Install: extract `wfm-schedule-companion-v0.4.23-flat.zip`, then load its folder as an unpacked Chrome/Edge extension.
- Screenshots and pixel comparisons: [`verification/index.html`](verification/index.html).
- Source: [`extension/popup.js`](extension/popup.js), [`extension/schedule-components.mjs`](extension/schedule-components.mjs), [`extension/schedule-components.css`](extension/schedule-components.css), [`extension/ring.js`](extension/ring.js), [`extension/background.mjs`](extension/background.mjs).

Run `npm ci` and `npm test` to reproduce the screenshot, interaction and cache checks. The browser harness uses installed Google Chrome on Windows; its path is in `scripts/browser-harness.mjs`. It runs actual popup/content scripts and background handlers with browser API and schedule fixtures. No authenticated WFM service is required by these checks.

Run `npm run design` after changing design generation, and `npm run package` to produce the flat extension ZIP.

Git tracks the extension source, both original HTML design references, verification scripts, and the npm lockfile. Dependencies, local environment files, release ZIPs, and generated contents of `verification/` are ignored. Run `npm test` to generate the screenshot comparison report after cloning; run `npm run package` to build the extension ZIP. Existing local ZIPs and verification artifacts remain on disk.
