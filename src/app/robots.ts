import type { MetadataRoute } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://insyte.vercel.app';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/admin/', '/school/', '/teachers/', '/students/', '/learn/', '/embed/', '/assessments/', '/activate/'],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
