import type { NextConfig } from 'next';

/**
 * Configuration Next.js de la plateforme StaX.
 *
 * Cible : Cloudflare Workers via OpenNext. Les paquets de l espace de travail
 * sont compiles par Next (ils sont publies en TypeScript source), et les
 * en-tetes de securite sont poses ici pour couvrir TOUTES les reponses, y
 * compris les ressources statiques et les pages d erreur.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  transpilePackages: [
    '@stax/ui',
    '@stax/types',
    '@stax/config',
    '@stax/validation',
    '@stax/payments',
    '@stax/business',
    '@stax/security',
    '@stax/site-engine',
    '@stax/database',
    '@stax/auth',
    '@stax/emails',
    '@stax/analytics',
  ],

  typescript: {
    // Aucune erreur de type n est ignoree : la CI echoue avant le deploiement.
    ignoreBuildErrors: false,
  },
  // Le lint tourne dans son propre job de CI, pas pendant le build.

  images: {
    // Sur Workers, l optimiseur d images Next n est pas disponible : les
    // ressources passent par Cloudflare Images / le CDN.
    unoptimized: true,
    formats: ['image/avif', 'image/webp'],
  },

  experimental: {
    optimizePackageImports: ['lucide-react'],
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          {
            key: 'Permissions-Policy',
            value:
              'accelerometer=(), camera=(), geolocation=(self), gyroscope=(), magnetometer=(), microphone=(), payment=(self "https://js.stripe.com"), usb=(), interest-cohort=()',
          },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
      {
        // L espace client et le back-office ne doivent jamais etre mis en
        // cache, ni par le navigateur, ni par un cache partage.
        source: '/(app|admin)/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, private' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
      {
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },

  async redirects() {
    return [
      { source: '/login', destination: '/connexion', permanent: true },
      { source: '/signup', destination: '/inscription', permanent: true },
      { source: '/pricing', destination: '/tarifs', permanent: true },
      { source: '/dashboard', destination: '/app', permanent: true },
      { source: '/cgu-cgv', destination: '/cgv', permanent: true },
    ];
  },
};

export default nextConfig;
