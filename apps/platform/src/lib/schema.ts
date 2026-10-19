import { isLegalValueConfigured, legalValue, platformUrl } from '@nemasus/config';
import { BRAND } from '@nemasus/ui/brand/tokens';
import type { FaqItem } from '~/content/faq';
import type { ProcessStep } from '~/content/process';
import { internationalPhone } from './phone';

/**
 * Données structurées Schema.org du site public.
 *
 * Module pur : chaque fonction renvoie un objet, rien n'est rendu. C'est ce
 * qui permet aux tests de vérifier le balisage sans React, et à `JsonLd`
 * (dans `structured-data.tsx`) de rester une simple balise `<script>`.
 *
 * Elles disent aux moteurs de recherche — et aux assistants qui s'en
 * servent — ce qu'est Nemasus, ce qu'il fait, pour qui et comment on commande,
 * avec les mêmes textes que la page : jamais d'avis, de note, de prix ni de
 * chiffre qui n'existeraient pas. Une valeur légale non configurée n'est pas
 * publiée (aucun marqueur « À CONFIGURER » dans un balisage).
 */

/** Un noeud du graphe Schema.org : un objet, serialise tel quel. */
export type SchemaNode = Record<string, unknown>;

function origin(): string {
  return platformUrl().replace(/\/+$/, '');
}

function configured(field: Parameters<typeof legalValue>[0]): string | undefined {
  return isLegalValueConfigured(field) ? legalValue(field) : undefined;
}

export function organizationId(): string {
  return `${origin()}/#organisation`;
}

export function organizationJsonLd(): SchemaNode {
  const email = configured('SUPPORT_EMAIL');
  const phone = configured('SUPPORT_PHONE') ?? configured('LEGAL_PHONE');
  const legalName = configured('LEGAL_COMPANY_NAME');
  const address = configured('LEGAL_ADDRESS');
  const siren = configured('LEGAL_SIREN');
  const vat = configured('LEGAL_VAT');
  return {
    '@type': 'Organization',
    '@id': organizationId(),
    name: BRAND.name,
    ...(legalName ? { legalName } : {}),
    url: `${origin()}/`,
    logo: { '@type': 'ImageObject', url: `${origin()}/icon.svg` },
    image: `${origin()}/opengraph-image`,
    slogan: BRAND.tagline,
    description:
      'Studio français de conception et de développement de sites web professionnels. ' +
      'Nemasus conçoit, développe et met en ligne le site de chaque entreprise, puis le lui ' +
      'confie avec un éditeur pour gérer ses contenus.',
    areaServed: { '@type': 'Country', name: 'France' },
    knowsLanguage: 'fr',
    ...(address
      ? { address: { '@type': 'PostalAddress', streetAddress: address, addressCountry: 'FR' } }
      : {}),
    ...(siren
      ? { identifier: { '@type': 'PropertyValue', propertyID: 'SIREN', value: siren } }
      : {}),
    ...(vat ? { vatID: vat } : {}),
    ...(email || phone
      ? {
          contactPoint: {
            '@type': 'ContactPoint',
            contactType: 'customer support',
            availableLanguage: 'French',
            ...(email ? { email } : {}),
            ...(phone ? { telephone: internationalPhone(phone) } : {}),
          },
        }
      : {}),
  };
}

export function websiteJsonLd(): SchemaNode {
  return {
    '@type': 'WebSite',
    '@id': `${origin()}/#site`,
    url: `${origin()}/`,
    name: BRAND.name,
    description: BRAND.tagline,
    inLanguage: 'fr-FR',
    publisher: { '@id': organizationId() },
  };
}

/** Le service vendu, décrit sans prix : le montant est convenu avec chaque client. */
export function serviceJsonLd(): SchemaNode {
  return {
    '@type': 'Service',
    '@id': `${origin()}/#service`,
    name: 'Conception, développement et mise en ligne de sites web professionnels',
    serviceType: 'Création de site web sur mesure',
    provider: { '@id': organizationId() },
    areaServed: { '@type': 'Country', name: 'France' },
    audience: {
      '@type': 'BusinessAudience',
      audienceType: 'Entreprises, indépendants, professions libérales et associations',
    },
    description:
      'Nemasus conçoit et développe le site de votre entreprise dans un projet qui lui est propre, ' +
      'le met en ligne sur votre domaine en HTTPS, puis vous le livre avec un éditeur : vous ' +
      'modifiez ensuite vos textes, photos et informations, et publiez quand vous le souhaitez. ' +
      'Commande en ligne, paiement par virement bancaire, accès à l’espace client par code personnel.',
    termsOfService: `${origin()}/cgv`,
    url: `${origin()}/comment-ca-marche`,
  };
}

