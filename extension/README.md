# WFM Schedule Companion v0.4.23

Filter tabs now use an animated underline with arrow-key, Home and End navigation. Activity cards have 8 px of separation. Gap labels describe time between activities rather than claiming free time, and empty filters say **No schedule detected.** The picker, underline and countdown ring share interruptible motion; repeated selections continue from the currently displayed position. Content changes use restrained fades and movement. Reduced motion applies at load and when the system preference changes.

Opening the popup refreshes the current week while showing cached data immediately. The first visit to each other week loads it automatically, with loading, retry and login states. Each week loads once per popup session unless Refresh is clicked. Concurrent requests for the same week share one RPC read; other weeks are serialized so responses cannot overwrite each other's cache. Late responses preserve the selected date, and loading another week preserves today's alert data. Browser startup, badge alarms and passive page observations do not fetch WFM. This replaces the earlier manual-only popup/week loading policy.

This release restores the original v0.4.17 popup as the base. The day selector and events list use the supplied HTML references, with week navigation added. Settings follows the supplied compact HTML layout with three reminder presets (2, 5 and 10 minutes); the manual minutes input is omitted. The original 380×600 layout, schedule header, movable countdown ring, filter controls, footer, light/dark themes, and existing empty/day-off screens are preserved. Component styles are scoped in `schedule-components.css` rather than applied globally. The journey follows the real clock and retains card/rail nodes between ticks.

The schedule now scrolls as one page, allowing the header, day picker, countdown and filters to leave the viewport as you read. Only the small action footer stays visible. Compact day buttons and event card padding leave more room for activities. The countdown ring moves and clips with its slot while scrolling. Data updates and returning from Settings keep your reading position.

Both ring sizes use the same SVG geometry, relative stroke weight and live progress. The old fixed decorative header arc and blurred countdown glow are removed. Normalized progress and rounded-cap compensation keep the arc ends clean near completion. Inactive rings use a matching dotted style and correctly resume live progress when a shift begins. Countdown text scales to fit longer durations.

Session-expired notifications include a **Log in** button that runs the existing explicit login check. Toasts remain visible while hovered or keyboard-focused and throughout an in-progress action; their remaining timeout resumes afterwards. Notifications sit above the action footer and suppress duplicate action clicks.

Snooze now settles the island's initial width before pointer interaction. Enter/Space reliably opens the menu, arrow keys select enabled durations, and Escape closes it. Choosing a duration persists the snooze, hides the edge/island and shows confirmation. The alert returns after expiry.

Previous/next week buttons, Today, arrow keys and swipes update the selected day. Cached weeks appear immediately as the first-visit load runs. Refresh retries or updates the selected week and retains today's alert schedule. Up to 12 weeks are saved.

Load this folder using **Load unpacked** in Chrome/Edge's developer extensions page, or extract the v0.4.23 flat ZIP first. Reload an existing installation after replacing its files, then reload tabs so they receive the updated snooze content script.

Verification is in the workspace's `verification/` folder. Real Chrome renders the production popup/content scripts using fixture schedules and browser APIs. A footer comparison checks its appearance against the original ZIP's popup. Long-schedule checks verify whole-page scrolling, access to the final activity, countdown alignment, and preserved scroll position. Other checks cover the day picker, journey, movable ring, week navigation/cache, HTML settings presets/switches and diagnostics, themes, and mouse/keyboard snooze. Authenticated WFM network access was not available in this environment.

## Earlier release notes

# v0.4.5 — Hide countdown card on non-current days

When a different day is selected, the countdown card is removed; the daily schedule rows remain visible and the ongoing live ring stays in the header. Returning to Today restores the card and moves the ring back. No WFM request behaviour changed.

# WFM Schedule Companion v0.4.4 — My Schedule and interaction repairs

Build based on v0.4.3 with the user's **WFM Schedule Companion UI Design v2**. The five base popup screens retain the supplied HTML/CSS; the title and interactive states are changed as explicitly requested. `manifest.json` is at the root of the flat extension ZIP.

