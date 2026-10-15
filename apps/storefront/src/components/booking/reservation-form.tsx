'use client';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
export function ReservationForm({
  serviceId,
  resourceId,
  startsAt,
  requestId,
  visitorKey,
}: {
  serviceId: string;
  resourceId: string;
  startsAt: string;
  requestId: string;
  visitorKey: string;
}) {
  const router = useRouter();
  const [error, setError] = useState(''),
    [pending, setPending] = useState(false),
    key = useRef(requestId);
  return (
    <form
      className="interaction-form"
      method="post"
      action="/api/booking/reserve"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError('');
        const f = new FormData(e.currentTarget);
        try {
          const r = await fetch('/api/booking/reserve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...Object.fromEntries(f),
              requestId: key.current,
            }),
          });
          const v = await r.json();
          if (!r.ok) throw Error(v.error || 'Booking could not be completed.');
          router.push('/book/manage');
          router.refresh();
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Please try again.');
          setPending(false);
        }
      }}
    >
      <input type="hidden" name="visitorKey" value={visitorKey} />
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="serviceId" value={serviceId} />
      <input type="hidden" name="resourceId" value={resourceId} />
      <input type="hidden" name="startsAt" value={startsAt} />
      <label>
        Your name
        <input name="name" required maxLength={150} autoComplete="name" />
      </label>
      <label>
        Email for appointment updates
        <input
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="email"
        />
      </label>
      <label>
        Notes (optional)
        <textarea name="notes" maxLength={4000} rows={3} />
      </label>
      <p>Appointment emails do not subscribe you to marketing.</p>
      {error ? <p role="alert">{error}</p> : null}
      <button className="interaction-primary" disabled={pending}>
        {pending ? 'Reserving…' : 'Confirm appointment'}
      </button>
    </form>
  );
}
