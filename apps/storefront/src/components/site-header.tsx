import Link from 'next/link';

export function SiteHeader() {
  return (
    <header className="page-gutter flex min-h-18 items-center justify-between gap-6">
      <Link
        href="/"
        className="focus-ring inline-flex min-h-11 items-center font-display text-2xl tracking-[0.18em] uppercase"
      >
        Crater
      </Link>
      <nav aria-label="Primary">
        <ul className="flex items-center gap-2">
          <li>
            <Link
              href="/#collection"
              className="focus-ring inline-flex min-h-11 items-center px-2 font-semibold underline-offset-[0.25em] hover:underline"
            >
              Shop
            </Link>
          </li>
        </ul>
      </nav>
    </header>
  );
}
