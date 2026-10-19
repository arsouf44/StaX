import type { Metadata } from 'next';
import { isIndexable } from '@nemasus/config';
import { BRAND } from '@nemasus/ui/brand/tokens';

/**
 * Description de page pour les moteurs de recherche : 158 caractères au plus,
 * au-delà desquels les résultats la tronquent. Coupée en fin de phrase quand
 * c'est possible, sinon sur un mot, jamais au milieu.
 */
export function metaDescription(text: string, max = 158): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const sentence = clean.slice(0, max + 1).lastIndexOf('. ');
  if (sentence >= 90) return clean.slice(0, sentence + 1);
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[\s,;:–—-]+$/, '')}…`;
}

export interface PageSeo {
  /** Chemin absolu de la page, tel qu'il figure dans le plan du site. */
  path: string;
  /** Titre de l'onglet et du résultat de recherche, sans le nom de la marque. */
  title: string;
  description: string;
  /**
   * Titre de partage, lorsqu'il doit différer du titre de l'onglet : un
   * résultat de recherche se lit hors contexte, une carte de partage avec
   * l'image et le nom du site déjà visibles.
   */
  shareTitle?: string;
  /** `article` pour les documents datés (textes juridiques versionnés). */
  type?: 'website' | 'article';
  /** Date de la dernière révision, pour les documents versionnés. */
  modified?: string;
  /** `false` retire la page des moteurs tout en gardant ses métadonnées. */
  index?: boolean;
}

/**
 * Métadonnées d'une page publique.
 *
 * Une seule fonction pour toutes les pages du site : le lien canonique,
 * l'Open Graph et la carte X/Twitter y sont construits ensemble, à partir du
 * même chemin. C'est ce qui empêche la faute la plus courante — un `og:url`
 * ou une image héritée de la page d'accueil sur trente pages différentes,
 * qui fait partager le mauvais titre et brouille la page réellement visée.
 *
 * `metadataBase` (défini par la mise en page racine) résout les chemins
 * relatifs en URL absolues : les moteurs et les réseaux sociaux n'acceptent
 * que des URL complètes.
 */
export function pageMetadata(page: PageSeo): Metadata {
  const description = metaDescription(page.description);
  const shareTitle = page.shareTitle ?? `${page.title} — ${BRAND.name}`;

  return {
    title: page.title,
    description,
    alternates: { canonical: page.path },
    openGraph: {
      type: page.type ?? 'website',
      locale: 'fr_FR',
      siteName: BRAND.name,
      url: page.path,
      title: shareTitle,
      description,
      images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: BRAND.name }],
      ...(page.modified && page.type === 'article' ? { modifiedTime: page.modified } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: shareTitle,
      description,
      images: ['/twitter-image'],
    },
    /*
     * `robots` par page ECRASE celui de la mise en page racine : la regle qui
     * retire le site des moteurs tant qu'il n'a pas son propre domaine doit
     * donc etre reprise ici, sinon chaque page la contredirait.
     */
    robots: !isIndexable()
      ? // Le site ne s'est pas reconnu : rien n'est explore, rien n'est indexe.
        { index: false, follow: false }
      : page.index === false
        ? // Cette page-la n'est pas indexable, mais ses liens restent suivis.
          { index: false, follow: true }
        : {
            index: true,
            follow: true,
            googleBot: {
              index: true,
              follow: true,
              'max-image-preview': 'large',
              'max-snippet': -1,
            },
          },
  };
}
