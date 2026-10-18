# Break notifier / WFM Schedule Companion

The updated extension is in [`extension/`](extension/), rebuilt on the supplied v0.4.17 popup. The day selector and events list use the supplied designs, with week navigation added. Settings uses the supplied HTML layout with 2/5/10-minute presets and no manual minutes field. The original schedule header, countdown, footer, themes, and 380×600 layout are preserved, together with the snooze repair. The original ZIP and both HTML design references remain available locally.

- Install: extract `wfm-schedule-companion-v0.4.19-flat.zip`, then load its folder as an unpacked Chrome/Edge extension.
- Screenshots and pixel comparisons: [`verification/index.html`](verification/index.html).
- Source: [`extension/popup.js`](extension/popup.js), [`extension/schedule-components.mjs`](extension/schedule-components.mjs), [`extension/schedule-components.css`](extension/schedule-components.css), [`extension/ring.js`](extension/ring.js), [`extension/background.mjs`](extension/background.mjs).

Run `npm ci` and `npm test` to reproduce the screenshot, interaction and cache checks. The browser harness uses installed Google Chrome on Windows; its path is in `scripts/browser-harness.mjs`. It runs actual popup/content scripts and background handlers with browser API and schedule fixtures. No authenticated WFM service is required by these checks.

Run `npm run design` after changing design generation, and `npm run package` to produce the flat extension ZIP.

Git tracks the extension source, both original HTML design references, verification scripts, and the npm lockfile. Dependencies, local environment files, release ZIPs, and generated contents of `verification/` are ignored. Run `npm test` to generate the screenshot comparison report after cloning; run `npm run package` to build the extension ZIP. Existing local ZIPs and verification artifacts remain on disk.
