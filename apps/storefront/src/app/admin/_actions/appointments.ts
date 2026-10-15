'use server';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin/session';
import { requireSubmissionOrigin } from '@/lib/communications/public-forms';
import { getBooking, getBookingStore } from '@/lib/booking';
import { reconcileBooking } from '@/lib/booking/notifications';
import { getOperationsStore } from '@/lib/operations/store';
import type { ActionResult } from '@/lib/communications/form';
import type { Capability } from '@/lib/admin/types';
const v = (f: FormData, k: string) => String(f.get(k) ?? '');
async function perform(
  cap: Capability,
  run: (actor: string) => Promise<void>,
): Promise<ActionResult> {
  try {
    requireSubmissionOrigin(
      new Request(process.env.SITE_URL || 'http://localhost', {
        headers: await headers(),
      }),
    );
    const s = await requireAdmin(cap);
    await run(s.staff.id);
    revalidatePath('/admin/appointments', 'layout');
    revalidatePath('/book', 'layout');
    return { message: 'Appointment changes saved.' };
  } catch (e) {
    return {
      error:
        e instanceof Error ? e.message : 'Could not save appointment changes.',
    };
  }
}
export async function saveBookingSettings(_: ActionResult, f: FormData) {
  return perform('appointments:configure', async (actor) => {
    await (
      await getBooking()
    ).saveSettings(
      {
        enabled: f.get('enabled') === 'on',
        timezone: v(f, 'timezone'),
        heading: v(f, 'heading'),
        intro: v(f, 'intro'),
        staffEmails: v(f, 'staffEmails')
          .split(/[\s,]+/)
          .filter(Boolean),
        minimumNoticeMinutes: Number(f.get('minimumNoticeMinutes')),
        horizonDays: Number(f.get('horizonDays')),
        cancellationNoticeMinutes: Number(f.get('cancellationNoticeMinutes')),
        reminderMinutes: Number(f.get('reminderMinutes')),
        retentionDays: Number(f.get('retentionDays')),
        version: Number(f.get('version')),
      },
      Number(f.get('version')),
      actor,
    );
  });
}
const minute = (value: string) => {
  if (!/^\d{2}:\d{2}$/.test(value))
    throw Error('Use HH:MM availability times.');
  const [h, m] = value.split(':').map(Number);
  if (h > 23 || m > 59) throw Error('Use valid availability times.');
  return h * 60 + m;
};
export async function saveBookingResource(_: ActionResult, f: FormData) {
  return perform('appointments:configure', async (actor) => {
    const weekly = [];
    for (let d = 0; d < 7; d++)
      if (f.get(`day${d}`) === 'on')
        weekly.push({
          weekday: d,
          startMinute: minute(v(f, `start${d}`)),
          endMinute: minute(v(f, `end${d}`)),
        });
    const exceptions = v(f, 'exceptions')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((line) => {
        const [date, start, end] = line.split(',').map((s) => s.trim());
        return {
          date,
          windows:
            start === 'closed'
              ? []
              : [{ startMinute: minute(start), endMinute: minute(end) }],
        };
      });
    await (
      await getBooking()
    ).saveResource(
      {
        id: v(f, 'id'),
        name: v(f, 'name'),
        active: f.get('active') === 'on',
        weekly,
        exceptions,
        version: Number(f.get('version')),
      },
      Number(f.get('version')),
      actor,
    );
  });
}
export async function saveBookingService(_: ActionResult, f: FormData) {
  return perform('appointments:configure', async (actor) => {
    await (
      await getBooking()
    ).saveService(
      {
        id: v(f, 'id'),
        name: v(f, 'name'),
        description: v(f, 'description'),
        durationMinutes: Number(f.get('durationMinutes')),
        bufferBeforeMinutes: Number(f.get('bufferBeforeMinutes')),
        bufferAfterMinutes: Number(f.get('bufferAfterMinutes')),
        resourceIds: f.getAll('resourceIds').map(String),
        active: f.get('active') === 'on',
        version: Number(f.get('version')),
      },
      Number(f.get('version')),
      actor,
    );
  });
}
export async function changeAppointment(_: ActionResult, f: FormData) {
  return perform('appointments:manage', async (actor) => {
    const b = await getBooking(),
      input = {
        requestId: v(f, 'requestId'),
        expectedVersion: Number(f.get('version')),
      };
    if (v(f, 'action') === 'cancel')
      await b.cancel(v(f, 'id'), '', input, { actor, reason: v(f, 'reason') });
    else if (v(f, 'action') === 'reschedule')
      await b.reschedule(
        v(f, 'id'),
        '',
        {
          ...input,
          resourceId: v(f, 'resourceId'),
          startsAt: v(f, 'startsAt'),
        },
        { actor, reason: v(f, 'reason') },
      );
    else
      await b.status(
        v(f, 'id'),
        v(f, 'action') as 'completed' | 'no_show',
        input.expectedVersion,
        actor,
      );
    try {
      await reconcileBooking(
        await getBookingStore(),
        await getOperationsStore(),
      );
    } catch {
      /* Worker recovery owns committed events. */
    }
  });
}
