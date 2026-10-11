import Link from 'next/link';

export default function AdminNotFound() {
  return (
    <div className="a-card" style={{ maxWidth: 560 }}>
      <h1 className="a-title">Not found</h1>
      <p style={{ margin: '12px 0' }}>That record does not exist, or the link is out of date.</p>
      <Link className="a-btn" href="/admin">
        Back to the console
      </Link>
    </div>
  );
}
