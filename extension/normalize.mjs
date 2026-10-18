// WFM 8.5 / schedule852 semantic adapter.
// Field identities were verified against the compiled GWT classes' Gb() labels.
// Preserve native SchCoverage / SchState separately. No merged or artificially
// split timeline: event candidates are direct projections of native boundaries.
const DAY_MS = 86400000;
const EPOCH = Date.UTC(1899, 11, 30);
const SERIAL_EPSILON = 1e-7;
const MINUTES_PER_DAY = 1440;
// These type names come from the original GWT's State subclasses' Yx()/Qnc()
// methods: S_DAY_OFF=1, S_TIME_OFF=2, S_EXCEPTION=3, S_BREAK=4,
// S_MEAL=5, S_ACTIVITY_SET=7, S_SHIFT=8, S_MARKED_TIME=9.
// Type 6 is the SchCoverage activity-allocation class, not a SchState type.
const STATE_CATEGORIES = new Map([
  [1, 'day_off'], [2, 'time_off'], [3, 'exception'],
  [4, 'break'], [5, 'meal'], [7, 'activity_set'],
  [8, 'shift'], [9, 'marked_time'],
]);
const SUPPORTED_STATE_TYPES = new Set(STATE_CATEGORIES.keys());
const BREAK_OR_MEAL_TYPES = new Set([4, 5]);
// All native timed records are preserved as events; classification is descriptive,
// not a gate for notification eligibility. The notifier decides what to announce.
const STATE_TYPE = Object.freeze({ DAY_OFF: 1, TIME_OFF: 2, EXCEPTION: 3, BREAK: 4, MEAL: 5, WORK: 7, ACTIVITY: 6 });

const items = value => Array.isArray(value?.a) ? value.a : [];
const serialDay = serial => Math.floor(serial + SERIAL_EPSILON);
const dateOf = serial => new Date(EPOCH + serialDay(serial) * DAY_MS).toISOString().slice(0, 10);
const typeKey = (stateType, stateId) => `${stateType}:${stateId}`;
const nativeType = value => { try { return Object.getPrototypeOf(value)?.Und?.Ih?.() ?? null; } catch { return null; } };
const positiveInteger = value => Number.isSafeInteger(value) && value > 0;
const validMinutes = value => Number.isSafeInteger(value) && Math.abs(value) < 10080;
const validSerial = value => Number.isFinite(value) && value > 0;
const clock = minute => {
  const normalized = ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
};
const serialMinutes = (serial, startOfDay) => Math.round((serial - startOfDay) * MINUTES_PER_DAY);
const serialClock = serial => clock(Math.round((serial - serialDay(serial)) * MINUTES_PER_DAY));
const minuteClockFields = (startMinute, endMinute) => {
  const startOffset = Math.floor(startMinute / MINUTES_PER_DAY);
  const endOffset = Math.floor(endMinute / MINUTES_PER_DAY);
  return {
    start: clock(startMinute), end: clock(endMinute),
    ...(startOffset !== 0 ? { startDayOffset: startOffset } : {}),
    ...(endOffset !== 0 ? { endDayOffset: endOffset } : {}),
  };
};

export function isoWeek(input) {
  if (typeof input !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input)) throw new Error('Invalid YYYY-MM-DD date');
  const parsed = new Date(`${input}T00:00:00Z`);
  if (!Number.isFinite(+parsed) || parsed.toISOString().slice(0, 10) !== input) throw new Error('Invalid YYYY-MM-DD date');
  parsed.setUTCDate(parsed.getUTCDate() - (parsed.getUTCDay() + 6) % 7);
  return Array.from({ length: 7 }, (_, i) => new Date(+parsed + i * DAY_MS).toISOString().slice(0, 10));
}

function nativeShift(day, warn) {
  // WFM represents a published day off with identical shift timestamps
  // (e.g. 46312/46312); this is an intentional 'no shift' sentinel.
  if (day.H === day.F) {
    if (day.r === 4) warn('scheduled_day_without_shift', { field: 'wmShiftStartEnd' });
    return null;
  }
  if (!validSerial(day.H) && !validSerial(day.F)) {
    if (day.r === 4) warn('scheduled_day_without_shift', { field: 'wmShiftStartEnd' });
    return null;
  }
  if (!validSerial(day.H) || !validSerial(day.F) || day.F <= day.H) {
    warn('native_shift_bounds_unsupported', { field: 'wmShiftStartEnd' });
    return null;
  }
  const startDate = dateOf(day.H), endDate = dateOf(day.F);
  return {
    start: serialClock(day.H), end: serialClock(day.F),
    ...(startDate !== endDate ? { startDate, endDate } : {}),
  };
}

