import {readFile,writeFile} from 'node:fs/promises';
// Compose the two supplied, independent references into a single page. Apart
// from namespacing the colliding day-picker classes and inserting that component,
// the original reference markup, styles, and demo scripts are preserved.
const journey=await readFile('shift-panel-journey (1).html','utf8'),day=await readFile('day-switcher.html','utf8');
const dayCSS=day.match(/<style>([\s\S]*?)<\/style>/)[1];
const css=dayCSS.slice(dayCSS.indexOf('  .bar{')).replaceAll('.bar','.week-bar').replaceAll('.range','.week-range').replaceAll('.summary','.week-summary');
const markup=day.match(/<main class="panel">([\s\S]*?)<\/main>/)[1].replaceAll('class="bar"','class="week-bar"').replaceAll('class="range"','class="week-range"').replaceAll('class="summary"','class="week-summary"');
const script=day.match(/<script>([\s\S]*?)<\/script>/)[1];
const output=journey.replace('</style>',css+'\n.week-picker{padding-top:16px;padding-bottom:16px}\n</style>');
const composed=output.replace('<div class="tabs"',`<section class="week-picker" aria-label="Choose a day">${markup}</section>\n<div class="tabs"`);
await writeFile('verification/reference-combined.html',composed.replace('</body>',`<script>${script}</script></body>`));