## Changes in 0.4.4

- **Login checks first:** Clicking **Log in to WFM** triggers one explicit authenticated WFM session/schedule-fetch workflow (`WFM_LOGIN_CHECK`). It shows **Checking…** with a loading indicator. Authenticated success updates the cache without opening a tab. A confirmed signed-out result focuses an existing WFM tab or opens a login tab only if none exists. Network and parser failures do **not** open tabs.
- **Reuse tabs:** Normal **Open WFM** links no longer create duplicates. They prefer an already-open exact My Schedule tab at `http://svdt1ipccwfm09:8070/wfm/Agent?#Schedule;view=MY_SCHEDULE`, fall back to any WFM tab on the same host and port, and create a tab only if no matching tab is found. Opening is serialized so repeated clicks do not create concurrent tabs. Uses `tabs` permission to discover tabs across windows.
- **Passive DOM observer:** Fixed the reported `"<style>..." is not a function` JavaScript error caused by missing semicolon after banner HTML. DOM observation still runs only when the user visits the WFM Agent page; there are no extension-initiated WFM calls merely due to a visit.
- **Explicit-only WFM requests:** Removed the WFM banner's opt-in *automatic refresh next time* checkbox and logic, because it contradicted the no-unrequested-fetch policy. Only deliberate **Refresh** or **Login** actions initiate an RPC request. Browser startup, tab/day switching, popup opening, schedule DOM observation and badge alarms never fetch.
- **Refresh loading:** The button retains the shared-design icon, rotates it while working, reads **Refreshing…** and stays disabled. Storage updates/rerenders cannot revert the label while busy. A failed request shows an actionable toast *inside the popup*, preserving the cached schedule.
- **Information icon:** The existing icon is a real focusable button with an accessible popover of factual cached information: last refresh time, last error (if any) and warning count (if any). Close with Escape or clicking outside. Exact additional content was not supplied, so no new speculative details were added.
- **Header:** **My Schedule** replaces Schedule in all five source templates. Timestamps truncate gracefully rather than overlap the Refresh button; more detail is accessible from the info button.
- **One continuous animated countdown:** A single persistent ring DOM element follows today's actual segment and smoothly moves/changes size between the full-size hero ring (Today selected) and the **existing top-left header icon** (another day selected). Returning to Today brings it back. It never resets from day selection, and remains live while another day is displayed. Repeated day changes retarget the same element. No new floating overlay.
- **Inactive countdown:** Uses a static muted dotted ring, with no fake progress. Existing Day Off and completed-schedule text/illustration remain unchanged. When no live countdown exists, the header icon is also inactive/dotted. Reduced motion follows OS settings without adding Settings UI.
- **Micro-interactions:** Consistent hover, focus, busy, disabled, and button response states; popover dismiss; Settings chip selection; Diagnostics Export, Copy and Clear show temporary busy labels and confirmed feedback.
- **Preserved features:** Native GWT parser, week cache, manual refresh, DOM comparison, diagnostics, seven-day selector, queue-switch toast at transition time with hover/visibility pause, and page-edge alert/snooze controls.

## Verification performed

- Syntax checked all JS/MJS files with `node --check`.
- Isolated background tests with Chrome API mocks: concurrent WFM opens create only one tab; existing My Schedule tab wins and focuses its window; no automatic fetch on startup.
- Background `WFM_LOGIN_CHECK` tested with mocked HTTP 401 and network errors: session request precedes any tab action; signed-out result reuses/open tabs only as necessary; network failure opens none.
- Chromium rendering using the **production popup markup, CSS and JavaScript** with mocked browser runtime and sample schedule (not an installed extension): My Schedule title; info popup/Escape; stable Refreshing… through rerender; error toast; Login Checking…; one animated shared ring docking and returning; Settings.
- Queue-switch toast regression: eight pre-existing unit tests passed.
- Screenshot frames and test metadata are delivered in the separate visual-proof ZIP.

