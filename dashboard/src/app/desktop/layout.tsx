import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Valnaa Desktop',
  description:
    'Built to make AI simple. Valnaa is the best way to install and use OpenClaw and NemoClaw. Gateway, sandbox, terminal, and browser relay in one app.',
};

export default function DesktopLayout({ children }: { children: React.ReactNode }) {
  return children;
}
