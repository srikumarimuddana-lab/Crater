import type { Metadata, Viewport } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import './globals.css';

// Soft old-style serif with true italics for the editorial headings (docs/visual-contract.md section 2).
const display = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-fraunces',
  style: ['normal', 'italic'],
  axes: ['opsz', 'SOFT'],
});

const body = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  axes: ['opsz'],
});

export const metadata: Metadata = {
  title: 'Crater — Herbal extracts preview',
  description: 'Preview storefront with sample products. Not a live shop; nothing can be purchased.',
  // Fixture preview: keep it out of search indexes until verified content replaces it.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#FFFDF8',
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
