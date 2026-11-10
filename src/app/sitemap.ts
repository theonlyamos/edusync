import type { MetadataRoute } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://insyte.vercel.app';

/** Public pages only; everything else needs a sign-in. */
export default function sitemap(): MetadataRoute.Sitemap {
  return ['', '/demo', '/signup', '/login', '/register-school', '/support', '/developers', '/privacy', '/terms'].map((path) => ({
    url: `${siteUrl}${path}`,
    changeFrequency: path === '' ? 'weekly' : 'monthly',
    priority: path === '' ? 1 : 0.5,
  }));
}
