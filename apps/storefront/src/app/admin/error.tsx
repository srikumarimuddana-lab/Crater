'use client';

/** Admin error boundary. No stack, ids or server message is rendered. */
export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="a-authwrap">
      <div className="a-card a-authcard" role="alert">
        <h1 className="a-title" style={{ fontSize: 22 }}>
          Something went wrong
        </h1>
        <p style={{ margin: '12px 0' }}>The page could not load. Nothing was changed. Try again, or sign in again if it keeps happening.</p>
        <div className="a-row">
          <button type="button" className="a-btn is-primary" onClick={reset}>
            Try again
          </button>
          <a href="/admin">Back to the console</a>
        </div>
      </div>
    </div>
  );
}
