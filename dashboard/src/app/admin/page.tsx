'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard/admin');
  }, [router]);
  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <p className="text-white/40">Redirecting to admin...</p>
    </div>
  );
}