export function faqJsonLd(items: readonly FaqItem[], url: string): SchemaNode {
  return {
    '@type': 'FAQPage',
    '@id': `${origin()}${url}#faq`,
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
}

export function howToJsonLd(name: string, steps: readonly ProcessStep[], url: string): SchemaNode {
  return {
    '@type': 'HowTo',
    '@id': `${origin()}${url}#parcours`,
    name,
    inLanguage: 'fr-FR',
    step: steps.map((step, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      name: step.title,
      text: step.description,
      url: `${origin()}${url}#etape-${index + 1}`,
    })),
  };
}

export function breadcrumbJsonLd(trail: ReadonlyArray<{ name: string; path: string }>): SchemaNode {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((entry, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: entry.name,
      item: `${origin()}${entry.path}`,
    })),
  };
}

export function webPageJsonLd(params: {
  path: string;
  name: string;
  description: string;
}): SchemaNode {
  return {
    '@type': 'WebPage',
    '@id': `${origin()}${params.path}#page`,
    url: `${origin()}${params.path}`,
    name: params.name,
    description: params.description,
    inLanguage: 'fr-FR',
    isPartOf: { '@id': `${origin()}/#site` },
    about: { '@id': organizationId() },
  };
}

/**
 * Fil d'Ariane depuis l'accueil.
 *
 * Toutes les pages du site sont à un ou deux niveaux de la racine : plutôt que
 * de réécrire « Accueil » sur chaque page, on le pose ici une fois pour
 * toutes. Le fil affiché par Google vient de ce balisage ; une page qui n'en
 * a pas montre son URL brute dans les résultats.
 */
export function trailFrom(...trail: ReadonlyArray<{ name: string; path: string }>): SchemaNode {
  return breadcrumbJsonLd([{ name: 'Accueil', path: '/' }, ...trail]);
}

/**
 * Page de liste : les fonctionnalités, les réalisations, le centre d'aide.
 *
 * L'`ItemList` donne aux moteurs — et aux assistants qui les citent — la liste
 * complète des entrées avec leur URL, sans qu'ils aient à deviner quels liens
 * de la page sont le contenu et lesquels sont la navigation.
 */
export function collectionPageJsonLd(params: {
  path: string;
  name: string;
  description: string;
  items: ReadonlyArray<{ name: string; path: string; description?: string }>;
}): SchemaNode {
  return {
    '@type': 'CollectionPage',
    '@id': `${origin()}${params.path}#page`,
    url: `${origin()}${params.path}`,
    name: params.name,
    description: params.description,
    inLanguage: 'fr-FR',
    isPartOf: { '@id': `${origin()}/#site` },
    about: { '@id': organizationId() },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: params.items.length,
      itemListOrder: 'https://schema.org/ItemListUnordered',
      itemListElement: params.items.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: item.name,
        ...(item.description ? { description: item.description } : {}),
        url: `${origin()}${item.path}`,
      })),
    },
  };
}

/** Page de contact : le type dit aux moteurs comment nous joindre. */
export function contactPageJsonLd(params: {
  path: string;
  name: string;
  description: string;
}): SchemaNode {
  return {
    ...webPageJsonLd(params),
    '@type': 'ContactPage',
  };
}

/** Page « à propos » : rattachée à l'organisation qu'elle décrit. */
export function aboutPageJsonLd(params: {
  path: string;
  name: string;
  description: string;
}): SchemaNode {
  return {
    ...webPageJsonLd(params),
    '@type': 'AboutPage',
    mainEntity: { '@id': organizationId() },
  };
}

/**
 * Document juridique daté.
 *
 * `dateModified` est la version du texte, pas la date du jour : un document
 * qui se déclare modifié à chaque passage du robot perd la confiance qu'une
 * date stable lui donne.
 */
export function legalPageJsonLd(params: {
  path: string;
  name: string;
  description: string;
  version?: string;
}): SchemaNode {
  return {
    ...webPageJsonLd(params),
    ...(params.version ? { dateModified: params.version } : {}),
    publisher: { '@id': organizationId() },
  };
}
