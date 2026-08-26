'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import dynamic from 'next/dynamic';

const TransitDashboard = dynamic(
  () => import('@/components/transit-dashboard').then((module) => module.TransitDashboard),
  {
    ssr: false,
    loading: () => (
      <main className="grid h-dvh place-items-center bg-[var(--background)]">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-[var(--primary-soft)] border-t-[var(--primary)]" />
          <p className="text-sm font-semibold">İstanbulum hazırlanıyor</p>
        </div>
      </main>
    ),
  },
);

export default function Home() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false },
        },
      }),
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={queryClient}>
        <TransitDashboard />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
