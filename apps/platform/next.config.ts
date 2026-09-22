import type { NextConfig } from 'next';

/**
 * CSP des pages publiques prerendues.
 *
 * Volontairement ecrite a la main plutot que derivee du constructeur partage :
 * celui-ci pose `'strict-dynamic'`, qui neutralise `'unsafe-inline'` et
 * casserait l'amorcage de Next sur une page sans nonce. Deux politiques
 * differentes pour deux contraintes differentes, chacune assumee.
 */
const PUBLIC_CSP = [
  "default-src 'self'",
  // PAS d'empreinte ici, et c'est deliberé : « 'unsafe-inline' is ignored if
  // either a hash or nonce value is present ». Ajouter une seule empreinte
  // desactiverait 'unsafe-inline' et bloquerait tous les scripts d'amorcage de
  // Next sur les pages prerendues — qui, eux, n'ont pas d'empreinte stable.
  // Le script de theme est couvert par 'unsafe-inline' comme les autres.
  "script-src 'self' 'unsafe-inline' https://js.stripe.com https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "media-src 'self' https:",
  "connect-src 'self' https://api.stripe.com https://challenges.cloudflare.com",
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://challenges.cloudflare.com",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  'upgrade-insecure-requests',
].join('; ');

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
          // CSP des pages publiques.
          //
          // Elles sont prerendues : leur HTML est identique pour tout le
          // monde, donc aucun nonce ne peut y etre appose sans les rendre
          // dynamiques. `'unsafe-inline'` y est donc inevitable POUR LES
          // SCRIPTS D'AMORCAGE DE NEXT — et acceptable, parce que ces pages
          // ne portent ni session ni action sensible.
          //
          // Le reste des directives fait le vrai travail : pas d'objet, pas
          // de base injectee, pas de formulaire detourne vers un tiers, pas
          // d'encadrement par un site inconnu.
          //
          // Les chemins porteurs de session reçoivent, eux, une CSP a nonce
          // avec `'strict-dynamic'` : voir `src/middleware.ts`.
          { key: 'Content-Security-Policy', value: PUBLIC_CSP },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
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
