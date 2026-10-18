const paths={
 settings:'<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
 back:'<path d="M15 6l-6 6 6 6"/>',next:'<path d="M9 6l6 6-6 6"/>',
 bell:'<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4l2-2z"/><path d="M10 21h4"/>',
 cup:'<path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9z"/><path d="M16 11h2a2 2 0 0 1 0 4h-2"/><path d="M8 3v3M12 3v3"/>',
 meal:'<path d="M6 3v6a2.5 2.5 0 0 0 5 0V3M8.5 11v10M17 3c-2 2-3 4.5-3 7.5h3V21"/>',
 people:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c2 .7 3.5 2.7 3.5 5.5"/>',
 flag:'<path d="M5 21V4"/><path d="M5 4h12l-2.5 4L17 12H5"/>',
 queue:'<path d="M4 8h13M13 4l4 4-4 4"/><path d="M20 16H7M11 12l-4 4 4 4"/>',
 ring:'<rect x="3" y="4" width="18" height="16" rx="3"/><rect x="7" y="8" width="10" height="8" rx="1.5"/>',
 check:'<path d="M5 12.5l4.5 4.5L19 7"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
};
export function icon(name,size=18,stroke=1.8){return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]??paths.flag}</svg>`;}

// Both sizes use the same geometry. pathLength normalizes progress without
// rounding the circumference or changing stroke thickness as the arc grows.
export function countdownRing(size=100){return `<svg class="countdown-svg" aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 20 20"><circle class="ring-track" cx="10" cy="10" r="7.5" pathLength="100" fill="none" stroke="var(--ln)" stroke-width="2"/><circle class="live-stroke" cx="10" cy="10" r="7.5" pathLength="100" fill="none" stroke="#30D6AC" stroke-width="2" stroke-linecap="round" stroke-dasharray="0 100" opacity="0" transform="rotate(-90 10 10)"/></svg>`;}

export function paintRing(svg,progress){
 if(!svg)return;
 const arc=svg.querySelector('.live-stroke'),p=Math.max(0,Math.min(1,progress));
 arc.setAttribute('opacity',p===0?'0':'1');
 if(p===1){arc.setAttribute('stroke-dasharray','none');arc.setAttribute('stroke-dashoffset','0');return;}
 // Rounded caps add one stroke-width to the visible arc; compensate so a
 // nearly finished countdown retains a clean gap instead of overlapping caps.
 const cap=2/(2*Math.PI*7.5)*100;
 arc.setAttribute('stroke-dasharray',`${Math.max(.001,p*100-cap)} 100`);
 arc.setAttribute('stroke-dashoffset',String(-cap/2));
}
