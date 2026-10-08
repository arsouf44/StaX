import type { MetadataRoute } from 'next';

/** Manifeste web : nom, couleurs et icône de la plateforme. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Nemasus — Studio de sites web',
    short_name: 'Nemasus',
    description: 'Nous créons votre site. Vous le gérez ensuite.',
    lang: 'fr',
    start_url: '/',
    display: 'browser',
    background_color: '#F1F2F3',
    theme_color: '#F1F2F3',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}
