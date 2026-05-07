import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CareMind — Patient Care Coordination',
  description: 'AI-powered patient care coordination dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
