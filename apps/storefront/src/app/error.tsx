'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { recovery } from '@/lib/content/shop-copy';

/** Route error boundary. No stack, ids or server message is rendered. */
export default function RouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="page-gutter flex flex-col items-center gap-5 py-24 text-center">
      <h1 className="max-w-[18ch]">{recovery.errorPageHeading}</h1>
      <div aria-hidden="true" className="ornament w-40" />
      <p className="max-w-[48ch] text-walnut">{recovery.errorPageBody}</p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <Button onClick={reset}>{recovery.retry}</Button>
        <Link href="/" className="focus-ring inline-flex min-h-13 items-center justify-center px-6 font-semibold underline underline-offset-4">
          {recovery.errorPageHome}
        </Link>
      </div>
    </main>
  );
}
