import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Public_Sans } from 'next/font/google';
import { brand } from '@/lib/content/brand';
import './globals.css';

// Nuda's heavy headline face (client decision 2026-10-11) and a plain body face; both open licence.
const display = Bricolage_Grotesque({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-bricolage',
  axes: ['opsz'],
});

const body = Public_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-public-sans',
});

export const metadata: Metadata = {
  title: `${brand.name} — preview`,
  description: 'Preview storefront with sample products. Not a live shop; nothing can be purchased.',
  // Fixture preview: keep it out of search indexes until verified content replaces it.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#226C5D',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-CA" className={`${display.variable} ${body.variable}`}>
      <body>
        <a href="#main" className="skip-link focus-ring">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
