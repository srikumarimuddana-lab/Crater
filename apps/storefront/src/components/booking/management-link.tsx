'use client';
import { useEffect, useState } from 'react';
export function ManagementLink() {
  const [error, setError] = useState('');
  useEffect(() => {
    const code = window.location.hash.slice(1);
    if (!code) return;
    window.history.replaceState(null, '', '/book/manage');
    void fetch('/api/booking/manage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'exchange', code }),
    })
      .then(async (r) => {
        if (r.ok) window.location.replace('/book/manage');
        else setError((await r.json()).error || 'Could not open appointment.');
      })
      .catch(() =>
        setError('Could not open this link. Paste your management code below.'),
      );
  }, []);
  return error ? <p role="alert">{error}</p> : null;
}
