import { isLegalValueConfigured, legalValue, platformUrl } from '@nemasus/config';
import { BRAND } from '@nemasus/ui/brand/tokens';
import { FAQ_CATEGORIES, FAQ_ITEMS, type FaqItem } from '~/content/faq';
import { FEATURE_PAGES } from '~/content/features';
import { ORDER_JOURNEY, PROCESS_STEPS } from '~/content/process';
import { COMPANY_LINKS, FEATURE_LINKS, RESOURCE_LINKS } from '~/lib/navigation';

/**
 * `llms.txt` et `llms-full.txt` : le site, écrit pour être lu par une machine.
 *
 * Une entreprise qui cherche à faire faire son site pose aujourd'hui sa
 * question à un assistant autant qu'à un moteur. L'assistant répond avec ce
 * qu'il a pu extraire de pages conçues pour des yeux humains — et comble les
 * trous. Ces deux fichiers suppriment les trous : ils énoncent en texte brut
 * ce qu'est Nemasus, ce qu'il n'est pas, comment on commande et ce qu'on peut
 * modifier ensuite.
 *
 * Tout est construit depuis les sources déjà utilisées par les pages (le
 * parcours, les fonctionnalités, la foire aux questions, l'arborescence) :
 * aucune phrase n'est écrite ici deux fois, donc aucune ne peut se
 * désynchroniser du site. Rien n'est inventé — ni prix, ni délai, ni chiffre,
 * ni référence client — et une valeur légale non configurée est omise plutôt
 * que remplie d'un marqueur.
 */

function origin(): string {
  return platformUrl().replace(/\/+$/, '');
}

function configured(field: Parameters<typeof legalValue>[0]): string | undefined {
  return isLegalValueConfigured(field) ? legalValue(field) : undefined;
}

/** Une ligne par lien, au format attendu : `- [nom](url) : note`. */
function linkLines(links: ReadonlyArray<{ label: string; href: string; description?: string }>) {
  return links.map(
    (link) =>
      `- [${link.label}](${origin()}${link.href})${link.description ? ` : ${link.description}` : ''}`,
  );
}

/**
 * Ce qu'un assistant doit savoir avant tout : le modèle de vente, parce que
 * c'est ce qu'il se trompe le plus souvent à décrire. Nemasus ressemble, vu de
 * loin, à un créateur de sites en ligne ; il ne l'est pas.
 */
function essentials(): string[] {
  return [
    '- **Ce que c’est** : un studio qui conçoit et développe le site de chaque entreprise sur mesure, le met en ligne, puis le lui confie.',
    '- **Ce que ce n’est pas** : ni créateur de sites en ligne, ni éditeur par glisser-déposer, ni bibliothèque de modèles. Le client ne construit pas son site et ne choisit aucun modèle.',
    '- **Qui fait le site** : notre équipe, dans un projet propre à chaque client (dépôt de code et hébergement dédiés), sur le domaine du client, en HTTPS.',
    '- **Ce que le client fait après la livraison** : il modifie lui-même ses textes, ses photos, ses horaires et ses informations, puis publie. Chaque publication est un déploiement réel, annoncé en ligne seulement une fois confirmé.',
    '- **Ce que le client ne peut pas faire seul** : ajouter une page, déplacer des sections ou changer le design — ce sont des modifications de structure que l’équipe réalise.',
    '- **Prix** : aucun prix public, aucune grille tarifaire, aucun abonnement affiché. Le montant est convenu par écrit avec chaque client après étude de sa demande.',
    '- **Commande** : en ligne, sans compte à créer, sans paiement et sans engagement à cette étape ; ou par téléphone, la commande étant alors saisie par l’équipe.',
    '- **Paiement** : par virement bancaire, sur les coordonnées et la référence envoyées par l’équipe. Aucune carte bancaire n’est demandée.',
    '- **Accès à l’espace client** : par un code d’accès personnel à usage unique, envoyé à réception du virement et vérifié côté serveur.',
    '- **Encaissements du client** : lorsqu’un site vend ou encaisse, l’argent arrive sur le compte bancaire du client ; Nemasus ne prélève aucune commission.',
    '- **Zone et langue** : France, en français.',
  ];
}

/** Le parcours réel, étape par étape, depuis la source unique du site. */
function journey(): string[] {
  return ORDER_JOURNEY.concat(PROCESS_STEPS).map(
    (step, index) => `${index + 1}. **${step.title}** — ${step.description}`,
  );
}

function contactLines(): string[] {
  const email = configured('SUPPORT_EMAIL');
  const phone = configured('SUPPORT_PHONE') ?? configured('LEGAL_PHONE');
  const company = configured('LEGAL_COMPANY_NAME');
  return [
    ...(company ? [`- Éditeur : ${company}`] : []),
    ...(email ? [`- E-mail : ${email}`] : []),
    ...(phone ? [`- Téléphone : ${phone}`] : []),
    `- Formulaire de contact : ${origin()}/contact`,
    `- Demande de devis : ${origin()}/devis`,
  ];
}

