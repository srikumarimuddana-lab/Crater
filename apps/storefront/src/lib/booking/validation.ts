import {
  integer,
  text,
  InteractionError,
} from '@/lib/public-interactions/validation';
import { normalizeEmail } from '@/lib/crm/service';
import { checkBookingKey } from './tokens';
import type {
  BookingSettings,
  BookingResource,
  BookingService,
  Window,
} from './types';
const id = (s: string) => {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(s))
    throw new InteractionError(
      'Use an ID containing letters, numbers, dashes or underscores.',
    );
  return s;
};
function windows(w: Window[]) {
  if (!Array.isArray(w) || w.length > 30)
    throw new InteractionError('Use up to 30 availability windows.');
  const sorted = [...w].sort((a, b) => a.startMinute - b.startMinute);
  for (let i = 0; i < sorted.length; i++) {
    integer(sorted[i].startMinute, 0, 1439);
    integer(sorted[i].endMinute, 1, 1440);
    if (
      sorted[i].startMinute >= sorted[i].endMinute ||
      (i && sorted[i - 1].endMinute > sorted[i].startMinute)
    )
      throw new InteractionError(
        'Availability windows must not overlap or run backwards.',
      );
  }
}
export function validateSettings(v: BookingSettings) {
  if (typeof v.enabled !== 'boolean')
    throw new InteractionError('Choose whether booking is enabled.');
  if (v.timezone) {
    try {
      new Intl.DateTimeFormat('en', { timeZone: v.timezone }).format();
    } catch {
      throw new InteractionError('Enter a valid IANA timezone.');
    }
  }
  if (v.enabled) {
    if (!v.timezone)
      throw new InteractionError('Configure a business timezone.');
    checkBookingKey();
  }
  text(v.heading, 150);
  text(v.intro, 2000);
  integer(v.minimumNoticeMinutes, 0, 43200);
  integer(v.horizonDays, 1, 365);
  integer(v.cancellationNoticeMinutes, 0, 43200);
  integer(v.reminderMinutes, 0, 43200);
  integer(v.retentionDays, 1, 3650);
  if (!Array.isArray(v.staffEmails) || v.staffEmails.length > 10)
    throw new InteractionError('Use up to ten staff email addresses.');
  return { ...v, staffEmails: [...new Set(v.staffEmails.map(normalizeEmail))] };
}
export function validateResource(v: BookingResource) {
  id(v.id);
  text(v.name, 150);
  if (
    typeof v.active !== 'boolean' ||
    !Array.isArray(v.weekly) ||
    !Array.isArray(v.exceptions) ||
    v.weekly.length > 30 ||
    v.exceptions.length > 366
  )
    throw new InteractionError('Invalid resource availability.');
  for (let d = 0; d < 7; d++) windows(v.weekly.filter((w) => w.weekday === d));
  for (const w of v.weekly) integer(w.weekday, 0, 6);
  if (new Set(v.exceptions.map((e) => e.date)).size !== v.exceptions.length)
    throw new InteractionError('One exception per date is allowed.');
  for (const e of v.exceptions) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(e.date) ||
      new Date(e.date).toISOString().slice(0, 10) !== e.date
    )
      throw new InteractionError('Invalid exception date.');
    windows(e.windows);
  }
  return v;
}
export function validateService(v: BookingService) {
  id(v.id);
  text(v.name, 150);
  text(v.description, 2000);
  integer(v.durationMinutes, 5, 480);
  integer(v.bufferBeforeMinutes, 0, 240);
  integer(v.bufferAfterMinutes, 0, 240);
  if (
    typeof v.active !== 'boolean' ||
    !Array.isArray(v.resourceIds) ||
    v.resourceIds.length > 30 ||
    !v.resourceIds.length
  )
    throw new InteractionError('Assign at least one resource.');
  v.resourceIds.forEach(id);
  return v;
}
