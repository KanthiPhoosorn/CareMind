import type { Metadata } from 'next';
import { IBM_Plex_Sans_Thai_Looped, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

const sansThai = IBM_Plex_Sans_Thai_Looped({
  subsets: ['latin', 'thai'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-ui',
  display: 'swap',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'CareMind — Patient Care Coordination',
  description: 'AI-powered patient care coordination for hospitals.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sansThai.variable} ${mono.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
