import type { MetadataRoute } from 'next';

/** Lets people add InsyteAI to a phone or tablet home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'InsyteAI',
    short_name: 'InsyteAI',
    description: 'AI tutoring, lessons and homework for schools.',
    start_url: '/login',
    scope: '/',
    display: 'standalone',
    background_color: '#f7f4ee',
    theme_color: '#1f5e4b',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
