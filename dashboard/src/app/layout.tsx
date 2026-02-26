import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { GlassFilter } from '@/components/ui/liquid-glass';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Valnaa — Your Personal AI Agent',
  description:
    'The most powerful open-source AI agent, hosted for you. Zero setup. Ready in 60 seconds.',
  icons: {
    icon: '/favicon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} dark`}>
      <body className="min-h-screen bg-background font-sans antialiased">
        <GlassFilter />
        {children}
      </body>
    </html>
  );
}
