import {readFileSync,writeFileSync} from 'node:fs';
// Scope the supplied day picker, journey and settings styles. The original
// schedule templates, countdown and overall popup dimensions remain intact.
const journey=readFileSync('shift-panel-journey (1).html','utf8');
const days=readFileSync('day-switcher.html','utf8');
const css=html=>html.match(/<style>([\s\S]*?)<\/style>/)[1];
const timelineCSS=css(journey).slice(css(journey).indexOf('  /* journey timeline */'),css(journey).indexOf('  .alert-link'));
const settingsCSS=css(journey).slice(css(journey).indexOf('  /* settings (compact) */'));
const dayCSS=css(days).slice(css(days).indexOf('  .bar{'),css(days).indexOf('  .summary{')).replaceAll('.bar','.week-bar').replaceAll('.range','.week-range');
writeFileSync('extension/schedule-components.css',`
/* Scoped reference components; no global popup or settings overrides. */
.journey,.week-picker,.settings-reference{
 --surface:var(--sf);--surface2:var(--bg);--line:var(--ln);--line2:var(--ln);
 --text:var(--tx);--soft:var(--tx);--muted:var(--mu);--accent:var(--ac);
 --amber:#F6BD4B;--coral:#FF9B7A;--violet:#B69CFF;--green:#5BD6A4;--sky:#6CC4F0;
 --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;--dm:17px;
 font:14px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
}
.journey *, .week-picker *{box-sizing:border-box}
.journey svg,.week-picker svg{display:block;flex-shrink:0}
.week-picker button{font:inherit;color:inherit;cursor:pointer}
.journey :focus-visible,.week-picker :focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.week-picker [hidden]{display:none!important}
.week-picker{margin:2px 12px 10px;flex:none;overflow:visible}
.week-picker{
 ${dayCSS}
 .week-range{font-size:13px}
 .week-bar{height:30px;margin-bottom:8px}
 .day{height:52px}
 .arrow{background:var(--bg)}
 .track{overflow:visible}
 .day.unknown .pip{background:transparent;border:1px solid var(--muted)}
 .day.unknown[aria-pressed=true] .pip{border-color:var(--bg)}
 @media(prefers-reduced-motion:reduce){.thumb{transition:none}}
}
.tb.journey{display:block;padding:2px 12px 12px}
.journey{
 .row{margin:0;padding:0;border:0;border-radius:0;background:transparent;overflow:visible}
 .card .bar{display:block;width:auto;margin:0;align-self:auto}
 ${timelineCSS}
 .timeline{margin-top:0}
 .ev{padding-bottom:8px}
 .ev .tail{margin-bottom:-8px}
 .ev:has(+.gap-row){padding-bottom:0}
 .ev:has(+.gap-row) .tail{margin-bottom:0}
 .card .name{overflow-wrap:anywhere}
 .card{padding-top:8px;padding-bottom:8px}
 .fill,.bar b{transition:height 1s linear,width 1s linear}
 @media(prefers-reduced-motion:reduce){.fill,.bar b{transition:none}}
}
.settings-reference{
 ${settingsCSS}
 .settings-heading{display:flex;align-items:center;gap:8px;padding:12px 14px;flex:none}
 .settings-heading h1{margin:0;font-size:18px;font-weight:700;letter-spacing:-.01em}
 .settings-back{width:40px;height:40px;display:grid;place-items:center;border:0;border-radius:12px;background:transparent;color:var(--soft);cursor:pointer}
 .settings-body{display:block;padding:0 14px 16px}
 .presets{grid-template-columns:repeat(3,minmax(0,1fr))}
 .tile{display:flex;align-items:center;justify-content:center;background:var(--tint);color:var(--c);flex-shrink:0}
 .opt .t{font-weight:400}
 .preview svg{color:var(--accent)}
 .actions .btn{height:auto;border-radius:0;box-shadow:none;cursor:pointer}
 .sw{cursor:pointer}
 #diag-status:empty{display:none}
 *,*::before,*::after{box-sizing:border-box}
 button{font:inherit;color:inherit}
 svg{display:block;flex-shrink:0}
}
@media(prefers-color-scheme:light){
 .journey,.week-picker,.settings-reference{--amber:#A46A00;--coral:#BF5134;--violet:#7953C8;--green:#158968;--sky:#257DA7}
 .week-picker .day[aria-pressed="true"] .num{color:#fff}
 .week-picker .day[aria-pressed="true"] .dow{color:rgba(255,255,255,.75)}
 .week-picker .day[aria-pressed="true"] .pip{background:#fff}
}
`);
