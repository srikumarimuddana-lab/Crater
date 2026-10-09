import type { Metadata, Viewport } from 'next';
import { Bodoni_Moda, Manrope } from 'next/font/google';
import './globals.css';

const display = Bodoni_Moda({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-bodoni',
  style: ['normal', 'italic'],
});

const body = Manrope({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-manrope',
});

export const metadata: Metadata = {
  title: 'Crater — Herbal extracts preview',
  description: 'Preview storefront with sample products. Not a live shop; nothing can be purchased.',
  // Fixture preview: keep it out of search indexes until verified content replaces it.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#0E2417',
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