function coverageSegments(day, definition, warn) {
  const result = [];
  for (const segment of items(day.a)) {
    const native = { activityId: segment.a, startMinute: segment.c, endMinute: segment.b, kind: 'allocation' };
    if (!validMinutes(segment.c) || !validMinutes(segment.b) || segment.b <= segment.c) {
      warn('native_coverage_bounds_unsupported', { field: 'SchCoverage' });
      result.push({ ...native, unparsed: true });
      continue; // An invalid allocation cannot invalidate other native intervals.
    }
    const info = definition.get(typeKey(STATE_TYPE.ACTIVITY, segment.a));
    if (!info) warn('missing_activity_definition', { nativeStateType: STATE_TYPE.ACTIVITY, nativeStateId: segment.a });
    result.push({
      ...native, activityName: info?.name ?? null,
      ...minuteClockFields(segment.c, segment.b),
      durationMinutes: segment.b - segment.c,
    });
  }
  return result.sort((a, b) => (a.startMinute ?? 0) - (b.startMinute ?? 0));
}

function stateSegments(day, definition, warn) {
  const startOfDay = serialDay(day.q);
  const result = [];
  for (const state of items(day.k)) {
    const native = { stateId: state.i, stateType: state.j, startSerial: state.g, endSerial: state.a, kind: 'state' };
    if (!validSerial(state.g) || !validSerial(state.a) || state.a <= state.g) {
      warn('native_state_bounds_unsupported', { field: 'SchState', nativeStateType: state.j });
      result.push({ ...native, unparsed: true });
      continue;
    }
    const info = definition.get(typeKey(state.j, state.i));
    if (!info) warn('missing_state_definition', { nativeStateType: state.j, nativeStateId: state.i });
    if (!SUPPORTED_STATE_TYPES.has(state.j)) warn('native_state_type_unsupported', { nativeStateType: state.j, nativeStateId: state.i });
    const startMinute = serialMinutes(state.g, startOfDay);
    const endMinute = serialMinutes(state.a, startOfDay);
    if (endMinute <= startMinute) {
      warn('native_state_minute_bounds_unsupported', { field: 'SchState', nativeStateType: state.j });
      result.push({ ...native, unparsed: true });
      continue;
    }
    result.push({
      ...native, activityName: info?.name ?? null,
      ...minuteClockFields(startMinute, endMinute),
      durationMinutes: endMinute - startMinute,
      stateCategory: STATE_CATEGORIES.get(state.j) ?? null,
      paid: !!state.c, paidMinutes: state.d,
      startMinute, endMinute,
    });
  }
  return result.sort((a, b) => (a.startMinute ?? 0) - (b.startMinute ?? 0));
}

// A native event is a record with explicit start/end times from WFM. We never
// split, merge or subtract native intervals. Overlaps remain, with their source.
function nativeEvents(rawDay, shift, states, work, warn) {
  const events = [];
  if (shift !== null) {
    events.push({
      kind: 'shift', source: 'SchAgentDay',
      start: shift.start, end: shift.end,
      startDate: dateOf(rawDay.H), endDate: dateOf(rawDay.F),
    });
  }
  for (const state of states) {
    if (state.unparsed) continue;
    if (!state.activityName?.trim()) warn('native_event_name_unavailable', { nativeStateType: state.stateType, nativeStateId: state.stateId });
    events.push({
      kind: state.stateCategory ?? 'state', source: 'SchState',
      name: state.activityName ?? null,
      stateType: state.stateType, stateId: state.stateId,
      start: state.start, end: state.end,
      startDate: dateOf(state.startSerial), endDate: dateOf(state.endSerial),
    });
  }
  for (const allocation of work) {
    if (allocation.unparsed) continue;
    if (!allocation.activityName?.trim()) warn('native_event_name_unavailable', { nativeStateType: STATE_TYPE.ACTIVITY, nativeStateId: allocation.activityId });
    // SchCoverage timings are already relative to the native wmDate.
    events.push({
      kind: 'allocation', source: 'SchCoverage',
      name: allocation.activityName ?? null,
      activityId: allocation.activityId,
      start: allocation.start, end: allocation.end,
      startDate: dateOf(rawDay.q + allocation.startMinute / MINUTES_PER_DAY),
      endDate: dateOf(rawDay.q + allocation.endMinute / MINUTES_PER_DAY),
    });
  }
  // Stable chronological ordering does not modify any source interval.
  return events.sort((a,b)=>a.startDate.localeCompare(b.startDate)||a.start.localeCompare(b.start)||a.end.localeCompare(b.end));
}

function emptyDay(date) {
  return {
    date, kind: 'unknown', shift: null, paidMinutes: null, workMinutes: null,
    events: [], workSegments: [], states: [], breaks: [],
    comments: null, exception: null, raw: null,
  };
}

