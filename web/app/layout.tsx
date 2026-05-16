import type { Metadata } from 'next';
import './globals.css';

// Loaded via <link> (browser-time fetch from Google Fonts CDN) rather than
// next/font/google. The build-time fetcher hangs on the Thai subset in some
// dev networks; this avoids that and matches what we'd want in prod anyway.
// CSS variables --font-ui / --font-mono are declared in globals.css so the
// rest of the codebase can keep using var(--font-ui).

export const metadata: Metadata = {
  title: 'CareMind — Patient Care Coordination',
  description: 'AI-powered patient care coordination for hospitals.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=IBM+Plex+Sans+Thai+Looped:wght@300;400;500;600;700&display=swap"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
