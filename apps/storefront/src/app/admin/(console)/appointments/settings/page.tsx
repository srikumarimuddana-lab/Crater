import Link from 'next/link';
import { gate } from '@/app/admin/_lib/gate';
import { getBooking } from '@/lib/booking';
import { PageHeader, Card, Notice } from '@/components/admin/ui';
import { ActionForm } from '@/lib/communications/form';
import { Field, TextArea, Hidden } from '@/lib/communications/admin-ui';
import {
  saveBookingSettings,
  saveBookingResource,
  saveBookingService,
} from '@/app/admin/_actions/appointments';
const time = (m: number) =>
  `${Math.floor(m / 60)
    .toString()
    .padStart(2, '0')}:${(m % 60).toString().padStart(2, '0')}`;
export default async function BookingSettings() {
  const g = await gate('appointments:configure');
  if (!g.ok) return g.view;
  const s = await (await getBooking()).read(),
    c = s.settings;
  return (
    <>
      <PageHeader
        title="Appointment settings"
        actions={
          <Link className="a-btn" href="/admin/appointments">
            Appointments
          </Link>
        }
      />
      <Notice>
        Configure resources, then services, then enable booking. Email requires
        Resend, the communications worker and a verified sender. No services are
        assumed for your business.
      </Notice>
      <Card title="Booking page and policies">
        <ActionForm action={saveBookingSettings} label="Save booking settings">
          <Hidden name="version" value={c.version} />
          <label>
            <input type="checkbox" name="enabled" defaultChecked={c.enabled} />{' '}
            Enable public booking
          </label>
          <Field
            name="heading"
            label="Booking page heading"
            value={c.heading}
            required
          />
          <TextArea name="intro" label="Booking introduction" value={c.intro} />
          <Field
            name="timezone"
            label="Business timezone (IANA, for example America/Regina)"
            value={c.timezone}
          />
          <Field
            name="staffEmails"
            label="Staff notification emails (comma separated)"
            value={c.staffEmails.join(', ')}
          />
          {[
            ['minimumNoticeMinutes', 'Minimum notice (minutes)'],
            ['horizonDays', 'Advance booking horizon (days)'],
            [
              'cancellationNoticeMinutes',
              'Cancellation / reschedule cutoff (minutes before start)',
            ],
            [
              'reminderMinutes',
              'Email reminder before appointment (minutes; 0 disables)',
            ],
            ['retentionDays', 'Contact retention after appointment (days)'],
          ].map(([name, label]) => (
            <Field
              key={name}
              name={name}
              label={label}
              type="number"
              value={String(c[name as keyof typeof c])}
            />
          ))}
        </ActionForm>
      </Card>
      <Card title="Team and resources">
        <p>
          One appointment reserves one resource. Uncheck a day to close it. Date
          exceptions override the weekly schedule.
        </p>
        {[
          ...s.resources,
          {
            id: '',
            name: '',
            active: true,
            weekly: [],
            exceptions: [],
            version: 0,
          },
        ].map((r, i) => (
          <details key={r.id || 'new'} open={!r.id}>
            <summary>{r.name || 'Add a resource'}</summary>
            <ActionForm action={saveBookingResource} label="Save resource">
              <Hidden name="version" value={r.version} />
              {r.id ? (
                <>
                  <Hidden name="id" value={r.id} />
                  <p>Resource ID: {r.id}</p>
                </>
              ) : (
                <Field name="id" label="Unique resource ID" required />
              )}
              <Field
                name="name"
                label="Resource name"
                value={r.name}
                required
              />
              <label>
                <input
                  type="checkbox"
                  name="active"
                  defaultChecked={r.active}
                />{' '}
                Active resource
              </label>
              {[
                'Sunday',
                'Monday',
                'Tuesday',
                'Wednesday',
                'Thursday',
                'Friday',
                'Saturday',
              ].map((day, d) => {
                const w = r.weekly.find((w) => w.weekday === d);
                return (
                  <fieldset key={`${i}-${d}`}>
                    <legend>{day}</legend>
                    <label>
                      <input
                        name={`day${d}`}
                        type="checkbox"
                        defaultChecked={Boolean(w)}
                      />{' '}
                      Available
                    </label>
                    <Field
                      name={`start${d}`}
                      label={`${day} start`}
                      type="time"
                      value={time(w?.startMinute ?? 540)}
                    />
                    <Field
                      name={`end${d}`}
                      label={`${day} end`}
                      type="time"
                      value={time(w?.endMinute ?? 1020)}
                    />
                  </fieldset>
                );
              })}
              <label>
                Date exceptions
                <textarea
                  name="exceptions"
                  rows={4}
                  defaultValue={r.exceptions
                    .map((e) =>
                      e.windows.length
                        ? `${e.date},${time(e.windows[0].startMinute)},${time(e.windows[0].endMinute)}`
                        : `${e.date},closed`,
                    )
                    .join('\n')}
                />
              </label>
              <p className="a-muted">
                One per line: 2026-12-25,closed or 2026-12-24,09:00,13:00
              </p>
            </ActionForm>
          </details>
        ))}
      </Card>
      <Card title="Services">
        {[
          ...s.services,
          {
            id: '',
            name: '',
            description: '',
            active: true,
            durationMinutes: 30,
            bufferBeforeMinutes: 0,
            bufferAfterMinutes: 0,
            resourceIds: [],
            version: 0,
          },
        ].map((v) => (
          <details key={v.id || 'new'} open={!v.id}>
            <summary>{v.name || 'Add a service'}</summary>
            <ActionForm action={saveBookingService} label="Save service">
              <Hidden name="version" value={v.version} />
              {v.id ? (
                <Hidden name="id" value={v.id} />
              ) : (
                <Field name="id" label="Unique service ID" required />
              )}
              <Field name="name" label="Service name" value={v.name} required />
              <TextArea
                name="description"
                label="Service description"
                value={v.description}
              />
              <label>
                <input
                  type="checkbox"
                  name="active"
                  defaultChecked={v.active}
                />{' '}
                Active service
              </label>
              {[
                ['durationMinutes', 'Duration (minutes)'],
                ['bufferBeforeMinutes', 'Buffer before (minutes)'],
                ['bufferAfterMinutes', 'Buffer after (minutes)'],
              ].map(([name, label]) => (
                <Field
                  key={name}
                  name={name}
                  label={label}
                  type="number"
                  value={String(v[name as keyof typeof v])}
                />
              ))}
              <fieldset>
                <legend>Assigned resources</legend>
                {s.resources.map((r) => (
                  <label key={r.id}>
                    <input
                      type="checkbox"
                      name="resourceIds"
                      value={r.id}
                      defaultChecked={v.resourceIds.includes(r.id)}
                    />
                    {r.name}
                  </label>
                ))}
              </fieldset>
            </ActionForm>
          </details>
        ))}
      </Card>
    </>
  );
}