export function normalizeWfmHolder(holder, requestedDate, { source = 1, onWarning = () => {} } = {}) {
  if (!nativeType(holder)?.endsWith('.SchAgentDayHolder')) throw new Error('Not a SchAgentDayHolder');
  const dates = isoWeek(requestedDate);
  const warnings = [];
  const warn = (code, fields = {}) => {
    const event = { code, ...fields };
    warnings.push(event);
    onWarning(event);
  };
  const nativeDefinitions = new Map();
  for (const def of items(holder.n)) {
    const key = typeKey(def.i, def.g);
    if (nativeDefinitions.has(key)) warn('duplicate_native_state_definition', { nativeStateType: def.i, nativeStateId: def.g });
    nativeDefinitions.set(key, {
      id: def.g, stateType: def.i, name: def.e, shortName: def.f,
      activitySetId: def.a, fullDay: def.d, tradeRule: def.j,
    });
  }
  const agent = items(holder.a?.p)[0];
  const byDate = new Map();
  for (const raw of items(holder.d)) {
    if (!validSerial(raw.q)) { warn('native_day_date_invalid', { field: 'wmDate' }); continue; }
    const date = dateOf(raw.q);
    const index = dates.indexOf(date);
    if (index < 0) continue;
    if (byDate.has(date)) { warn('duplicate_native_schedule_day', { dayIndex: index }); continue; }
    const dayWarn = (code, fields = {}) => warn(code, { dayIndex: index, ...fields });
    const work = coverageSegments(raw, nativeDefinitions, dayWarn);
    const states = stateSegments(raw, nativeDefinitions, dayWarn);
    const kind = raw.r === 1 ? 'day_off' : raw.r === 4 ? 'scheduled' : 'other';
    if (kind === 'other') dayWarn('native_day_type_unclassified', { nativeDayType: raw.r });
    const exceptionInfo = positiveInteger(raw.t) ? nativeDefinitions.get(typeKey(STATE_TYPE.EXCEPTION, raw.t)) : null;
    if (positiveInteger(raw.t) && !exceptionInfo) dayWarn('native_exception_definition_missing', { nativeExceptionTypeId: raw.t });
    const timeOffInfo = positiveInteger(raw.M) ? nativeDefinitions.get(typeKey(STATE_TYPE.TIME_OFF, raw.M)) : null;
    if (positiveInteger(raw.M) && !timeOffInfo) dayWarn('native_time_off_definition_unavailable', { nativeTimeOffTypeId: raw.M });
    const shift = nativeShift(raw, dayWarn);
    if (kind === 'day_off' && shift) dayWarn('day_off_with_native_shift', { field: 'wmShiftStartEnd' });
    const events = nativeEvents(raw, shift, states, work, dayWarn);
    if (states.some(item => item.unparsed) || work.some(item => item.unparsed)) {
      dayWarn('native_events_incomplete', { field: 'SchState/SchCoverage' });
    }
    const preservedWork = work;
    const preservedStates = states;
    byDate.set(date, {
      date, kind, shift,
      paidMinutes: raw.B, workMinutes: raw.P,
      // Events use actual native interval boundaries only; no synthetic timeline.
      events, workSegments: preservedWork, states: preservedStates,
      // Native 4 = BREAK and native 5 = MEAL per the GWT State subclasses.
      // Never classify by English text or locally fixed break IDs.
      breaks: states.filter(s => !s.unparsed && BREAK_OR_MEAL_TYPES.has(s.stateType)),
      comments: raw.p || null,
      exception: positiveInteger(raw.t) ? {
        typeId: raw.t, name: exceptionInfo?.name ?? null,
        shortName: exceptionInfo?.shortName ?? null, comment: raw.p || null,
      } : null,
      ...(positiveInteger(raw.M) ? { timeOff: {
        typeId: raw.M, name: timeOffInfo?.name ?? null, shortName: timeOffInfo?.shortName ?? null,
      } } : {}),
      raw: {
        stateCode: raw.r, dayType: raw.r,
        shiftCode: raw.G, shiftId: raw.G,
        paidMinutes: raw.B, workMinutes: raw.P,
        shiftStartSerial: raw.H, shiftEndSerial: raw.F,
        exceptionTypeId: raw.t, timeOffTypeId: raw.M,
        comments: raw.p || null, dayStartSerial: raw.q,
      },
    });
  }
  const days = dates.map((date, index) => {
    if (byDate.has(date)) return byDate.get(date);
    warn('no_native_day_record', { dayIndex: index });
    return emptyDay(date);
  });
  return {
    ok: true, source, weekStart: dates[0], weekEnd: dates[6],
    agent: agent ? { id: agent.a, login: agent.c, displayName: agent.e } : null,
    days,
    // Expose names without collisions between 1:0 (Day Off) and 7:0 (Work).
    activityMap: Object.fromEntries(nativeDefinitions),
    missingDates: days.filter(day => day.kind === 'unknown').map(day => day.date),
    warnings,
  };
}
