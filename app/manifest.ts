import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Ipon — Continuous Savings & Net Worth',
    short_name: 'Ipon',
    description: 'Mobile-first money, cutoff, food, accounts, and net worth tracker.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#f6f3ea',
    theme_color: '#1f5d4c',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}