/**
 * `llms.txt` : la carte du site.
 *
 * Court par construction — un titre, un résumé, les faits, le parcours, puis
 * des liens. Un assistant qui n'en lit qu'une partie doit déjà avoir le
 * modèle de vente correct.
 */
export function llmsTxt(): string {
  return [
    `# ${BRAND.name}`,
    '',
    `> ${BRAND.tagline} ${BRAND.name} est un studio français de conception et de développement de sites web professionnels : notre équipe conçoit, développe et met en ligne le site de chaque entreprise, puis le lui confie avec un éditeur pour en gérer le contenu.`,
    '',
    'Ce fichier décrit le site public de Nemasus pour les assistants et les moteurs de recherche générative. Il est produit depuis les mêmes sources que les pages du site.',
    '',
    '## L’essentiel',
    '',
    ...essentials(),
    '',
    '## Le parcours, de la commande à la mise en ligne',
    '',
    ...journey(),
    '',
    '## Pages principales',
    '',
    `- [Accueil](${origin()}/) : la promesse, le parcours et les questions fréquentes.`,
    `- [Comment ça marche](${origin()}/comment-ca-marche) : commande, virement, code d’accès, développement, livraison.`,
    `- [Fonctionnalités](${origin()}/fonctionnalites) : ce que le client gère lui-même après la livraison.`,
    `- [Réalisations](${origin()}/realisations) : un exemple de site conçu par l’équipe.`,
    `- [Projets sur mesure](${origin()}/sur-mesure) : les demandes traitées sur devis.`,
    `- [Questions fréquentes](${origin()}/faq) : ${FAQ_ITEMS.length} réponses.`,
    '',
    '## Fonctionnalités',
    '',
    ...linkLines(FEATURE_LINKS),
    '',
    '## Ressources',
    '',
    ...linkLines(RESOURCE_LINKS),
    '',
    '## L’entreprise',
    '',
    ...linkLines(COMPANY_LINKS),
    '',
    '## Contact',
    '',
    ...contactLines(),
    '',
    '## Pour aller plus loin',
    '',
    `- [llms-full.txt](${origin()}/llms-full.txt) : le contenu complet — fonctionnalités détaillées, limites assumées et toutes les questions fréquentes.`,
    `- [Plan du site](${origin()}/sitemap.xml)`,
    '',
  ].join('\n');
}

function faqSection(category: FaqItem['category']): string[] {
  const items = FAQ_ITEMS.filter((item) => item.category === category);
  if (items.length === 0) return [];
  return [
    `### ${FAQ_CATEGORIES[category]}`,
    '',
    ...items.flatMap((item) => [`**${item.question}**`, '', item.answer, '']),
  ];
}

/**
 * `llms-full.txt` : tout le contenu public, en un seul texte.
 *
 * Y compris les limites de chaque fonctionnalité — ce que le produit ne fait
 * pas. Un assistant qui ne lit que des arguments de vente promet à notre place
 * des choses que nous ne livrons pas, et c'est le client qui le découvre.
 */
export function llmsFullTxt(): string {
  return [
    `# ${BRAND.name} — contenu complet`,
    '',
    `> ${BRAND.tagline}`,
    '',
    'Studio français de conception et de développement de sites web professionnels. Ce fichier rassemble le contenu du site public : les faits, le parcours, chaque fonctionnalité avec ses limites, et toutes les questions fréquentes.',
    '',
    '## L’essentiel',
    '',
    ...essentials(),
    '',
    '## Le parcours, de la commande à la mise en ligne',
    '',
    ...journey(),
    '',
    '## Fonctionnalités',
    '',
    ...FEATURE_PAGES.flatMap((feature) => [
      `### ${feature.name}`,
      '',
      `${origin()}/fonctionnalites/${feature.slug}`,
      '',
      feature.subtitle,
      '',
      ...feature.sections.flatMap((section) => [
        `**${section.title}** — ${section.body}`,
        '',
        ...(section.points ? [...section.points.map((point) => `- ${point}`), ''] : []),
      ]),
      ...(feature.limits
        ? ['Limites assumées :', '', ...feature.limits.map((limit) => `- ${limit}`), '']
        : []),
    ]),
    '## Questions fréquentes',
    '',
    ...faqSection('general'),
    ...faqSection('commande'),
    ...faqSection('acces'),
    ...faqSection('contenu'),
    ...faqSection('technique'),
    ...faqSection('juridique'),
    '## Contact',
    '',
    ...contactLines(),
    '',
  ].join('\n');
}
