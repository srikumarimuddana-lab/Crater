import fs from 'node:fs';
import path from 'node:path';
import Image from 'next/image';
import Link from 'next/link';
import { brand } from '@/lib/content/brand';

const CANDIDATES = ['logo.svg', 'logo.png', 'logo.webp'];
/** The customer's logo file, used as supplied (public/brand/README.md). Resolved once per server process. */
const logoFile = CANDIDATES.find((f) => fs.existsSync(path.join(process.cwd(), 'public', 'brand', f))) ?? null;

export const hasLogoFile = logoFile !== null;

/** Header or footer brand link: the supplied logo image when present, otherwise the brand name as text. */
export function BrandLogo({ tone = 'light', size = 'header' }: { tone?: 'light' | 'green'; size?: 'header' | 'footer' }) {
  const box = size === 'footer' ? 'h-12 w-56 md:h-14 md:w-64' : 'h-9 w-40 md:h-11 md:w-48';
  return (
    <Link href="/" className="focus-ring inline-flex min-h-11 items-center">
      {logoFile ? (
        <span className={`relative block ${box}`}>
          <Image
            src={`/brand/${logoFile}`}
            alt={brand.name}
            fill
            unoptimized
            sizes="256px"
            {...(size === 'header' ? { preload: true } : {})}
            className="object-contain object-left"
          />
        </span>
      ) : (
        <span
          className={`whitespace-nowrap font-display text-[1.0625rem] font-bold leading-none tracking-tight md:text-xl ${tone === 'green' ? 'text-white' : 'text-deep'}`}
        >
          {brand.name}
        </span>
      )}
    </Link>
  );
}
