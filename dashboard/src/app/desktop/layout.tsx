import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Valnaa Desktop',
  description:
    'Built to install OpenClaw and NemoClaw in one click. Native shell for gateway, sandbox, terminal, and browser relay.',
};

export default function DesktopLayout({ children }: { children: React.ReactNode }) {
  return children;
}
