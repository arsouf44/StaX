import { isLegalValueConfigured, legalValue, platformUrl } from '@nemasus/config';
import { serializeJsonLd } from '@nemasus/security';
import { BRAND } from '@nemasus/ui/brand';
import type { FaqItem } from '~/content/faq';
import type { ProcessStep } from '~/content/process';

/**
 * Données structurées Schema.org du site public.
 *
 * Elles disent aux moteurs de recherche — et aux assistants qui s'en
 * servent — ce qu'est Nemasus, ce qu'il fait, pour qui et comment on commande,
 * avec les mêmes textes que la page : jamais d'avis, de note, de prix ni de
 * chiffre qui n'existeraient pas. Une valeur légale non configurée n'est pas
 * publiée (aucun marqueur « À CONFIGURER » dans un balisage).
 */

type Json = Record<string, unknown>;

function origin(): string {
  return platformUrl().replace(/\/+$/, '');
}

function configured(field: Parameters<typeof legalValue>[0]): string | undefined {
  return isLegalValueConfigured(field) ? legalValue(field) : undefined;
}

export function organizationId(): string {
  return `${origin()}/#organisation`;
}

export function organizationJsonLd(): Json {
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
            ...(phone ? { telephone: phone } : {}),
          },
        }
      : {}),
  };
}

export function websiteJsonLd(): Json {
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
export function serviceJsonLd(): Json {
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

export function faqJsonLd(items: readonly FaqItem[], url: string): Json {
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

export function howToJsonLd(name: string, steps: readonly ProcessStep[], url: string): Json {
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

export function breadcrumbJsonLd(trail: ReadonlyArray<{ name: string; path: string }>): Json {
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

export function webPageJsonLd(params: { path: string; name: string; description: string }): Json {
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

/** Un graphe JSON-LD, sérialisé sans risque d'injection (`</script>` neutralisé). */
export function JsonLd({ graph }: { graph: readonly Json[] }) {
  return (
    <script
      type="application/ld+json"
      // Sérialisation qui échappe `<`, `>` et `&` : un texte ne peut pas fermer la balise.
      dangerouslySetInnerHTML={{
        __html: serializeJsonLd({ '@context': 'https://schema.org', '@graph': graph }),
      }}
    />
  );
}
