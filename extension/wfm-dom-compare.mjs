// Compare only fields observable in WFM's rendered My Schedule table.
// No requests, WFM navigation, inferred record types or replacement of RPC data.
export const WEEK_DAYS = 7;
const DAY = 86400000;
const iso = text => /^\d{4}-\d{2}-\d{2}$/.test(text ?? '') && !Number.isNaN(Date.parse(`${text}T00:00:00Z`));
const addDays = (date, count) => new Date(Date.parse(`${date}T00:00:00Z`) + count * DAY).toISOString().slice(0, 10);
const clock = local => typeof local === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00$/.test(local)
  ? {date: local.slice(0, 10), time: local.slice(11, 16)} : null;
const normalName = value => typeof value === 'string' ? value.trim().replace(/\s*\(\s*\)\s*$/, '').replace(/\s+/g, ' ') : '';
const dateRange = row => {
  const start = clock(row.startLocal), end = clock(row.endLocal);
  if (!start || !end || `${end.date}T${end.time}` <= `${start.date}T${start.time}`) return null;
  return {startDate:start.date, start:start.time, endDate:end.date, end:end.time};
};
export function safeDomObservation(reading, expectedWeekStart) {
  if (!reading?.ok || !iso(expectedWeekStart) || !Array.isArray(reading.days) || reading.days.length !== WEEK_DAYS) return null;
  const dates = reading.days.map(day => day.date);
  if (!dates.every((date, index) => date === addDays(expectedWeekStart, index))) return null;
  const days = [];
  for (const day of reading.days) {
    if (day.status === 'unavailable') {
      days.push({date:day.date, status:'unavailable'});
      continue;
    }
    if (day.status !== 'available' || !Array.isArray(day.records) || day.records[0]?.kind !== 'summary') return null;
    const summary = day.records[0];
    const bounds = dateRange(summary);
    if (!bounds) return null;
    const dayOff = normalName(summary.label) === 'Day Off' &&
      bounds.startDate === day.date && bounds.start === '00:00' &&
      bounds.endDate === addDays(day.date, 1) && bounds.end === '00:00';
    const details = [];
    for (const record of day.records.slice(1)) {
      const interval = dateRange(record);
      if (!interval || typeof record.label !== 'string') return null;
      details.push({name:normalName(record.label).slice(0, 180),...interval});
    }
    days.push({date:day.date,status:dayOff?'day_off':'scheduled',summary:bounds,details});
  }
  return {weekStart:expectedWeekStart,weekEnd:addDays(expectedWeekStart,6),days};
}
const eventKey = event => [normalName(event.name),event.startDate,event.start,event.endDate,event.end].join('|');
const sorting = (a,b) => a.localeCompare(b);
const COMPARABLE_NATIVE_TYPES = new Set([2,3,4,5,9]);
function comparisonForDay(observed, cached, nowEpoch, wallTime) {
  if (observed.status === 'unavailable' || cached.kind === 'unknown' || cached.kind === 'other')return {status:'inconclusive',reason:'unavailable_or_unclassified_day'};
  if (observed.status !== cached.kind) return {status:'changed',reason:'day_kind_changed'};
  if (observed.status === 'day_off') return {status:'same'};
  const shift = (cached.events ?? []).find(event => event.source === 'SchAgentDay');
  if (!shift) return {status:'inconclusive',reason:'cached_shift_missing'};
  const expected = [shift.startDate,shift.start,shift.endDate,shift.end].join('|');
  const current = [observed.summary.startDate,observed.summary.start,observed.summary.endDate,observed.summary.end].join('|');
  if (current !== expected) return {status:'changed',reason:'shift_bounds_changed'};
  // WFM's table may omit an activity-set (Work) row while still returning it in RPC.
  // Only compare separately displayed state intervals, never granular queue coverage.
  const native = (cached.events??[])
    .filter(event => event.source === 'SchState' && COMPARABLE_NATIVE_TYPES.has(event.stateType))
    .filter(event => typeof event.name === 'string' && event.name.trim());
  const nativeNames = new Set(native.map(event => normalName(event.name)));
  const shown = observed.details.filter(record => record.name !== 'Work');
  const unmatched = shown.filter(record => !nativeNames.has(record.name));
  if (unmatched.length) return {status:'inconclusive',reason:'unmatched_dom_activity',count:unmatched.length};
  const actual = shown.map(eventKey).sort(sorting);
  const expectedEvents = native.map(eventKey).sort(sorting);
  if (JSON.stringify(actual) !== JSON.stringify(expectedEvents)) {
    // Only future/in-progress mismatches are banner-worthy, not historical changes.
    const future = values => values.filter(key => {
      const parts=key.split('|');
      const end=wallTime(parts[3],parts[4]);
      return end!==null && end>nowEpoch;
    });
    if (JSON.stringify(future(actual)) !== JSON.stringify(future(expectedEvents))) return {status:'changed',reason:'state_interval_changed'};
    return {status:'historical_only'};
  }
  return {status:'same'};
}
export function compareDomToCached(observation, cachedWeek, settings, nowEpoch, wallTime, today) {
  if (!observation || !cachedWeek || observation.weekStart !== cachedWeek.weekStart) return {status:'inconclusive',reason:'week_not_cached'};
  const target = today;
  const observed=observation.days.find(day=>day.date===target),cached=cachedWeek.days?.find(day=>day.date===target);
  if (!observed || !cached) return {status:'inconclusive',reason:'today_unavailable'};
  // Entirely past shifts must not raise a change banner.
  const ends=(observed.summary && wallTime(observed.summary.endDate,observed.summary.end))??null;
  if (ends!==null && ends<=nowEpoch) return {status:'historical_only'};
  return comparisonForDay(observed,cached,nowEpoch,wallTime);
}
// Stable, deterministic, non-reversible identifier used for dismissing one observation.
export function observationId(observation) {
  let n=2166136261;
  const input=JSON.stringify(observation);
  for(let i=0;i<input.length;i++){n^=input.charCodeAt(i);n=Math.imul(n,16777619);}
  return (n>>>0).toString(16).padStart(8,'0');
}
