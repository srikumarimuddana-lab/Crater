import type {
  BookingService,
  BookingResource,
  BookingSettings,
  Slot,
  Window,
} from './types';
export function localParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return {
    date: `${v.year}-${v.month}-${v.day}`,
    minute: Number(v.hour) * 60 + Number(v.minute),
  };
}
export function availableSlots({
  service,
  resource,
  settings,
  date,
  busy,
  now,
}: {
  service: BookingService;
  resource: BookingResource;
  settings: BookingSettings;
  date: string;
  busy: { resourceId: string; busyStartsAt: string; busyEndsAt: string }[];
  now: Date;
}): Slot[] {
  if (
    !settings.enabled ||
    !settings.timezone ||
    !service.active ||
    !resource.active ||
    !service.resourceIds.includes(resource.id) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date)
  )
    return [];
  const day = Date.parse(`${date}T00:00:00Z`);
  if (
    !Number.isFinite(day) ||
    new Date(day).toISOString().slice(0, 10) !== date
  )
    return [];
  const today = localParts(now, settings.timezone).date;
  if (
    date < today ||
    day - Date.parse(`${today}T00:00:00Z`) > settings.horizonDays * 86400000
  )
    return [];
  const weekday = new Date(day).getUTCDay(),
    exception = resource.exceptions.find((e) => e.date === date);
  const windows: Window[] = exception
    ? exception.windows
    : resource.weekly.filter((w) => w.weekday === weekday);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: settings.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const candidates = new Map<number, number[]>();
  // Scan UTC instants, then resolve by local clock. This handles 23/25-hour days and fractional offsets.
  for (let t = day - 15 * 3600000; t <= day + 39 * 3600000; t += 60000) {
    const p = Object.fromEntries(
      formatter.formatToParts(t).map((p) => [p.type, p.value]),
    );
    if (`${p.year}-${p.month}-${p.day}` !== date) continue;
    const minute = Number(p.hour) * 60 + Number(p.minute);
    if (minute % 15) continue;
    candidates.set(minute, [...(candidates.get(minute) ?? []), t]);
  }
  const slots: Slot[] = [];
  for (const [minute, instants] of candidates) {
    if (instants.length !== 1) continue;
    const start = instants[0],
      end = start + service.durationMinutes * 60000,
      before = start - service.bufferBeforeMinutes * 60000,
      after = end + service.bufferAfterMinutes * 60000;
    if (start < now.getTime() + settings.minimumNoticeMinutes * 60000) continue;
    const beforeLocal = localParts(new Date(before), settings.timezone);
    const afterLocal = localParts(new Date(after), settings.timezone);
    const nextDate = new Date(day + 86400000).toISOString().slice(0, 10);
    const afterMinute =
      afterLocal.date === date
        ? afterLocal.minute
        : afterLocal.date === nextDate && afterLocal.minute === 0
          ? 1440
          : -1;
    if (
      beforeLocal.date !== date ||
      afterMinute < 0 ||
      !windows.some(
        (w) =>
          beforeLocal.minute >= w.startMinute && afterMinute <= w.endMinute,
      )
    )
      continue;
    const endLocal = localParts(new Date(end), settings.timezone);
    if (
      endLocal.date !== date ||
      endLocal.minute !== minute + service.durationMinutes
    )
      continue;
    if (
      busy.some(
        (b) =>
          b.resourceId === resource.id &&
          before < Date.parse(b.busyEndsAt) &&
          after > Date.parse(b.busyStartsAt),
      )
    )
      continue;
    slots.push({
      serviceId: service.id,
      resourceId: resource.id,
      startsAt: new Date(start).toISOString(),
      endsAt: new Date(end).toISOString(),
      timezone: settings.timezone,
    });
  }
  return slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