## Known gaps / honest scope

- **No live WFM network or live Edge extension test** took place. The browser environment could render the real popup under a mocked runtime but blocked standalone extension service workers and local URLs. Validate login and DOM behaviour against an authenticated WFM session in your own browser.
- The user's shared v2 design has no Settings screen or reference for the new animation/loading/info/failed states. These cannot be called pixel-identical to an unspecified design. The original five static design templates were retained with requested changes, but live content will differ from the illustration.
- Bundled font binaries from the reference HTML are not copied into the extension. Machines without those installed may render system fallbacks.
- Future/overnight gap intervals do not get a fabricated progress proportion. The dotted inactive indicator appears whenever a meaningful segment-based countdown cannot be calculated.

## Install

1. Unzip the **flat** extension package.
2. In `edge://extensions` or `chrome://extensions`, enable Developer mode and choose **Load unpacked**.
3. Select the extracted folder containing `manifest.json`.
4. **Remove or disable the previous 0.4.3 extension**, to avoid duplicate content-script banners/toasts.
5. Open the popup to load the current week. Other weeks load on their first visit. Use Refresh to retry and Login if your WFM session has expired.

No WFM credentials or private user schedules are included in this package or screenshots.


## v0.4.6 UI refinement
- Remove the decorative green dot beside the Updated timestamp; retain timestamp and info button.
- Add confirmed success toasts for manual refresh, successful authenticated login, saving settings and diagnostics actions. Failures still produce error toasts.
- Animate schedule day/filter changes with a short 260-ms content movement/fade to prevent abrupt jumps as the Today-only countdown card enters/leaves. The single shared countdown ring retains its independent header-docking transition.
- Keep all existing WFM request constraints, event handling, background policy and design geometry unchanged. Animations respect system reduced-motion settings.


## v0.4.7 visual corrections
- Docked header ring displays rounded-up minutes (e.g. 2m), or seconds below 60s.
- Removed header rectangle backing when live countdown is docked; ring glow extends beyond SVG bounds.
- Reworked page-edge breathing into uniform full-viewport inset glow with progressive intensity, spread, colour, and frequency per spec §6.
- Corrected WFM banner text/button foreground contrast, and alert pill foreground styling.
- All WFM network request safeguards and cache flows remain unchanged.

## v0.4.12 island interaction correction
- X morphs the active alert island into its compact dot (does not dismiss the event or hide the edge glow).
- Snooze menu always closes when the island morphs compact, and remains open while being used.
- Snooze actions prevent double submission, close on success, and explain rejected requests.
- Island can be reopened on pointer return; no extra WFM network requests.

### v0.4.13 — Snooze hover interaction
- Hovering over the Snooze button opens its menu, without clicking.
- The menu remains open when the pointer travels from the button into the menu (180 ms gap tolerance), and closes after the pointer leaves both.
- Keyboard focus and click/touch access are preserved; X still collapses only the island.

## v0.4.14
- Snooze success displays a separate 3.5-second confirmation even while the edge alert is suppressed.
- Expanded island measures its width once per alert rather than every 125 ms; the morph no longer continually restarts.
- No WFM fetching or schedule logic changed.

## v0.4.16 — Snooze hover fixes
- Preserve hover-to-open while preventing mouse clicks from toggling an already hovered menu closed.
- Add a transparent pointer bridge between Snooze and the floating menu, with a short diagonal-movement fallback delay.
- Do not treat focus acquired from a mouse click as a reason to keep the menu open forever; preserve keyboard-visible focus.
- Keep automatic island collapse disabled while interacting with an open Snooze menu.
- No changes to background fetching, selected alert or snooze persistence.

## v0.4.17 — Snooze popover dismissal fix
- Clicking or interacting anywhere inside the Snooze card no longer dismisses it accidentally.
- Internal pointer events are checked inside the closed shadow root; outside clicks are detected using the shadow host boundary.
- Clicking outside the card and island still closes the menu; snooze action behavior is unchanged.
