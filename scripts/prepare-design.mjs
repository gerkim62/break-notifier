import {readFileSync,writeFileSync} from 'node:fs';
// Keep the provided design declarations verbatim. Only the day-picker's
// colliding class names are scoped, so both references can share one popup.
const journey=readFileSync('shift-panel-journey (1).html','utf8');
const days=readFileSync('day-switcher.html','utf8');
const css=html=>html.match(/<style>([\s\S]*?)<\/style>/)[1];
const dayCSS=css(days).slice(css(days).indexOf('  .bar{'))
 .replaceAll('.bar','.week-bar').replaceAll('.range','.week-range')
 .replaceAll('.summary','.week-summary');
writeFileSync('extension/popup-design.css',css(journey)+'\n/* Day switcher reference */\n'+dayCSS+'\n'+`
/* Integration around the reference components. Their geometry stays intact. */
html{width:300px;max-height:600px;overflow-x:hidden;color-scheme:dark}
body{width:300px}
.week-picker{padding-top:16px;padding-bottom:16px}
.week-picker .week-bar{margin-bottom:10px}
.schedule-footer{display:flex;justify-content:space-between;gap:8px;margin-top:12px;color:var(--muted);font-size:11px}
.schedule-footer button{padding:4px 0;border:0;background:none;color:var(--accent);font-size:11px}
.schedule-footer button:disabled{color:var(--muted);cursor:wait}
.schedule-footer .updated{display:flex;align-items:center;gap:4px;min-width:0}
.schedule-footer .updated span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:175px}
.schedule-footer .info-button{width:18px;height:18px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--muted);display:grid;place-items:center}
.notice{padding:10px 12px;margin:0 0 12px;background:var(--surface);border:1px solid var(--line);border-radius:12px;color:var(--muted);font-size:12px}
.notice button,.empty button{display:block;margin:10px auto 0;border:1px solid var(--line);border-radius:10px;background:var(--surface);color:var(--accent);padding:8px 12px;font-size:12px}
.notice button{margin-left:0}
.week-picker .day.unknown .pip{background:transparent;border:1px solid var(--muted)}
.week-picker .day.unknown[aria-pressed=true] .pip{border-color:var(--bg)}
.card .name{overflow-wrap:anywhere}
.fill,.bar b{transition:height 1s linear,width 1s linear}
.gap-row .grail .fill{transition:height 1s linear}
button:disabled{cursor:default;opacity:.6}
.diag-status{margin-top:4px;font-size:11px}
.popup-toast{position:fixed;z-index:80;left:50%;bottom:12px;transform:translateX(-50%);width:max-content;max-width:280px;padding:9px 14px;border:1px solid var(--line);border-radius:12px;background:var(--surface);color:var(--text);font-size:12px;text-align:center;box-shadow:0 8px 28px #0006}
.popup-toast.error{color:#FF9B9B}
.info-popover{position:fixed;z-index:70;bottom:45px;left:10px;right:10px;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:var(--surface);color:var(--soft);font-size:12px;box-shadow:0 8px 28px #0006}
.info-popover strong{display:block;margin-bottom:4px;color:var(--text)}
@media(prefers-reduced-motion:reduce){.fill,.bar b,.gap-row .grail .fill{transition:none}}
`);
writeFileSync('extension/popup.html','<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WFM Schedule Companion</title><link rel="stylesheet" href="popup-design.css"></head><body><main id="app" class="panel"></main><script type="module" src="popup.js"></script></body></html>\n');
