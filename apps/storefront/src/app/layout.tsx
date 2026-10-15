import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { getPageMetadata } from '@/lib/content/cms/metadata';
import './globals.css';
import './remedy.css';

const display = localFont({ src: '../../public/remedy/cabinet.woff2', display: 'swap', variable: '--font-bodoni', weight: '900' });
const body = localFont({ src: '../../public/remedy/public-sans.woff2', display: 'swap', variable: '--font-manrope', weight: '700' });

export async function generateMetadata(): Promise<Metadata> {
  return { ...await getPageMetadata('global'), robots: { index: false, follow: false } };
}

export const viewport: Viewport = {
  themeColor: '#2f8751',
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
