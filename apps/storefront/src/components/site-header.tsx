import Link from 'next/link';

export function SiteHeader() {
  return (
    <header className="on-dark border-b border-gold/30 bg-forest-deep text-ivory">
      <div className="page-gutter grid min-h-20 grid-cols-[1fr_auto_1fr] items-center gap-4">
        <span aria-hidden="true" className="hidden text-eyebrow text-gold md:block">
          Skincare atelier
        </span>
        <Link
          href="/"
          className="focus-ring col-start-2 inline-flex min-h-11 items-center font-display text-2xl tracking-[0.32em] text-gold-light uppercase md:text-3xl"
        >
          Crater
        </Link>
        <nav aria-label="Primary" className="col-start-3 justify-self-end">
          <ul className="flex items-center gap-2">
            <li>
              <Link
                href="/#collection"
                className="focus-ring inline-flex min-h-11 items-center px-2 text-eyebrow text-ivory underline-offset-[0.4em] hover:text-gold-light hover:underline"
              >
                Shop
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
