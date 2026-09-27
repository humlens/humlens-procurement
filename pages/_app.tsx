import type { AppProps } from 'next/app';
import { Inter } from 'next/font/google';
import { SessionProvider } from 'next-auth/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState } from 'react';
import { Toaster } from 'react-hot-toast';

import '@/styles/globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export default function App({ Component, pageProps: { session, ...pageProps } }: AppProps) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <SessionProvider session={session}>
      <QueryClientProvider client={queryClient}>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              fontSize: '13px',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            },
          }}
        />
        <div className={`${inter.variable} font-sans`}>
          <Component {...pageProps} />
        </div>
        {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />}
      </QueryClientProvider>
    </SessionProvider>
  );
}
