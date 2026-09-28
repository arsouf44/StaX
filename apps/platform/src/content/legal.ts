import {
  LEGAL_REVIEW_REQUIRED,
  isLegalValueConfigured,
  legalValue,
  deliveryPolicyConfig,
  maintenancePolicyConfig,
  refundPolicyConfig,
} from '@nemasus/config';
import { formatMoney } from '@nemasus/payments';

/**
 * LEGAL_REVIEW_REQUIRED
 * ---------------------
 * Les textes ci-dessous sont des MODÈLES. Ils doivent être relus et validés
 * par un professionnel du droit avant toute ouverture commerciale. Rien ici ne
 * remplace ni ne restreint les protections d'ordre public du droit français et
 * européen.
 *
 * Deux règles de rédaction, tenues sans exception :
 *  1. chaque engagement écrit ici correspond à ce que la plateforme FAIT
 *     réellement (site conçu dans un projet dédié, maintenance mensuelle qui
 *     commence à la livraison, compte Stripe au nom du client, export en
 *     libre-service…) — un texte qui promet autre chose que le produit est le
 *     premier motif de litige ;
 *  2. aucune valeur d'identité (dénomination, SIREN, siège, capital,
 *     directeur de la publication, hébergeur) n'est écrite en dur : tout
 *     provient de la configuration, et un champ non renseigné affiche un
 *     marqueur explicite.
 */
export const LEGAL_DOCUMENTS_REQUIRE_REVIEW = LEGAL_REVIEW_REQUIRED;

/**
 * Versions réellement acceptées, conservées en base avec leur date.
 * 2026-09 : offres réservées aux professionnels et aux associations, accord de
 * traitement des données, règlement sur les services numériques.
 * 2026-09-23 : sites conçus dans un projet dédié (dépôt et déploiement
 * propres), livraison, maintenance MENSUELLE à compter de la livraison et sans
 * durée minimale, offre Exceptionnel, réversibilité du code source.
 * 2026-09-28 : la marque devient Nemasus ; collaboration et réception du site,
 * références commerciales, sous-traitance, confidentialité, effets du
 * remboursement, exclusion des résultats de référencement, délai d'action ;
 * CGU acceptées à l'inscription ; prospection auprès des professionnels.
 */
export const TERMS_VERSION = '2026-09-28';
export const PRIVACY_VERSION = '2026-09-28';
export const TERMS_OF_USE_VERSION = '2026-09-28';
export const DPA_VERSION = '2026-09-28';

const UPDATED_AT = '2026-09-28';

export interface LegalBlock {
  kind: 'paragraph' | 'list' | 'note' | 'definitions';
  text?: string;
  items?: readonly string[];
  definitions?: readonly { term: string; description: string }[];
}

export interface LegalArticle {
  id: string;
  title: string;
  blocks: readonly LegalBlock[];
}

export interface LegalDocument {
  slug: string;
  title: string;
  description: string;
  version?: string;
  /** Date de dernière modification du texte, au format ISO. */
  updatedAt: string;
  intro?: string;
  articles: readonly LegalArticle[];
}

const p = (text: string): LegalBlock => ({ kind: 'paragraph', text });
const list = (items: string[]): LegalBlock => ({ kind: 'list', items });
const note = (text: string): LegalBlock => ({ kind: 'note', text });
const defs = (definitions: { term: string; description: string }[]): LegalBlock => ({
  kind: 'definitions',
  definitions,
});

/** Contact public : e-mail de support, et téléphone s'il est configuré. */
function publicContact(): string {
  const email = legalValue('SUPPORT_EMAIL');
  return isLegalValueConfigured('SUPPORT_PHONE')
    ? `${email} — ${legalValue('SUPPORT_PHONE')}`
    : email;
}

/**
 * Prestataire de la base de données, nommé dans les mentions légales en plus
 * de l'hébergeur (configurable). Informations publiées par cette société
 * elle-même, pas des données de Nemasus.
 */
const DATA_HOST = {
  name: 'Supabase Pte. Ltd.',
  address: '65 Chulia Street #38-02/03, OCBC Centre, Singapour 049513',
  location: 'région de Paris (France)',
} as const;

/* -------------------------------------------------------------------------- */
/*  Mentions légales                                                           */
/* -------------------------------------------------------------------------- */

export function buildLegalNotice(): LegalDocument {
  const brand = legalValue('LEGAL_BRAND');
  const company = legalValue('LEGAL_COMPANY_NAME');

  return {
    slug: 'mentions-legales',
    title: 'Mentions légales',
    description:
      'Identité de l’éditeur, hébergement, propriété intellectuelle, signalement des contenus ' +
      'illicites et points de contact, conformément à la loi du 21 juin 2004 pour la confiance ' +
      'dans l’économie numérique et au règlement européen sur les services numériques.',
    updatedAt: UPDATED_AT,
    articles: [
      {
        id: 'editeur',
        title: 'Éditeur du site',
        blocks: [
          p(
            `${brand} est un nom commercial et une branche d’activité de ${company}. Le présent ` +
              'site est édité par :',
          ),
          defs([
            { term: 'Dénomination sociale', description: company },
            { term: 'Nom commercial', description: brand },
            { term: 'Forme juridique', description: legalValue('LEGAL_FORM') },
            { term: 'Capital social', description: legalValue('LEGAL_CAPITAL') },
            { term: 'Siège social', description: legalValue('LEGAL_ADDRESS') },
            { term: 'SIREN', description: legalValue('LEGAL_SIREN') },
            { term: 'SIRET du siège', description: legalValue('LEGAL_SIRET') },
            { term: 'RCS', description: legalValue('LEGAL_RCS') },
            { term: 'TVA intracommunautaire', description: legalValue('LEGAL_VAT') },
            { term: 'Directeur de la publication', description: legalValue('LEGAL_DIRECTOR') },
            { term: 'Contact', description: publicContact() },
          ]),
        ],
      },
      {
        id: 'hebergeur',
        title: 'Hébergement',
        blocks: [
          p('Le présent site est hébergé par :'),
          defs([
            { term: 'Hébergeur', description: legalValue('LEGAL_HOST') },
            { term: 'Adresse', description: legalValue('LEGAL_HOST_ADDRESS') },
            { term: 'Téléphone', description: legalValue('LEGAL_HOST_PHONE') },
          ]),
          p(
            'Le même prestataire héberge et diffuse les sites de nos clients. Les données ' +
              'applicatives (comptes, contenus, messages, réservations) sont stockées par ' +
              `${DATA_HOST.name}, ${DATA_HOST.address}, dans la ${DATA_HOST.location}. La liste ` +
              'complète de nos sous-traitants, avec leur localisation, est publiée sur la page ' +
              '« Sous-traitants ».',
          ),
        ],
      },
      {
        id: 'sites-clients',
        title: 'Sites de nos clients',
        blocks: [
          p(
            `Les sites réalisés par ${brand} sont édités par nos clients, qui en déterminent le ` +
              'contenu et en sont responsables en qualité d’éditeurs. ' +
              `${company} en assure l’hébergement au sens de l’article 6 de la loi du 21 juin 2004 ` +
              'et du règlement (UE) 2022/2065 sur les services numériques. Les mentions légales de ' +
              'chaque site identifient son éditeur.',
          ),
        ],
      },
      {
        id: 'propriete',
        title: 'Propriété intellectuelle',
        blocks: [
          p(
            `La structure du site, ses textes, son identité visuelle, le nom et le logo ${brand} ` +
              'et les éléments logiciels qui le composent sont protégés par le droit de la ' +
              'propriété intellectuelle. Toute reproduction, représentation, adaptation ou ' +
              'extraction, totale ou partielle, sans autorisation écrite préalable, est interdite ' +
              'et constitue une contrefaçon (articles L.335-2 et suivants du Code de la propriété ' +
              'intellectuelle).',
          ),
          p(
            'Les contenus publiés par nos clients sur leurs propres sites restent leur ' +
              `propriété. ${brand} n’acquiert aucun droit sur ces contenus, en dehors des ` +
              'droits techniques strictement nécessaires à l’hébergement et à l’affichage du site.',
          ),
          p(
            'Les marques et logos de tiers cités sur ce site (prestataires, moyens de paiement) ' +
              'appartiennent à leurs titulaires respectifs et ne sont mentionnés qu’à titre ' +
              'informatif. Les polices de caractères sont utilisées sous licence SIL Open Font ' +
              'License.',
          ),
        ],
      },
      {
        id: 'responsabilite',
        title: 'Responsabilité et liens',
        blocks: [
          p(
            `${brand} met en œuvre les moyens raisonnables pour assurer l’exactitude des ` +
              'informations publiées sur ce site et la disponibilité de ses services. Les ' +
              'informations à caractère général ne constituent ni un conseil juridique, ni un ' +
              'conseil fiscal, ni une offre contractuelle : seules les conditions générales de ' +
              'vente acceptées lors de la commande engagent les parties.',
          ),
          p(
            'Les liens vers des sites tiers sont fournis pour la commodité du lecteur ; leur ' +
              'contenu n’engage pas l’éditeur. Un lien vers le présent site ne nécessite pas ' +
              'd’autorisation, à condition de ne pas en dénaturer le contenu ni d’en suggérer ' +
              'une approbation qui n’existe pas.',
          ),
        ],
      },
      {
        id: 'donnees',
        title: 'Données personnelles',
        blocks: [
          p(
            `Le traitement des données personnelles par ${company} est décrit dans la politique ` +
              'de confidentialité, et l’usage des cookies dans la page « Cookies et traceurs ». ' +
              `Pour exercer vos droits : ${legalValue('LEGAL_DPO_CONTACT')}.`,
          ),
        ],
      },
      {
        id: 'signalement',
        title: 'Signaler un contenu illicite',
        blocks: [
          p(
            'Toute personne peut nous signaler un contenu qu’elle estime illicite, publié sur ce ' +
              'site ou sur le site d’un de nos clients, au moyen du formulaire « Signaler un ' +
              'contenu » (page /signaler-un-contenu). Chaque signalement reçoit un accusé de ' +
              'réception et une réponse motivée.',
          ),
          p(
            'Pour un danger immédiat pour une personne, appelez le 17 ou le 112. Les contenus ' +
              'relevant du terrorisme, de la pédocriminalité ou de la haine en ligne peuvent ' +
              'également être signalés aux autorités sur internet-signalement.gouv.fr (PHAROS).',
          ),
        ],
      },
      {
        id: 'contact-dsa',
        title: 'Points de contact',
        blocks: [
          p(
            'Conformément aux articles 11 et 12 du règlement (UE) 2022/2065 sur les services ' +
              'numériques, le point de contact unique des autorités des États membres, de la ' +
              'Commission européenne et des utilisateurs de nos services est :',
          ),
          defs([
            { term: 'Adresse électronique', description: legalValue('SUPPORT_EMAIL') },
            { term: 'Langues acceptées', description: 'Français, anglais' },
          ]),
        ],
      },
      {
        id: 'mediation',
        title: 'Médiation',
        // Le mediateur n'est affiche que s'il est designe : un marqueur
        // « [A CONFIGURER] » n'a rien a faire sur une page publique, et les
        // offres ne sont pas proposees aux consommateurs.
        blocks: isLegalValueConfigured('LEGAL_MEDIATOR')
          ? [
              p(
                'Nos offres sont réservées aux professionnels et aux associations. Si un litige ' +
                  'devait néanmoins nous opposer à un consommateur, celui-ci pourrait recourir ' +
                  'gratuitement au médiateur de la consommation désigné ci-dessous, conformément ' +
                  'à l’article L.612-1 du Code de la consommation, après avoir tenté de résoudre ' +
                  'le litige directement auprès de nous par une réclamation écrite.',
              ),
              defs([{ term: 'Médiateur désigné', description: legalValue('LEGAL_MEDIATOR') }]),
            ]
          : [
              p(
                'Nos offres sont réservées aux professionnels et aux associations ; elles ne sont ' +
                  'pas proposées aux consommateurs. Toute réclamation peut nous être adressée par ' +
                  `écrit à ${legalValue('SUPPORT_EMAIL')} : nous y répondons dans un délai d’un ` +
                  'mois.',
              ),
            ],
      },
    ],
  };
}

/* -------------------------------------------------------------------------- */
/*  Conditions générales de vente                                              */
/* -------------------------------------------------------------------------- */

export function buildTerms(): LegalDocument {
  const refund = refundPolicyConfig();
  const maintenance = maintenancePolicyConfig();
  const delivery = deliveryPolicyConfig();
  const company = legalValue('LEGAL_COMPANY_NAME');
  const brand = legalValue('LEGAL_BRAND');

  return {
    slug: 'cgv',
    title: 'Conditions générales de vente',
    description:
      'Commande, prix, paiement, réalisation, réception, maintenance mensuelle, résiliation, ' +
      'réversibilité, paiements sur votre site, responsabilité : les règles qui s’appliquent aux ' +
      `prestations ${brand}.`,
    version: TERMS_VERSION,
    updatedAt: UPDATED_AT,
    intro:
      'Les présentes conditions régissent la vente des prestations de conception, de ' +
      'développement, de mise en ligne, d’hébergement et de maintenance de sites internet ' +
      `proposées sous la marque ${brand}. Elles sont acceptées lors de chaque commande ; la ` +
      'version acceptée est conservée avec sa date et son numéro.',
    articles: [
      {
        id: 'objet',
        title: 'Article 1 — Objet et champ d’application',
        blocks: [
          p(
            'Les présentes conditions générales de vente (les « CGV ») définissent les droits et ' +
              `obligations de ${company} (le « Prestataire »), qui exerce sous le nom commercial ` +
              `${brand}, et de toute personne qui commande l’une de ses prestations (le « Client »).`,
          ),
          p(
            'Elles constituent le socle unique de la relation commerciale au sens de l’article ' +
              'L.441-1 du Code de commerce et sont communiquées à tout professionnel qui en fait la ' +
              'demande. Elles prévalent sur tout autre document du Client, notamment ses ' +
              'conditions générales d’achat, sauf accord écrit et contraire du Prestataire.',
          ),
          p(
            'Les CGV et le contrat sont rédigés et conclus en langue française, seule langue ' +
              'proposée pour la conclusion du contrat. Une éventuelle traduction n’est fournie ' +
              'qu’à titre d’information : seule la version française fait foi.',
          ),
        ],
      },
      {
        id: 'clientele',
        title: 'Article 2 — Offres réservées aux professionnels et aux associations',
        blocks: [
          p(
            'Les prestations sont destinées aux professionnels agissant pour les besoins de leur ' +
              'activité commerciale, industrielle, artisanale, libérale ou agricole, ainsi qu’aux ' +
              'associations et autres personnes morales non professionnelles. Lors de la ' +
              'commande, le Client déclare agir en l’une de ces qualités ; la personne qui passe ' +
              'commande déclare être habilitée à engager le Client.',
          ),
          p(
            'Lorsque le Client est une personne morale non professionnelle (une association, ' +
              'par exemple), il bénéficie des dispositions du Code de la consommation qui lui sont ' +
              'applicables, notamment en matière de clauses abusives, de reconduction des ' +
              'contrats et de résiliation en ligne.',
          ),
          note(
            'Si, malgré sa déclaration, le Client a la qualité de consommateur, aucune stipulation ' +
              'des présentes ne peut le priver des droits d’ordre public que la loi lui reconnaît.',
          ),
        ],
      },
      {
        id: 'definitions',
        title: 'Article 3 — Définitions',
        blocks: [
          defs([
            {
              term: 'Site',
              description:
                'Le site internet conçu et développé individuellement pour le Client par le ' +
                'Prestataire, dans un projet qui lui est propre (code source, dépôt et déploiement ' +
                'dédiés), puis hébergé et maintenu par le Prestataire. Aucun modèle préexistant ' +
                'n’est proposé au Client pour le constituer.',
            },
            {
              term: 'Espace client',
              description:
                'L’interface en ligne mise à disposition du Client pour suivre son projet, ' +
                'transmettre ses informations et ses fichiers, puis, après la Livraison, modifier ' +
                'les Contenus modifiables de son Site, et gérer son abonnement, ses données et ses ' +
                'paiements.',
            },
            {
              term: 'Création',
              description:
                'La conception, le développement, la mise en ligne et la vérification du Site, ' +
                'réglés par un paiement unique à la commande.',
            },
            {
              term: 'Livraison',
              description:
                'La remise du Site au Client, une fois celui-ci en ligne et vérifié par le ' +
                'Prestataire. La Livraison ouvre l’éditeur de l’Espace client et marque le début ' +
                'de la Maintenance.',
            },
            {
              term: 'Maintenance',
              description:
                'L’abonnement mensuel, qui commence à la Livraison, couvrant les prestations ' +
                'décrites à l’article 10 : hébergement, certificat de sécurité, infrastructure de ' +
                'publication, conservation des versions, surveillance, mises à jour nécessaires, ' +
                'support, accès à l’éditeur et, le cas échéant, renouvellement du nom de domaine ' +
                'acheté par le Prestataire pour le compte du Client.',
            },
            {
              term: 'Contenus modifiables',
              description:
                'Les éléments du Site que le Client peut modifier lui-même après la Livraison ' +
                '(textes, images, informations, liens…), tels que prévus par le Site. La ' +
                'structure, le design, le code et les intégrations n’en font pas partie.',
            },
            {
              term: 'Éléments du Client',
              description:
                'Les informations, textes, photographies, logos, marques, documents et accès que ' +
                'le Client fournit pour la réalisation et la vie de son Site.',
            },
            {
              term: 'Offre',
              description:
                'La formule choisie par le Client (Essentiel, Premium, Ultra Premium, Exceptionnel ' +
                'ou devis sur mesure), dont le contenu est décrit sur la page des tarifs au jour de ' +
                'la commande et repris dans le récapitulatif de commande.',
            },
          ]),
        ],
      },
      {
        id: 'documents',
        title: 'Article 4 — Documents contractuels',
        blocks: [
          p('Le contrat est formé des documents suivants, par ordre de priorité décroissant :'),
          list([
            'le devis signé, pour une prestation sur mesure ;',
            'le récapitulatif de commande (offre et ce qu’elle comprend, prix, délai de ' +
              'réalisation, options) ;',
            'les présentes CGV ;',
            'l’accord de traitement des données personnelles (article 28 du RGPD), qui en fait ' +
              'partie intégrante et prévaut sur les CGV pour ce qui concerne les données ' +
              'personnelles ;',
            'les conditions générales d’utilisation de la plateforme.',
          ]),
          p(
            'Ces documents expriment l’intégralité de l’accord des parties. Ils remplacent tout ' +
              'échange antérieur, écrit ou oral, portant sur le même objet ; une promesse qui n’y ' +
              'figure pas n’engage le Prestataire que si elle a été confirmée par écrit. Le Client ' +
              'peut consulter, télécharger et imprimer ces documents à tout moment depuis le site ' +
              'et son Espace client.',
          ),
        ],
      },
      {
        id: 'commande',
        title: 'Article 5 — Commande',
        blocks: [
          p(
            'La commande est passée en ligne, en quatre étapes : le Client choisit une Offre, ' +
              'indique son activité, renseigne les informations utiles à son projet, puis vérifie ' +
              'le récapitulatif (prix hors taxes, TVA et total toutes taxes comprises). Jusqu’au ' +
              'paiement, il peut revenir aux étapes précédentes pour corriger toute erreur de ' +
              'saisie (articles 1127-1 et 1127-2 du Code civil). Il accepte ensuite les présentes ' +
              'CGV et l’accord de traitement des données, puis procède au paiement.',
          ),
          p(
            'Une commande peut aussi faire suite à un échange téléphonique. Le Prestataire adresse ' +
              'alors au Client, par e-mail, une proposition personnelle : le Site déjà réalisé et ' +
              'consultable en ligne, l’Offre retenue et son prix, et un code personnel valable ' +
              'quatorze jours, qui ne fonctionne qu’avec l’adresse e-mail destinataire. Le Client ' +
              'crée son Espace client, y consulte le Site et la proposition, peut demander des ' +
              'précisions, puis accepte les présentes CGV et procède au paiement. Ni l’appel ni la ' +
              'proposition n’engagent le Client tant qu’il n’a pas payé. La commande est alors ' +
              'conclue à distance, en ligne.',
          ),
          p(
            'Le contrat est formé à la confirmation du paiement par le prestataire de paiement. ' +
              'Le Client reçoit alors une confirmation par e-mail reprenant les éléments ' +
              'essentiels de sa commande. L’acceptation des CGV est horodatée et conservée avec le ' +
              'numéro de version du texte accepté, à titre de preuve.',
          ),
          p(
            'Le Client s’engage à fournir des informations exactes et à jour. Le Prestataire peut ' +
              'refuser une commande pour un motif légitime, notamment une activité ou un contenu ' +
              'illicite, un litige de paiement antérieur non réglé ou une demande anormale ; le ' +
              'paiement éventuellement reçu est alors intégralement remboursé.',
          ),
        ],
      },
      {
        id: 'prix',
        title: 'Article 6 — Prix',
        blocks: [
          p(
            'Les prix sont exprimés en euros hors taxes. La taxe sur la valeur ajoutée au taux en ' +
              'vigueur est ajoutée et apparaît séparément sur le récapitulatif de commande, lors du ' +
              'paiement et sur la facture.',
          ),
          p('Le prix comprend deux composantes distinctes, présentées séparément :'),
          list([
            'un paiement unique de Création, dû à la commande ;',
            'un abonnement mensuel de Maintenance, dont le montant est indiqué par mois, dû ' +
              'seulement à compter de la Livraison du Site.',
          ]),
          p(
            'Pour une prestation sur mesure, le prix de la Création et celui de la Maintenance ' +
              'sont fixés par le devis.',
          ),
          p(
            'Le prix de la Maintenance est celui en vigueur au jour de la commande. Une évolution ' +
              'ultérieure du tarif public ne s’applique pas aux contrats en cours : le tarif du ' +
              'Client reste celui de sa commande, sauf accord exprès de sa part.',
          ),
        ],
      },
      {
        id: 'paiement',
        title: 'Article 7 — Paiement et facturation',
        blocks: [
          p(
            'Le paiement s’effectue par carte bancaire, par l’intermédiaire de Stripe, prestataire ' +
              'de services de paiement agréé. Aucune donnée de carte bancaire n’est collectée ni ' +
              'conservée par le Prestataire. Une prestation convenue sur devis peut être réglée par ' +
              'virement, selon les modalités et l’échéance indiquées sur la facture.',
          ),
          p(
            'La Création est payée à la commande. La Maintenance est mensuelle et payée d’avance ' +
              'pour chaque mois. Elle commence le jour de la Livraison du Site (sa remise au Client ' +
              'une fois en ligne et vérifié) : aucune somme n’est prélevée au titre de la ' +
              'Maintenance avant cette date. Les mois suivants sont prélevés à la même date sur le ' +
              'moyen de paiement enregistré auprès de Stripe lors de la commande, que le Client ' +
              'autorise à cette fin et peut remplacer à tout moment depuis son Espace client.',
          ),
          p(
            'Une facture conforme à la réglementation est émise pour chaque paiement et reste ' +
              'téléchargeable depuis l’Espace client.',
          ),
          p(
            'Toute somme non payée à son échéance porte de plein droit, dès le lendemain de ' +
              'l’échéance et sans qu’un rappel soit nécessaire, conformément à l’article L.441-10 ' +
              'du Code de commerce : des pénalités de retard calculées au taux d’intérêt appliqué ' +
              'par la Banque centrale européenne à son opération de refinancement la plus récente ' +
              'majoré de dix points, et une indemnité forfaitaire pour frais de recouvrement de ' +
              '40 euros, sans préjudice d’une indemnisation complémentaire sur justificatifs. Aucun ' +
              'escompte n’est accordé pour paiement anticipé.',
          ),
          p(
            'En cas d’échec d’un prélèvement, le Client en est informé et invité à mettre à jour ' +
              'son moyen de paiement. Sans régularisation dans les quinze jours, le Prestataire ' +
              'peut suspendre la Maintenance dans les conditions de l’article 19.',
          ),
          note(
            'Les pénalités de retard et l’indemnité forfaitaire ne s’appliquent pas au Client non ' +
              'professionnel, qui reste redevable des seuls intérêts au taux légal.',
          ),
        ],
      },
      {
        id: 'realisation',
        title: 'Article 8 — Réalisation et collaboration',
        blocks: [
          p(
            'Le Prestataire conçoit et développe le Site à partir des Éléments du Client, dans un ' +
              'projet indépendant propre à ce Site. Il est tenu à une obligation de moyens quant ' +
              'au respect des délais et au résultat esthétique, qui relève de sa liberté ' +
              'créative dans le cadre des indications du Client.',
          ),
          p(
            'La réalisation suppose une collaboration active du Client, qui s’engage à ' +
              'transmettre des Éléments complets, exacts et libres de droits, et à répondre aux ' +
              'demandes de validation dans un délai raisonnable. Pendant la réalisation, le Client ' +
              'suit l’avancement depuis son Espace client, y transmet ses Éléments et répond aux ' +
              'étapes de validation proposées. Il ne modifie pas le Site lui-même avant la ' +
              'Livraison.',
          ),
          p(
            'Le Client formule ses demandes de correction lors des étapes de validation. Une ' +
              'étape validée ne peut être remise en cause que sur devis ; il en va de même de ' +
              'toute demande qui élargit le périmètre de l’Offre (pages, fonctionnalités, ' +
              'changement de direction graphique ou de contenu).',
          ),
          p(
            'Le Prestataire livre le Site dans le délai de réalisation indiqué pour l’Offre ' +
              'choisie sur la page des tarifs et rappelé dans le récapitulatif de commande (à ' +
              `défaut, ${delivery.label}), à compter de la réception de l’ensemble des Éléments ` +
              'nécessaires à sa réalisation. Ce point de départ est notifié au Client dans son ' +
              'Espace client. Le délai est suspendu tant que des Éléments demandés ou une ' +
              'validation attendue n’ont pas été transmis, et prolongé d’autant.',
          ),
          p(
            'Si le Client ne transmet pas les Éléments demandés, ou ne répond pas à une demande ' +
              'de validation, pendant quatre-vingt-dix jours malgré deux relances écrites, le ' +
              'Prestataire peut, à son choix : livrer le Site réalisé avec les éléments dont il ' +
              'dispose, ce qui vaut Livraison ; ou mettre fin à la commande, les sommes versées ' +
              'lui restant acquises à hauteur du travail accompli, dont il justifie, et le ' +
              'surplus étant remboursé.',
          ),
          note(
            'En cas de retard imputable au seul Prestataire, le Client peut, après une mise en ' +
              'demeure restée sans effet pendant quinze jours, résoudre la commande et obtenir le ' +
              'remboursement de la Création.',
          ),
        ],
      },
      {
        id: 'livraison',
        title: 'Article 9 — Livraison et réception',
        blocks: [
          p(
            'Avant la Livraison, le Prestataire met le Site en ligne, connecte son nom de domaine ' +
              'et vérifie notamment son affichage sur les différents écrans, ses formulaires et ses ' +
              'réglages de référencement. La Livraison est notifiée au Client dans son Espace ' +
              'client et par e-mail.',
          ),
          p(
            `Le Client dispose de ${refund.windowDays} jours à compter de la Livraison pour ` +
              'signaler par écrit, depuis son Espace client, toute non-conformité du Site à sa ' +
              'commande, en la décrivant précisément. Le Prestataire corrige dans un délai ' +
              'raisonnable les non-conformités avérées. À l’expiration de ce délai sans ' +
              'signalement, ou dès la correction des non-conformités signalées, le Site est réputé ' +
              'conforme et réceptionné sans réserve, sans préjudice de la garantie commerciale de ' +
              'l’article 18.',
          ),
          p(
            'Lorsque la commande porte sur un Site déjà réalisé et présenté au Client avant son ' +
              'paiement (proposition faisant suite à un échange téléphonique), le Client l’a ' +
              'examiné avant de l’acheter. La Livraison intervient dès la confirmation du paiement ' +
              'et la vérification du Site en ligne, en général dans l’heure et au plus tard le ' +
              'jour ouvré suivant. Le Site est livré à l’adresse de son hébergement ; le nom de ' +
              'domaine du Client est connecté ensuite, à sa demande.',
          ),
          p(
            'Après la Livraison, le Client modifie lui-même les Contenus modifiables depuis son ' +
              'Espace client. Chaque publication qu’il décide est enregistrée dans le code source ' +
              'du Site puis déployée ; elle n’est présentée comme publiée qu’une fois le ' +
              'déploiement confirmé. Une publication qui échoue laisse en ligne la version ' +
              'précédente.',
          ),
          p(
            'Les modifications de structure, de design, de code ou d’intégrations, l’ajout de ' +
              'pages ou de fonctionnalités et les refontes sont réalisés par le Prestataire, sur ' +
              'devis lorsqu’ils excèdent le support inclus dans la Maintenance.',
          ),
        ],
      },
      {
        id: 'maintenance',
        title: 'Article 10 — Maintenance mensuelle : début, durée et contenu',
        blocks: [
          p(
            'La Maintenance commence le jour de la Livraison du Site : aucune somme n’est due à ce ' +
              'titre pendant la conception et le développement. Elle est conclue pour une durée ' +
              'indéterminée, sans durée minimale d’engagement, et facturée par périodes mensuelles ' +
              'successives, payables d’avance, jusqu’à sa résiliation dans les conditions de ' +
              'l’article 11.',
          ),
          p('La Maintenance comprend :'),
          list([
            'l’hébergement du Site sur l’infrastructure retenue par le Prestataire (à ce jour, ' +
              'Cloudflare) et la mise à disposition de l’Espace client ;',
            'la connexion du nom de domaine et le certificat de sécurité (HTTPS), renouvelé ' +
              'automatiquement ;',
            'l’infrastructure de publication : l’enregistrement de chaque publication dans le ' +
              'dépôt de code du Site, son déploiement et le suivi de ce déploiement ;',
            'la conservation des versions publiées et la possibilité de restaurer une version ' +
              'antérieure ;',
            'la surveillance de la disponibilité du Site et les sauvegardes des données de ' +
              'l’Espace client ;',
            'les mises à jour nécessaires au bon fonctionnement du Site et de la plateforme, ' +
              'notamment de sécurité ;',
            'l’accès à l’éditeur de l’Espace client, dans les limites de l’Offre ;',
            'le support relatif à l’utilisation du Site et de l’Espace client, par messages ' +
              'depuis l’Espace client, les jours ouvrés ;',
            'le renouvellement du nom de domaine acheté par le Prestataire pour le compte du ' +
              'Client, le cas échéant.',
          ]),
          p(
            'Elle ne comprend pas de travaux de développement illimités : les nouvelles pages ou ' +
              'fonctionnalités, les modifications de structure ou de design, les refontes, la ' +
              'production de contenus rédactionnels ou photographiques et les actions de ' +
              'référencement ou de publicité font l’objet d’un devis distinct.',
          ),
          p(
            'Le Prestataire peut faire évoluer les outils et les prestataires techniques qu’il ' +
              'utilise, sans diminuer le niveau de service ni les garanties relatives aux données ' +
              'personnelles prévues par l’accord de traitement des données.',
          ),
          note(
            'Le Client non professionnel conserve en toute hypothèse les droits que lui ' +
              'reconnaissent les articles L.215-1 et suivants du Code de la consommation.',
          ),
        ],
      },
      {
        id: 'resiliation',
        title: 'Article 11 — Résiliation',
        blocks: [
          p(
            'Le Client peut résilier sa Maintenance à tout moment, en ligne, depuis son Espace ' +
              'client (« Résilier votre contrat »), sans avoir à se justifier et sans frais. La ' +
              'résiliation prend effet au terme de la période mensuelle en cours : le mois entamé ' +
              'reste dû et aucun prélèvement n’intervient ensuite, sous réserve de la garantie ' +
              'commerciale de l’article 18. Le Client reçoit par e-mail une confirmation indiquant ' +
              'la date à laquelle le contrat prend fin et ses effets.',
          ),
          p(
            'Tant que le Site n’est pas livré, aucune Maintenance n’est en cours : la commande de ' +
              'Création suit les règles des articles 8, 9 et 18.',
          ),
          p(
            'Le Prestataire peut résilier la Maintenance sans avoir à la motiver, moyennant un ' +
              'préavis de trois mois notifié par e-mail ; le Client conserve alors le bénéfice de ' +
              'l’article 12, et la copie du code source de son Site lui est remise sans frais. Il ' +
              'peut aussi résilier le contrat en cas de défaut de paiement persistant, ou de ' +
              'manquement grave du Client aux présentes CGV ou à la loi, après une mise en demeure ' +
              'restée sans effet pendant quinze jours, sans préjudice de la suspension prévue à ' +
              'l’article 19.',
          ),
          p(
            `À l’issue de la dernière période payée, le Site demeure accessible pendant une ` +
              `période de continuité de ${maintenance.gracePeriodDays} jours. Il peut ensuite être ` +
              'suspendu : son accès public, son éditeur et ses fonctions interactives ' +
              '(formulaires, réservations, paiements) sont interrompus, mais ni son code source ni ' +
              `les données du Client ne sont supprimés ou altérés pendant ` +
              `${maintenance.suspensionRetentionDays} jours ; ils sont ensuite archivés ` +
              `${maintenance.archiveRetentionDays} jours, période pendant laquelle le Client peut ` +
              'exporter ses données, demander la copie du code source prévue à l’article 12 ou ' +
              'réactiver son abonnement.',
          ),
        ],
      },
      {
        id: 'reversibilite',
        title: 'Article 12 — Réversibilité : ce que le Client emporte',
        blocks: [
          p('À tout moment, et sans frais, le Client peut :'),
          list([
            'exporter ses données depuis son Espace client, dans des formats ouverts et lisibles ' +
              'par un tableur (messages, contacts, réservations, commandes, comptes clients) ;',
            'récupérer ses contenus : textes, photographies et documents qu’il a fournis ou qui ' +
              'lui ont été cédés ;',
            'obtenir le code de transfert de son nom de domaine, sur simple demande ;',
            `conserver son compte de paiement Stripe, ouvert à son nom, indépendamment de ${brand}.`,
          ]),
          p(
            'À la fin du contrat, le Client à jour de ses paiements peut en outre obtenir, sur ' +
              'demande, une copie du code source de son Site dans l’état de sa dernière version ' +
              'publiée, dans les conditions de l’article 16.',
          ),
          p(
            `L’usage de la plateforme ${brand} (Espace client, éditeur, formulaires, réservations, ` +
              'paiements, statistiques) prend fin avec le contrat : les fonctions du Site qui en ' +
              'dépendent cessent alors de fonctionner. Une assistance à la migration vers un autre ' +
              'prestataire, au-delà de la remise de la copie du code source, peut être fournie sur ' +
              'devis.',
          ),
        ],
      },
      {
        id: 'domaine',
        title: 'Article 13 — Nom de domaine',
        blocks: [
          p(
            'Lorsque le Prestataire achète un nom de domaine pour le compte du Client, il agit en ' +
              'qualité de mandataire : le nom de domaine est enregistré au nom du Client, qui en est ' +
              'le titulaire. Le Prestataire en assure le renouvellement tant que la Maintenance est ' +
              'en vigueur, et remet au Client le code de transfert sur simple demande.',
          ),
          p(
            'Lorsque le Client possède déjà son nom de domaine, il en reste seul titulaire et ' +
              'responsable du renouvellement auprès de son bureau d’enregistrement ; le ' +
              'Prestataire lui indique les réglages à effectuer.',
          ),
          p(
            'Le Client garantit que le nom de domaine choisi ne porte pas atteinte aux droits d’un ' +
              'tiers, notamment à une marque ou à une dénomination sociale. Le Prestataire ne ' +
              'garantit pas la disponibilité d’un nom de domaine avant son enregistrement effectif ' +
              'et n’est pas responsable des décisions des registres et bureaux d’enregistrement.',
          ),
        ],
      },
      {
        id: 'paiements-site',
        title: 'Article 14 — Paiements encaissés sur le Site du Client',
        blocks: [
          p(
            'Lorsque l’Offre permet au Site d’encaisser des paiements (commandes, acomptes, dons), ' +
              'ces paiements sont traités par Stripe sur un compte ouvert au nom du Client, qui ' +
              'accepte directement les conditions de Stripe. Les fonds sont versés par Stripe sur ' +
              'le compte bancaire du Client : ils ne transitent jamais par le Prestataire, qui ' +
              'n’a pas la qualité de prestataire de services de paiement et ne prélève aucune ' +
              'commission sur ces paiements.',
          ),
          p(
            'Le Client est le vendeur à l’égard de ses propres clients. Il est seul responsable ' +
              'de ses ventes, de ses prix, de sa facturation, de ses obligations fiscales, de ses ' +
              'conditions générales de vente, des remboursements et des litiges, qu’il gère ' +
              'directement dans son tableau de bord Stripe. Les frais de Stripe lui sont facturés ' +
              'directement par Stripe.',
          ),
          p(
            'Le Client peut retirer l’accès du Prestataire à son compte Stripe à tout moment ; son ' +
              'Site cesse alors d’encaisser en ligne.',
          ),
        ],
      },
      {
        id: 'obligations-client',
        title: 'Article 15 — Obligations du Client, éditeur de son Site',
        blocks: [
          p(
            'Le Client est l’éditeur de son Site et le responsable de son contenu. Il lui ' +
              'appartient notamment :',
          ),
          list([
            'de fournir et de tenir à jour les informations permettant d’établir les mentions ' +
              'légales de son Site (identité, immatriculation, directeur de la publication), que ' +
              'le Prestataire intègre au Site ;',
            'de s’assurer que les contenus publiés sont licites, exacts et qu’il dispose des ' +
              'droits nécessaires (textes, photographies, logos, marques, noms de personnes) ;',
            'lorsqu’il vend en ligne, de publier ses propres conditions générales de vente et de ' +
              'respecter les règles applicables à ses clients ;',
            'de respecter la réglementation relative aux données personnelles de ses visiteurs, ' +
              'dont il est responsable du traitement, avec l’aide des outils fournis ;',
            'de respecter les règles propres à son activité et à sa profession (professions ' +
              'réglementées, publicité, accessibilité lorsqu’elle lui est imposée).',
          ]),
          p(
            'Le Client garantit le Prestataire contre toute réclamation, action ou condamnation ' +
              'engagée par un tiers en raison des Éléments du Client ou des contenus qu’il publie, ' +
              'et l’indemnise des sommes que le Prestataire serait amené à supporter de ce fait, y ' +
              'compris des frais raisonnables de défense.',
          ),
          note(
            'En sa qualité d’hébergeur, le Prestataire n’est soumis à aucune obligation générale ' +
              'de surveiller les contenus publiés par le Client. Sa responsabilité ne peut être ' +
              'engagée à raison de ces contenus que si, ayant eu connaissance de leur caractère ' +
              'manifestement illicite, il n’a pas agi promptement pour les retirer ou en rendre ' +
              'l’accès impossible (article 6 de la loi du 21 juin 2004 ; articles 6 et 8 du ' +
              'règlement (UE) 2022/2065).',
          ),
        ],
      },
      {
        id: 'propriete-cgv',
        title: 'Article 16 — Propriété intellectuelle',
        blocks: [
          p(
            'Les Éléments du Client demeurent sa propriété. Il concède au Prestataire, pour la ' +
              'durée du contrat et pour le monde entier, le droit non exclusif de les reproduire, ' +
              'de les adapter aux formats du Site et de les représenter aux seules fins de la ' +
              'réalisation, de l’hébergement et de l’affichage du Site.',
          ),
          p(
            'Les textes et visuels créés spécifiquement pour le Client par le Prestataire lui sont ' +
              'cédés, dès le paiement intégral de la Création, à titre exclusif, pour le monde ' +
              'entier et pour toute la durée des droits d’auteur, pour tous usages de ' +
              'reproduction, de représentation et d’adaptation, sur tout support. Jusqu’à ce ' +
              'paiement intégral, ils restent la propriété du Prestataire.',
          ),
          p(
            'Le code source du Site est développé spécifiquement pour le Client et conservé dans ' +
              'un dépôt qui lui est propre. La copie remise au Client en application de ' +
              'l’article 12 s’accompagne d’un droit d’usage non exclusif et perpétuel sur les ' +
              'composants génériques du Prestataire qu’elle contient, pour les seuls besoins de ce ' +
              'Site ; les bibliothèques de tiers restent soumises à leurs propres licences. Le ' +
              'Prestataire conserve le droit de réutiliser son savoir-faire, ses méthodes et ses ' +
              'composants génériques pour d’autres clients, sans jamais reprendre les Éléments du ' +
              'Client ni les créations qui lui ont été cédées.',
          ),
          p(
            `La plateforme ${brand} (Espace client, éditeur, outils de publication et interfaces) ` +
              'reste la propriété du Prestataire. Le contrat confère au Client un droit d’usage ' +
              'personnel et non exclusif de la plateforme, pour sa durée.',
          ),
        ],
      },
      {
        id: 'references',
        title: 'Article 17 — Références commerciales',
        blocks: [
          p(
            'Avec l’accord du Client, donné par écrit (message depuis son Espace client ou ' +
              'e-mail), le Prestataire peut citer son nom et son logo et présenter le Site (lien, ' +
              'captures d’écran, description du projet) comme référence commerciale, sur son site ' +
              'et dans ses documents de présentation. Le Client peut retirer cet accord à tout ' +
              'moment ; la référence est alors retirée dans un délai de trente jours.',
          ),
          p(
            'Le Prestataire peut faire figurer dans le pied de page du Site une mention discrète ' +
              `« Site réalisé par ${brand} », assortie d’un lien. Le Client peut en demander le ` +
              'retrait à tout moment, sans incidence sur le prix ; elle est alors retirée lors de ' +
              'la publication suivante, et au plus tard dans un délai de trente jours.',
          ),
        ],
      },
      {
        id: 'garantie',
        title: 'Article 18 — Garantie commerciale de satisfaction',
        blocks: [
          p(
            `Le Prestataire accorde une garantie commerciale de ${refund.windowDays} jours à ` +
              'compter de la Livraison du Site. Pendant cette période, le Client ' +
              'insatisfait peut demander, sans justification, le remboursement de la Création et de ' +
              'la Maintenance déjà prélevée, selon la politique de remboursement. Cette garantie ' +
              'ne peut être exercée qu’une fois par Client.',
          ),
          p(
            'Lorsqu’un nom de domaine a effectivement été acheté pour le compte du Client, un ' +
              `montant forfaitaire de ${formatRefundDeduction(refund.domainDeductionCents)} est ` +
              'déduit du remboursement, ce coût étant définitivement engagé ; le nom de domaine ' +
              'reste acquis au Client. Aucune déduction n’est appliquée si aucun achat n’a eu lieu.',
          ),
          p(
            'Le remboursement met fin au contrat. Le Site peut alors être mis hors ligne, la cession de ' +
              'droits prévue à l’article 16 est réputée n’être jamais intervenue et le Client ' +
              'renonce à utiliser les textes, visuels et code créés par le Prestataire. Il ' +
              'conserve ses propres Éléments et peut exporter ses données dans les délais de ' +
              'conservation prévus à l’article 11.',
          ),
          note(
            'Cette garantie est une faveur commerciale. Elle s’ajoute aux droits que le Client ' +
              'tient de la loi et ne s’y substitue en aucun cas.',
          ),
        ],
      },
      {
        id: 'suspension-cgv',
        title: 'Article 19 — Suspension',
        blocks: [
          p(
            'Le Prestataire peut suspendre l’accès au Site ou à un contenu, en informant le Client ' +
              'et en motivant sa décision, lorsque cela est nécessaire pour faire cesser un contenu ' +
              'manifestement illicite, pour préserver la sécurité de la plateforme ou d’autres ' +
              'clients, ou en cas de défaut de paiement persistant après relance.',
          ),
          p(
            'La suspension n’emporte pas suppression des données, qui restent exportables. Elle ' +
              'prend fin dès que sa cause a disparu. Les sommes dues restent exigibles pendant la ' +
              'suspension lorsque celle-ci résulte d’un manquement du Client.',
          ),
        ],
      },
      {
        id: 'donnees',
        title: 'Article 20 — Données personnelles',
        blocks: [
          p(
            'Le Prestataire traite, en qualité de responsable de traitement, les données du Client ' +
              'et de ses utilisateurs nécessaires à l’exécution du contrat, dans les conditions ' +
              'décrites dans la politique de confidentialité.',
          ),
          p(
            'Pour les données collectées sur le Site du Client (messages, réservations, commandes, ' +
              'comptes clients), le Client est responsable de traitement et le Prestataire agit en ' +
              'qualité de sous-traitant, dans les conditions de l’accord de traitement des données, ' +
              'qui fait partie intégrante du contrat.',
          ),
        ],
      },
      {
        id: 'responsabilite-cgv',
        title: 'Article 21 — Responsabilité',
        blocks: [
          p(
            'Le Prestataire est tenu à une obligation de moyens. Il met en œuvre les moyens ' +
              'conformes aux règles de l’art pour assurer la disponibilité, la sécurité et la ' +
              'sauvegarde du Site. Aucun engagement chiffré de disponibilité n’est pris tant ' +
              'qu’il n’est pas mesuré et vérifiable.',
          ),
          p(
            'Le Prestataire ne garantit aucun résultat commercial : ni un positionnement dans les ' +
              'moteurs de recherche ou les outils d’intelligence artificielle, ni un volume de ' +
              'fréquentation, de contacts ou de ventes, qui dépendent de facteurs qu’il ne maîtrise ' +
              'pas (algorithmes de tiers, concurrence, activité du Client).',
          ),
          p(
            'Il ne saurait être tenu responsable des conséquences d’informations inexactes ou ' +
              'd’Éléments fournis par le Client, d’un usage non conforme de l’Espace client ou des ' +
              'identifiants du Client, d’une modification apportée au Site ou à son code par le ' +
              'Client ou un tiers qu’il a mandaté, ni de la défaillance d’un tiers indépendant de sa ' +
              'volonté, notamment un opérateur de réseau, un bureau d’enregistrement de noms de ' +
              'domaine ou le prestataire de paiement du Client.',
          ),
          p(
            'Lorsque le Client est un professionnel, la responsabilité du Prestataire, toutes ' +
              'causes confondues, est limitée à la réparation des dommages directs et prévisibles, ' +
              'dans la limite des sommes payées par le Client au titre du contrat au cours des ' +
              'douze mois précédant le fait générateur. Ne donnent pas lieu à réparation les ' +
              'dommages indirects, tels que la perte de chiffre d’affaires, de bénéfice, de ' +
              'clientèle, de chance ou d’image. Ces limitations ne s’appliquent ni en cas de faute ' +
              'lourde ou dolosive, ni aux dommages corporels, ni au Client non professionnel.',
          ),
          p(
            'Toute action d’un Client professionnel relative au contrat doit être introduite dans ' +
              'un délai d’un an à compter du jour où il a connu ou aurait dû connaître les faits ' +
              'lui permettant de l’exercer (article 2254 du Code civil).',
          ),
        ],
      },
      {
        id: 'force-majeure',
        title: 'Article 22 — Force majeure',
        blocks: [
          p(
            'Aucune partie n’est responsable d’un manquement causé par un événement de force ' +
              'majeure au sens de l’article 1218 du Code civil, tel qu’une défaillance généralisée ' +
              'des réseaux de télécommunication ou d’électricité, une cyberattaque d’ampleur ' +
              'exceptionnelle ou une décision d’une autorité publique, dès lors qu’il en réunit les ' +
              'conditions. Si l’empêchement dure plus de trente jours, chaque partie peut résilier ' +
              'le contrat par écrit, sans indemnité ; les sommes versées pour une période non ' +
              'exécutée sont alors remboursées.',
          ),
        ],
      },
      {
        id: 'sous-traitance',
        title: 'Article 23 — Sous-traitance et prestataires',
        blocks: [
          p(
            'Le Prestataire peut confier tout ou partie de la réalisation du Site à des ' +
              'prestataires qu’il choisit, et recourt à des prestataires techniques pour ' +
              'l’hébergement, le stockage, la diffusion et l’envoi des e-mails. Il reste seul ' +
              'responsable envers le Client de l’exécution du contrat. Les prestataires qui traitent ' +
              'des données personnelles sont publiés sur la page « Sous-traitants ».',
          ),
        ],
      },
      {
        id: 'confidentialite-cgv',
        title: 'Article 24 — Confidentialité',
        blocks: [
          p(
            'Chaque partie garde confidentielles les informations non publiques de l’autre partie ' +
              'dont elle a connaissance à l’occasion du contrat (informations commerciales, ' +
              'techniques, identifiants), ne les utilise que pour son exécution et ne les ' +
              'communique qu’aux personnes qui ont besoin de les connaître et sont tenues à la même ' +
              'obligation. Cette obligation dure pendant le contrat et deux ans après sa fin ; elle ' +
              'ne s’applique pas aux informations publiques ou dont la communication est exigée par ' +
              'la loi ou une autorité.',
          ),
        ],
      },
      {
        id: 'retractation',
        title: 'Article 25 — Droit de rétractation',
        blocks: [
          p(
            'Les contrats conclus à distance entre professionnels n’ouvrent pas de droit de ' +
              'rétractation. Par exception, lorsqu’un contrat est conclu hors établissement avec ' +
              'un professionnel employant au plus cinq salariés et que son objet n’entre pas dans ' +
              'le champ de l’activité principale de ce dernier, celui-ci dispose d’un délai de ' +
              'quatorze jours pour se rétracter, sans motif (articles L.221-3 et L.221-18 du Code ' +
              'de la consommation).',
          ),
          p(
            'Dans ce cas, le Client peut exercer ce droit par toute déclaration dénuée ' +
              'd’ambiguïté, notamment par e-mail, ou au moyen du modèle ci-dessous. S’il a ' +
              'expressément demandé que la réalisation commence avant la fin du délai, il reste ' +
              'redevable d’un montant proportionnel à ce qui a été fourni jusqu’à sa rétractation.',
          ),
          note(
            `Modèle de formulaire de rétractation — À l’attention de ${company}, ` +
              `${legalValue('LEGAL_ADDRESS')}, ${legalValue('SUPPORT_EMAIL')} : « Je vous ` +
              'notifie par la présente ma rétractation du contrat portant sur la prestation ' +
              'ci-dessous : [référence de la commande], commandée le [date], par [nom du Client], ' +
              '[adresse du Client], le [date]. Signature (en cas de notification sur papier). »',
          ),
        ],
      },
      {
        id: 'modification',
        title: 'Article 26 — Évolution des CGV',
        blocks: [
          p(
            'Les CGV peuvent évoluer. La version applicable à une commande est celle acceptée lors ' +
              'de cette commande. Pour une Maintenance en cours, une nouvelle version est notifiée ' +
              'au Client au moins trente jours avant de s’appliquer, et ne s’applique qu’à la ' +
              'période suivante ; le Client qui la refuse peut résilier sans frais avant cette date.',
          ),
        ],
      },
      {
        id: 'preuve',
        title: 'Article 27 — Preuve et archivage',
        blocks: [
          p(
            'Les enregistrements électroniques conservés par le Prestataire dans des conditions ' +
              'raisonnables de sécurité (horodatage de l’acceptation des CGV, journal des ' +
              'opérations, messages échangés dans l’Espace client, confirmations de paiement) font ' +
              'foi entre les parties, sauf preuve contraire. Les messages échangés depuis l’Espace ' +
              'client et par e-mail valent écrit entre les parties.',
          ),
          p(
            'Les commandes et factures sont archivées pendant dix ans. Le Client accède à tout ' +
              'moment à ses commandes, à la version des CGV acceptée et à ses factures depuis son ' +
              'Espace client, ou sur simple demande.',
          ),
        ],
      },
      {
        id: 'divers',
        title: 'Article 28 — Dispositions générales',
        blocks: [
          list([
            'le fait de ne pas se prévaloir d’une stipulation n’emporte pas renonciation à s’en ' +
              'prévaloir ultérieurement ;',
            'la nullité d’une stipulation n’affecte pas les autres, qui restent applicables ; la ' +
              'stipulation nulle est remplacée par celle, licite, qui s’en rapproche le plus ;',
            'le Client ne peut céder le contrat sans l’accord préalable du Prestataire, qui peut ' +
              'le transmettre à une société qui reprendrait son activité, en informant le Client ;',
            'les parties sont des cocontractants indépendants : aucune ne peut engager l’autre ' +
              'envers les tiers.',
          ]),
        ],
      },
      {
        id: 'droit',
        title: 'Article 29 — Droit applicable et litiges',
        blocks: [
          p(
            'Les présentes CGV sont soumises au droit français. En cas de difficulté, les parties ' +
              'rechercheront une solution amiable : le Client adresse sa réclamation par écrit au ' +
              'support, qui y répond dans un délai d’un mois.',
          ),
          p(
            'À défaut d’accord, et lorsque les deux parties ont la qualité de commerçant, tout ' +
              'litige relatif à la formation, à l’exécution ou à la fin du contrat relève de la ' +
              'compétence exclusive des juridictions du ressort du siège social du Prestataire, y ' +
              'compris en cas de référé, d’appel en garantie ou de pluralité de défendeurs. Dans les ' +
              'autres cas, les règles de compétence de droit commun s’appliquent.',
          ),
        ],
      },
    ],
  };
}

/* -------------------------------------------------------------------------- */
/*  Accord de traitement des données (article 28 du RGPD)                      */
/* -------------------------------------------------------------------------- */

export function buildDataProcessingAgreement(): LegalDocument {
  const maintenance = maintenancePolicyConfig();
  const company = legalValue('LEGAL_COMPANY_NAME');
  const dpo = legalValue('LEGAL_DPO_CONTACT');

  return {
    slug: 'accord-de-traitement',
    title: 'Accord de traitement des données',
    description:
      'Les engagements de Nemasus lorsqu’elle traite, pour votre compte, les données collectées sur ' +
      'votre site : l’accord de sous-traitance exigé par l’article 28 du RGPD.',
    version: DPA_VERSION,
    updatedAt: UPDATED_AT,
    intro:
      'Cet accord fait partie intégrante des conditions générales de vente. Il est accepté lors de ' +
      'la commande et s’applique pendant toute la durée du contrat, puis jusqu’à la suppression ' +
      'des données. Pour ce qui concerne les données personnelles, il prévaut sur les conditions ' +
      'générales de vente.',
    articles: [
      {
        id: 'parties-dpa',
        title: 'Article 1 — Rôles',
        blocks: [
          p(
            'Pour les données personnelles collectées sur son Site, le Client agit en qualité de ' +
              `responsable de traitement et ${company}, sous la marque Nemasus, en qualité de ` +
              'sous-traitant au sens de l’article 28 du règlement (UE) 2016/679 (RGPD).',
          ),
        ],
      },
      {
        id: 'description-dpa',
        title: 'Article 2 — Description du traitement',
        blocks: [
          defs([
            {
              term: 'Objet et nature',
              description:
                'Hébergement, stockage, affichage et transmission des données nécessaires au ' +
                'fonctionnement du Site : réception des formulaires, réservations, commandes, ' +
                'comptes clients, inscriptions, notifications par e-mail, sauvegardes.',
            },
            {
              term: 'Finalités',
              description:
                'Permettre au Client de recevoir et de gérer les demandes, réservations, ' +
                'commandes et comptes de ses propres clients, et de mesurer la fréquentation ' +
                'agrégée de son Site, sans cookie.',
            },
            {
              term: 'Personnes concernées',
              description: 'Visiteurs du Site, prospects, clients et abonnés du Client.',
            },
            {
              term: 'Catégories de données',
              description:
                'Identité et coordonnées (nom, e-mail, téléphone, adresse), contenu des messages ' +
                'et demandes, détails des réservations et commandes, données de compte client, ' +
                'données techniques minimisées (empreinte d’adresse IP pour la lutte contre les ' +
                'abus). Aucune donnée sensible n’est attendue : le Client s’engage à ne pas en ' +
                'collecter via les formulaires standard.',
            },
            {
              term: 'Durée',
              description:
                'La durée du contrat, puis les délais de restitution et de suppression prévus à ' +
                'l’article 9.',
            },
            {
              term: 'Localisation',
              description:
                'Base de données et fichiers hébergés en France (région de Paris). Diffusion des ' +
                'pages par un réseau mondial ; prestataires et garanties de transfert publiés sur ' +
                'la page « Sous-traitants ».',
            },
          ]),
        ],
      },
      {
        id: 'instructions-dpa',
        title: 'Article 3 — Instructions du Client',
        blocks: [
          p(
            'Le sous-traitant ne traite les données que sur instruction documentée du Client. Les ' +
              'instructions sont constituées du contrat, du présent accord et des réglages ' +
              'effectués par le Client dans son Espace client (formulaires, modules activés, ' +
              'destinataires des notifications). Le sous-traitant informe immédiatement le Client ' +
              's’il estime qu’une instruction constitue une violation du RGPD.',
          ),
          p(
            'Le sous-traitant n’utilise jamais ces données pour ses propres finalités, ne les vend ' +
              'pas et ne les partage pas à des fins publicitaires.',
          ),
        ],
      },
      {
        id: 'confidentialite-dpa',
        title: 'Article 4 — Confidentialité',
        blocks: [
          p(
            'Les personnes autorisées à traiter les données sont soumises à une obligation de ' +
              'confidentialité. L’accès du personnel aux données d’un Client n’est possible que dans ' +
              'le cadre d’une session d’assistance motivée, limitée dans le temps, journalisée et ' +
              'visible par le Client dans son historique.',
          ),
        ],
      },
      {
        id: 'securite-dpa',
        title: 'Article 5 — Sécurité',
        blocks: [
          p('Le sous-traitant met en œuvre, au titre de l’article 32 du RGPD, notamment :'),
          list([
            'le chiffrement des échanges (HTTPS) et des données au repos ;',
            'l’isolation des données de chaque Client imposée au niveau de la base de données ;',
            'le contrôle des accès par rôle et l’authentification à double facteur pour les ' +
              'comptes d’administration ;',
            'la journalisation des actions sensibles, sans jamais y consigner de mot de passe ;',
            'des sauvegardes régulières et une procédure de restauration documentée ;',
            'la protection des formulaires contre les abus (limitation de débit, filtrage).',
          ]),
        ],
      },
      {
        id: 'sous-traitants-dpa',
        title: 'Article 6 — Sous-traitants ultérieurs',
        blocks: [
          p(
            'Le Client autorise de manière générale le recours aux sous-traitants ultérieurs ' +
              'figurant sur la page publique « Sous-traitants ». Le sous-traitant informe le ' +
              'Client de tout ajout ou remplacement au moins trente jours à l’avance, dans son ' +
              'Espace client ; le Client peut s’y opposer pour un motif légitime et, à défaut ' +
              'd’accord, résilier le contrat sans frais.',
          ),
          p(
            'Chaque sous-traitant ultérieur est lié par des obligations au moins équivalentes à ' +
              'celles du présent accord. Les transferts hors de l’Union européenne sont encadrés ' +
              'par une décision d’adéquation ou par les clauses contractuelles types de la ' +
              'Commission européenne.',
          ),
        ],
      },
      {
        id: 'droits-dpa',
        title: 'Article 7 — Aide à l’exercice des droits',
        blocks: [
          p(
            'Le sous-traitant fournit au Client les outils lui permettant de répondre lui-même aux ' +
              'demandes des personnes concernées : consultation, export au format tableur, ' +
              'correction, blocage et effacement des comptes clients, suppression des messages. Si ' +
              'une demande lui parvient directement, il la transmet au Client sans délai.',
          ),
          p(
            'Il aide le Client, dans la mesure des informations dont il dispose, à satisfaire à ses ' +
              'obligations de sécurité, de notification des violations et, le cas échéant, ' +
              'd’analyse d’impact.',
          ),
        ],
      },
      {
        id: 'violations-dpa',
        title: 'Article 8 — Violations de données',
        blocks: [
          p(
            'Le sous-traitant notifie au Client toute violation de données personnelles le ' +
              'concernant dans les meilleurs délais et au plus tard quarante-huit heures après en ' +
              'avoir pris connaissance, avec les informations disponibles : nature de la violation, ' +
              'catégories et nombre approximatif de personnes et de données concernées, conséquences ' +
              'probables et mesures prises ou proposées.',
          ),
        ],
      },
      {
        id: 'fin-dpa',
        title: 'Article 9 — Sort des données en fin de contrat',
        blocks: [
          p(
            'Pendant toute la durée du contrat et des délais de conservation qui suivent, le Client ' +
              'peut exporter ses données en libre-service. À l’issue de la période de continuité ' +
              `(${maintenance.gracePeriodDays} jours), de suspension ` +
              `(${maintenance.suspensionRetentionDays} jours) et d’archivage ` +
              `(${maintenance.archiveRetentionDays} jours), les données sont supprimées de manière ` +
              'irréversible, sauf obligation légale de conservation. Le Client peut demander une ' +
              'suppression anticipée.',
          ),
        ],
      },
      {
        id: 'audit-dpa',
        title: 'Article 10 — Documentation et audit',
        blocks: [
          p(
            'Le sous-traitant tient le registre des activités de traitement prévu à l’article 30.2 ' +
              'du RGPD et met à la disposition du Client les informations nécessaires pour démontrer ' +
              'le respect du présent accord. Le Client peut faire réaliser un audit, à ses frais, au ' +
              'plus une fois tous les douze mois, par un auditeur indépendant tenu au secret, ' +
              'moyennant un préavis de trente jours et sans accès aux données des autres clients.',
          ),
        ],
      },
      {
        id: 'obligations-responsable',
        title: 'Article 11 — Obligations du Client',
        blocks: [
          p(
            'Le Client s’assure de la licéité des traitements, informe les personnes concernées ' +
              '(la plateforme génère une politique de confidentialité adaptée aux modules activés ' +
              'de son Site, qu’il vérifie) et répond à leurs demandes avec les outils fournis.',
          ),
          p(`Contact du sous-traitant pour toute question relative à cet accord : ${dpo}.`),
        ],
      },
      {
        id: 'responsabilite-dpa',
        title: 'Article 12 — Responsabilité',
        blocks: [
          p(
            'Chaque partie répond des manquements aux obligations que le RGPD met à sa charge, ' +
              'dans les conditions de son article 82. Entre les parties, la responsabilité du ' +
              'sous-traitant au titre du présent accord est soumise aux limitations prévues par les ' +
              'conditions générales de vente, sauf lorsque la loi l’interdit.',
          ),
        ],
      },
    ],
  };
}

/* -------------------------------------------------------------------------- */
/*  Conditions générales d'utilisation                                         */
/* -------------------------------------------------------------------------- */

export function buildTermsOfUse(): LegalDocument {
  const brand = legalValue('LEGAL_BRAND');

  return {
    slug: 'cgu',
    title: 'Conditions générales d’utilisation',
    description:
      `Règles d’utilisation de la plateforme ${brand}, de l’espace client et des sites publiés : ` +
      'compte, sécurité, contenus autorisés, modération, disponibilité et suspension.',
    version: TERMS_OF_USE_VERSION,
    updatedAt: UPDATED_AT,
    intro:
      'Les présentes conditions régissent l’utilisation de la plateforme. Elles complètent les ' +
      'conditions générales de vente, qui régissent quant à elles la relation commerciale et ' +
      'prévalent en cas de contradiction.',
    articles: [
      {
        id: 'objet-cgu',
        title: 'Article 1 — Objet et acceptation',
        blocks: [
          p(
            'Les présentes conditions générales d’utilisation définissent les règles d’accès et ' +
              'd’usage de la plateforme, de l’espace client et des sites qu’elle publie. ' +
              `« Prestataire » désigne ${legalValue('LEGAL_COMPANY_NAME')}, qui exploite la ` +
              `plateforme sous le nom ${brand} ; « Utilisateur » désigne toute personne qui ` +
              'dispose d’un compte.',
          ),
          p(
            'Elles sont acceptées lors de la création du compte, qui en conserve la version et la ' +
              'date. L’utilisation de l’espace client suppose leur acceptation dans leur version en ' +
              'vigueur.',
          ),
        ],
      },
      {
        id: 'acces-cgu',
        title: 'Article 2 — Accès à la plateforme',
        blocks: [
          p(
            'La plateforme est destinée aux professionnels et aux associations. Un compte ne peut ' +
              'être ouvert que par une personne majeure, agissant pour le compte d’une entreprise ou ' +
              'd’une association qu’elle est habilitée à représenter, ou invitée par elle.',
          ),
          p(
            'L’accès est gratuit ; les prestations (création, maintenance) sont payantes dans les ' +
              'conditions des conditions générales de vente. Les frais de connexion et ' +
              'd’équipement restent à la charge de l’Utilisateur.',
          ),
        ],
      },
      {
        id: 'compte',
        title: 'Article 3 — Compte et sécurité',
        blocks: [
          p(
            'L’accès à l’espace client nécessite un compte nominatif. L’Utilisateur fournit des ' +
              'informations exactes, est responsable de la confidentialité de ses identifiants et ' +
              'de toute action réalisée depuis son compte.',
          ),
          list([
            'un compte est personnel : il ne doit pas être partagé entre plusieurs personnes ;',
            'plusieurs personnes peuvent être invitées sur un même espace, chacune avec son ' +
              'propre compte et son propre niveau d’accès ; l’entreprise qui les invite répond ' +
              'de leurs actions ;',
            'l’authentification à double facteur est proposée à tous et obligatoire pour les ' +
              'comptes d’administration de la plateforme ;',
            'toute compromission suspectée doit être signalée sans délai afin que les sessions ' +
              'actives puissent être révoquées.',
          ]),
          p(
            'Les niveaux d’accès (propriétaire, administrateur, éditeur, lecteur, comptabilité) ' +
              'sont appliqués côté serveur. Une permission absente n’est pas seulement masquée ' +
              'dans l’interface : l’opération correspondante est refusée.',
          ),
        ],
      },
      {
        id: 'usage',
        title: 'Article 4 — Usage conforme',
        blocks: [
          p('L’Utilisateur s’interdit notamment :'),
          list([
            'de tenter d’accéder aux données d’un autre client, ou de contourner les ' +
              'mécanismes d’isolation et de contrôle d’accès ;',
            'd’injecter du code exécutable, des scripts ou des cadres tiers non autorisés dans ' +
              'les contenus publiés ;',
            'de soumettre la plateforme à des tests de charge, à un balayage automatisé, à une ' +
              'extraction massive de données ou à toute sollicitation anormale sans autorisation ' +
              'écrite préalable ;',
            'd’utiliser le service pour diffuser des contenus illicites, contrefaisants, ' +
              'trompeurs, haineux, ou portant atteinte à la vie privée ou aux droits d’autrui, ou ' +
              'pour envoyer des communications non sollicitées ;',
            'de revendre l’accès à la plateforme sans accord exprès.',
          ]),
          p(
            'Les quantités présentées comme illimitées dans une Offre s’entendent d’un usage ' +
              'normal, pour les besoins propres du Client. Un usage manifestement anormal (volume ' +
              'disproportionné, revente, usage compromettant le service rendu aux autres clients) ' +
              'peut être limité, après information motivée de l’Utilisateur.',
          ),
          p(
            'Les recherches de sécurité menées de bonne foi sont bienvenues et doivent être ' +
              'signalées de manière responsable à l’adresse de contact indiquée dans les mentions ' +
              'légales, avant toute divulgation publique, sans accéder aux données d’autrui au-delà ' +
              'de ce qui est nécessaire à la démonstration.',
          ),
        ],
      },
      {
        id: 'contenus-utilisateur',
        title: 'Article 5 — Contenus publiés par l’Utilisateur',
        blocks: [
          p(
            'L’Utilisateur demeure propriétaire des contenus qu’il publie et garantit disposer ' +
              'des droits nécessaires, notamment sur les photographies, les logos et les textes ' +
              'qu’il transmet.',
          ),
          p(
            'Il accorde au Prestataire une licence strictement limitée à l’hébergement, à la ' +
              'reproduction technique et à l’affichage de ces contenus, pour la seule exécution ' +
              'du service et pour la durée du contrat.',
          ),
        ],
      },
      {
        id: 'moderation',
        title: 'Article 6 — Modération des contenus',
        blocks: [
          p(
            'Conformément au règlement (UE) 2022/2065 sur les services numériques, le Prestataire ' +
              'décrit ici la manière dont il traite les contenus illicites :',
          ),
          list([
            'aucun contrôle éditorial n’est exercé a priori sur les contenus publiés par les ' +
              'clients, qui en sont les éditeurs ;',
            'toute personne peut signaler un contenu qu’elle estime illicite au moyen du ' +
              'formulaire « Signaler un contenu » ; le signalement reçoit un accusé de réception ;',
            'chaque signalement est examiné par une personne, sans décision automatisée, de ' +
              'manière diligente, objective et non arbitraire ;',
            'lorsqu’un contenu est manifestement illicite, le Prestataire peut en retirer ou en ' +
              'bloquer l’accès, ou suspendre le site concerné ;',
            'le client concerné est informé de toute mesure prise, avec l’exposé de ses motifs, ' +
              'des faits retenus et des voies de contestation ; il peut contester la décision en ' +
              'répondant au message reçu, et sa contestation est réexaminée par une autre ' +
              'personne ; il conserve la possibilité de saisir le juge ;',
            'l’auteur du signalement est informé de la suite donnée ;',
            'lorsque le Prestataire a connaissance d’informations laissant soupçonner une ' +
              'infraction pénale menaçant la vie ou la sécurité d’une personne, il en informe les ' +
              'autorités compétentes (article 18 du règlement).',
          ]),
          note(
            'Un signalement que son auteur sait inexact, présenté dans le but d’obtenir un retrait, ' +
              'engage sa responsabilité et peut constituer un délit. Le Prestataire peut ne plus ' +
              'traiter en priorité les signalements d’une personne qui en soumet fréquemment de ' +
              'manifestement infondés, après l’en avoir avertie.',
          ),
        ],
      },
      {
        id: 'disponibilite',
        title: 'Article 7 — Disponibilité et maintenance technique',
        blocks: [
          p(
            'Le service est fourni en continu, sous réserve des opérations de maintenance et des ' +
              'événements indépendants de la volonté du Prestataire.',
          ),
          p(
            'Les interventions programmées susceptibles d’affecter la disponibilité sont ' +
              'annoncées à l’avance dans l’espace client lorsque cela est possible. Les ' +
              'fonctionnalités de la plateforme peuvent évoluer, sans supprimer une fonction ' +
              'essentielle de l’Offre souscrite.',
          ),
          note(
            'Aucun engagement chiffré de disponibilité n’est publié tant qu’il n’est pas mesuré ' +
              'et vérifiable. L’état du service est consultable publiquement sur la page dédiée.',
          ),
        ],
      },
      {
        id: 'suspension',
        title: 'Article 8 — Suspension, clôture et résiliation de l’accès',
        blocks: [
          p(
            'Le Prestataire peut suspendre un accès en cas de manquement grave aux présentes ' +
              'conditions, d’atteinte à la sécurité de la plateforme ou de défaut de paiement ' +
              'persistant, après information motivée de l’Utilisateur, sauf urgence caractérisée.',
          ),
          p(
            'L’Utilisateur peut fermer son compte à tout moment depuis son espace. La suspension ' +
              'ou la fermeture d’un accès n’emporte pas suppression immédiate des données : ' +
              'celles-ci demeurent conservées et exportables dans les conditions prévues par la ' +
              'politique de confidentialité.',
          ),
        ],
      },
      {
        id: 'responsabilite-cgu',
        title: 'Article 9 — Responsabilité',
        blocks: [
          p(
            'L’Utilisateur est responsable de l’usage qu’il fait de la plateforme et des contenus ' +
              'qu’il y publie. Le Prestataire ne répond pas des dommages résultant d’un usage non ' +
              'conforme aux présentes conditions, d’une divulgation des identifiants par ' +
              'l’Utilisateur ou d’une modification décidée et publiée par lui.',
          ),
          p(
            'Pour les Utilisateurs clients, la responsabilité du Prestataire est régie par les ' +
              'conditions générales de vente, dont les limitations s’appliquent également à ' +
              'l’utilisation de la plateforme.',
          ),
        ],
      },
      {
        id: 'propriete-plateforme',
        title: 'Article 10 — Propriété de la plateforme',
        blocks: [
          p(
            'La plateforme, son interface, ses composants techniques et sa documentation ' +
              'demeurent la propriété du Prestataire. L’abonnement confère un droit d’usage ' +
              'personnel et non exclusif, et n’emporte aucune cession de droits. Toute ' +
              'reproduction, décompilation ou extraction non autorisée est interdite.',
          ),
        ],
      },
      {
        id: 'donnees-cgu',
        title: 'Article 11 — Données personnelles',
        blocks: [
          p(
            'Les données des Utilisateurs sont traitées conformément à la politique de ' +
              'confidentialité. Les données collectées sur les sites des clients le sont ' +
              'conformément à l’accord de traitement des données.',
          ),
        ],
      },
      {
        id: 'evolution-cgu',
        title: 'Article 12 — Évolution des conditions',
        blocks: [
          p(
            'Les présentes conditions peuvent évoluer. Les Utilisateurs sont informés des ' +
              'modifications substantielles dans leur espace, au moins trente jours avant leur ' +
              'entrée en vigueur, et la version applicable est identifiée par son numéro et sa date. ' +
              'L’Utilisateur qui les refuse peut fermer son compte avant cette date.',
          ),
        ],
      },
      {
        id: 'droit-cgu',
        title: 'Article 13 — Droit applicable',
        blocks: [
          p(
            'Les présentes conditions sont soumises au droit français. Les litiges sont réglés ' +
              'selon les stipulations de l’article « Droit applicable et litiges » des conditions ' +
              'générales de vente.',
          ),
        ],
      },
    ],
  };
}

/* -------------------------------------------------------------------------- */
/*  Politique de confidentialité                                               */
/* -------------------------------------------------------------------------- */

export function buildPrivacyPolicy(): LegalDocument {
  const maintenance = maintenancePolicyConfig();
  const company = legalValue('LEGAL_COMPANY_NAME');
  const brand = legalValue('LEGAL_BRAND');
  const dpo = legalValue('LEGAL_DPO_CONTACT');

  return {
    slug: 'confidentialite',
    title: 'Politique de confidentialité',
    description:
      'Quelles données sont collectées, pourquoi, sur quelle base légale, combien de temps ' +
      'elles sont conservées, qui y accède et comment exercer ses droits.',
    version: PRIVACY_VERSION,
    updatedAt: UPDATED_AT,
    intro:
      'Cette politique décrit le traitement des données personnelles des visiteurs, des ' +
      `prospects et des clients de ${brand}. Le traitement des données collectées sur les sites ` +
      'de nos clients est décrit à l’article 10.',
    articles: [
      {
        id: 'responsable',
        title: 'Article 1 — Responsable du traitement',
        blocks: [
          p(
            `Le responsable du traitement est ${company}, qui exerce sous le nom ${brand}, dont ` +
              'les coordonnées complètes figurent dans les mentions légales.',
          ),
          p(
            `Contact pour toute question relative aux données personnelles : ${dpo}. Nous ` +
              'n’avons pas désigné de délégué à la protection des données, cette désignation ' +
              'n’étant pas obligatoire pour notre activité ; ce contact en tient lieu.',
          ),
        ],
      },
      {
        id: 'donnees-collectees',
        title: 'Article 2 — Données collectées',
        blocks: [
          defs([
            {
              term: 'Données de compte',
              description:
                'Adresse e-mail, nom, prénom, téléphone s’il est indiqué, rôle dans ' +
                'l’organisation, préférences, état de l’authentification à double facteur, ' +
                'version des conditions acceptées.',
            },
            {
              term: 'Données de facturation',
              description:
                'Raison sociale, adresse de facturation, numéro de TVA le cas échéant, ' +
                'historique des commandes et des factures, statut d’abonnement. Aucune donnée ' +
                'de carte bancaire n’est collectée ni conservée : elles sont traitées ' +
                'directement par le prestataire de paiement.',
            },
            {
              term: 'Données de projet',
              description:
                'Informations transmises pour la réalisation du site : activité, coordonnées ' +
                'professionnelles, horaires, prestations, textes et photographies fournis, ' +
                'messages échangés avec l’équipe.',
            },
            {
              term: 'Prospection et propositions',
              description:
                'Pour une entreprise que nous contactons : nom de l’entreprise, nom du ' +
                'dirigeant ou du contact, téléphone et adresse e-mail professionnels, adresse ' +
                'de l’établissement, secteur d’activité, et, si une proposition lui est faite, ' +
                'l’offre et le prix proposés, les dates d’envoi, de consultation et de paiement.',
            },
            {
              term: 'Demandes et signalements',
              description:
                'Messages envoyés par les formulaires de contact et de devis, et signalements de ' +
                'contenus illicites (identité et coordonnées de leur auteur, contenu signalé, ' +
                'motifs).',
            },
            {
              term: 'Données techniques',
              description:
                'Journaux de connexion (date, empreinte d’adresse IP, agent utilisateur) ' +
                'conservés à des fins de sécurité, et journaux d’audit des actions sensibles ' +
                'réalisées dans l’espace client.',
            },
          ]),
          note(
            'Aucune donnée sensible au sens de l’article 9 du RGPD n’est demandée. Nous ' +
              'recommandons de ne pas en transmettre via les formulaires de contact.',
          ),
        ],
      },
      {
        id: 'sources',
        title: 'Article 3 — Origine des données',
        blocks: [
          p(
            'La plupart des données nous sont communiquées directement par vous. Les ' +
              'coordonnées professionnelles des entreprises que nous contactons pour la première ' +
              'fois proviennent de sources publiques : registres officiels des entreprises, ' +
              'annuaires professionnels, fiches d’établissement et sites internet des entreprises ' +
              'elles-mêmes. Les données de paiement nous sont transmises par Stripe (statut du ' +
              'paiement, jamais le numéro de carte).',
          ),
          p(
            'Les champs signalés comme obligatoires dans nos formulaires sont nécessaires pour ' +
              'créer un compte, traiter une demande ou exécuter une commande : sans eux, nous ne ' +
              'pouvons pas y donner suite. Les autres sont facultatifs.',
          ),
        ],
      },
      {
        id: 'finalites',
        title: 'Article 4 — Finalités et bases légales',
        blocks: [
          list([
            'Fourniture du service, création et maintenance du site, accès à l’espace client — ' +
              'exécution du contrat (article 6.1.b du RGPD).',
            'Facturation, recouvrement et obligations comptables — obligation légale ' +
              '(article 6.1.c).',
            'Conservation des données d’identification exigée des hébergeurs et traitement des ' +
              'signalements de contenus illicites — obligation légale (article 6.1.c ; loi du ' +
              '21 juin 2004 ; règlement sur les services numériques).',
            'Sécurité de la plateforme, prévention de la fraude, journaux d’audit — intérêt ' +
              'légitime (article 6.1.f).',
            'Réponse aux demandes de contact et aux devis — mesures précontractuelles ' +
              '(article 6.1.b).',
            'Prospection commerciale auprès des professionnels (appel téléphonique, e-mail ' +
              'portant sur leur activité professionnelle) — intérêt légitime (article 6.1.f), à ' +
              'faire connaître nos services aux entreprises susceptibles d’en avoir besoin. Vous ' +
              'pouvez vous y opposer à tout moment, sans justification.',
            'Envoi et suivi d’une proposition de site à une entreprise qui l’a acceptée lors d’un ' +
              'échange téléphonique — mesures précontractuelles prises à sa demande (article ' +
              '6.1.b).',
            'Informations liées à votre abonnement (livraison, début de la maintenance, ' +
              'prélèvements, résiliation) — exécution du contrat et obligation légale.',
            'Actualités de Nemasus adressées aux personnes qui l’ont demandé lors de leur ' +
              'inscription — consentement (article 6.1.a), retirable à tout moment en un clic.',
            'Défense de nos droits en cas de litige — intérêt légitime (article 6.1.f).',
          ]),
          p(
            'Aucune décision produisant des effets juridiques à votre égard n’est prise sur le ' +
              'seul fondement d’un traitement automatisé, et aucun profilage n’est réalisé.',
          ),
        ],
      },
      {
        id: 'durees',
        title: 'Article 5 — Durées de conservation',
        blocks: [
          list([
            'Données de compte et de projet : pendant la durée du contrat, puis ' +
              `${maintenance.archiveRetentionDays} jours d’archivage permettant une réactivation ` +
              'ou un export.',
            `Site suspendu faute de maintenance : conservé ${maintenance.suspensionRetentionDays} ` +
              'jours avant archivage, sans suppression automatique des contenus.',
            `Documents comptables et factures : ${maintenance.financialRetentionYears} ans, ` +
              'durée imposée par le Code de commerce.',
            'Données d’identification que la loi impose aux hébergeurs de conserver (article 6 ' +
              'de la loi du 21 juin 2004 et décret n° 2021-1362) : pendant les durées fixées par ' +
              'ce décret, notamment cinq ans après la fin du contrat pour l’identité du titulaire ' +
              'du compte, avec un accès réservé aux réquisitions des autorités.',
            'Journaux de sécurité et journaux techniques : douze mois ; journal d’audit des ' +
              'actions sensibles : trois ans.',
            'Signalements de contenus : un an après la clôture de leur traitement.',
            'Prospects, demandes de contact et de devis restées sans suite : trois ans à compter ' +
              'du dernier contact émanant du prospect.',
            'Propositions de site non conclues (expirées ou retirées) : trois ans à compter du ' +
              'dernier échange ; conclues : comme les données de compte et de facturation.',
            'Opposition à la prospection : les seules données nécessaires pour ne plus vous ' +
              'contacter (entreprise, téléphone ou e-mail concerné), pendant trois ans.',
          ]),
          p(
            'À l’expiration de ces durées, les données sont supprimées ou anonymisées de manière ' +
              'irréversible.',
          ),
        ],
      },
      {
        id: 'destinataires',
        title: 'Article 6 — Destinataires et sous-traitants',
        blocks: [
          p(
            'Les données ne sont ni vendues, ni louées, ni cédées à des tiers à des fins ' +
              'publicitaires.',
          ),
          p(
            'Elles sont accessibles au personnel habilité et aux sous-traitants techniques ' +
              'strictement nécessaires au fonctionnement du service : hébergement de la ' +
              'plateforme et des sites (Cloudflare), base de données et fichiers (Supabase), code ' +
              'source des sites (GitHub), envoi des e-mails transactionnels (Resend). La liste ' +
              'complète et à jour, avec la localisation et les garanties de chacun, est publiée ' +
              'sur la page « Sous-traitants ».',
          ),
          p(
            'Les paiements sont traités par Stripe, qui agit en qualité de responsable de ' +
              'traitement distinct pour l’exécution des paiements, la lutte contre la fraude et ses ' +
              'obligations réglementaires, conformément à sa propre politique de confidentialité.',
          ),
          p(
            'Les données peuvent être communiquées aux autorités administratives ou judiciaires ' +
              'qui en font la demande dans les conditions prévues par la loi, ainsi qu’à nos ' +
              'conseils (avocat, expert-comptable), tenus au secret professionnel.',
          ),
          p(
            'Chaque accès du personnel à des données client fait l’objet d’une trace ' +
              'horodatée. La prise en main d’un compte client à des fins de support ne peut ' +
              'intervenir sans motif enregistré et reste limitée dans le temps.',
          ),
        ],
      },
      {
        id: 'transferts',
        title: 'Article 7 — Localisation et transferts hors Union européenne',
        blocks: [
          p(
            'La base de données et les fichiers de la plateforme sont hébergés en France (région ' +
              'de Paris). La plateforme et les sites sont servis par le réseau mondial de ' +
              'Cloudflare ; certains prestataires — hébergement et diffusion, code source des ' +
              'sites, envoi des e-mails — sont des sociétés établies hors de l’Union européenne, ' +
              'principalement aux États-Unis.',
          ),
          p(
            'Ces transferts sont encadrés par les clauses contractuelles types adoptées par la ' +
              'Commission européenne, intégrées aux accords de traitement de ces prestataires, et, ' +
              'lorsque le prestataire y est certifié, par le cadre de protection des données ' +
              'UE–États-Unis. Les garanties applicables à chaque prestataire sont indiquées sur la ' +
              'page des sous-traitants ; une copie peut être obtenue sur demande.',
          ),
        ],
      },
      {
        id: 'droits',
        title: 'Article 8 — Vos droits',
        blocks: [
          p('Vous disposez des droits suivants :'),
          list([
            'droit d’accès à vos données et d’obtention d’une copie ;',
            'droit de rectification des données inexactes ;',
            'droit à l’effacement, dans les limites des obligations légales de conservation ;',
            'droit à la limitation du traitement ;',
            'droit d’opposition, à tout moment et pour des raisons tenant à votre situation, aux ' +
              'traitements fondés sur l’intérêt légitime, et, sans avoir à vous justifier, à la ' +
              'prospection commerciale ;',
            'droit à la portabilité de vos données, dans un format structuré et lisible par ' +
              'machine ;',
            'droit de retirer votre consentement à tout moment, lorsque le traitement repose ' +
              'sur celui-ci ;',
            'droit de définir des directives relatives au sort de vos données après votre décès.',
          ]),
          p(
            'L’export de vos contenus, messages et contacts est disponible en libre-service ' +
              `depuis votre espace. Pour toute autre demande, écrivez à ${dpo}. Pour ne plus être ` +
              'contacté dans le cadre de notre prospection, répondez « STOP » à notre e-mail ou ' +
              'dites-le-nous lors de l’appel : vos coordonnées sont alors effacées, à l’exception ' +
              'de ce qui est nécessaire pour ne plus vous solliciter. Une réponse est apportée dans ' +
              'un délai d’un mois, prolongeable de deux mois pour les demandes complexes.',
          ),
          p(
            'Vous pouvez introduire une réclamation auprès de la Commission nationale de ' +
              'l’informatique et des libertés (CNIL), 3 place de Fontenoy, TSA 80715, ' +
              '75334 Paris Cedex 07, ou sur cnil.fr.',
          ),
        ],
      },
      {
        id: 'cookies-confidentialite',
        title: 'Article 9 — Cookies',
        blocks: [
          p(
            'Le site public et l’espace client ne déposent que des traceurs strictement ' +
              'nécessaires (session, sécurité des formulaires, commande en cours), exemptés de ' +
              'consentement. Aucune mesure d’audience, aucun traceur publicitaire. Le détail ' +
              'figure dans la page « Cookies et traceurs ».',
          ),
        ],
      },
      {
        id: 'sites-clients',
        title: 'Article 10 — Données collectées sur les sites de nos clients',
        blocks: [
          p(
            'Lorsqu’un visiteur remplit un formulaire, réserve un créneau, crée un compte ou passe ' +
              `commande sur le site d’un client ${brand}, le responsable du traitement est ce ` +
              `client, et non ${company}. La politique de confidentialité de son site l’identifie.`,
          ),
          p(
            `${company} intervient alors en qualité de sous-traitant au sens de l’article 28 du ` +
              'RGPD : nous hébergeons et traitons ces données sur instruction du client, sans les ' +
              'utiliser à nos propres fins, dans les conditions de l’accord de traitement des ' +
              'données publié sur ce site.',
          ),
          note(
            'Pour exercer vos droits sur des données collectées par le site d’un de nos clients, ' +
              'adressez-vous à ce client. Si vous nous écrivez, nous transmettons votre demande ' +
              'sans délai.',
          ),
        ],
      },
      {
        id: 'securite-donnees',
        title: 'Article 11 — Sécurité',
        blocks: [
          list([
            'chiffrement des échanges en transit et des données au repos ;',
            'isolation des données entre clients imposée au niveau de la base de données, et ' +
              'non par un filtrage applicatif ;',
            'authentification à double facteur disponible pour tous, obligatoire pour les ' +
              'comptes d’administration ;',
            'journalisation des actions sensibles, sans jamais y consigner de mot de passe ni de ' +
              'secret ;',
            'sauvegardes régulières et procédure de restauration documentée.',
          ]),
          p(
            'En cas de violation de données susceptible d’engendrer un risque pour vos droits, ' +
              'la CNIL est notifiée dans les 72 heures et les personnes concernées sont ' +
              'informées lorsque le risque est élevé.',
          ),
        ],
      },
      {
        id: 'evolution-confidentialite',
        title: 'Article 12 — Évolution de cette politique',
        blocks: [
          p(
            'Cette politique peut évoluer, notamment pour refléter une évolution du service ou de ' +
              'la réglementation. La version en vigueur est identifiée par sa date ; les ' +
              'modifications substantielles sont signalées aux clients dans leur espace.',
          ),
        ],
      },
    ],
  };
}

/* -------------------------------------------------------------------------- */
/*  Politique de cookies                                                       */
/* -------------------------------------------------------------------------- */

export function buildCookiePolicy(): LegalDocument {
  const brand = legalValue('LEGAL_BRAND');

  return {
    slug: 'cookies',
    title: 'Cookies et traceurs',
    description:
      `Ce que ${brand} dépose sur votre appareil, pourquoi, et comment le contrôler. Aucun ` +
      'cookie publicitaire, aucune mesure d’audience, aucun traceur tiers.',
    updatedAt: UPDATED_AT,
    intro:
      'Notre position est simple : nous ne déposons aucun traceur qui ne soit strictement ' +
      'nécessaire au service que vous demandez. C’est pourquoi aucun bandeau ne vous demande ' +
      'votre consentement : la loi ne l’exige pas pour ces traceurs.',
    articles: [
      {
        id: 'principe-cookies',
        title: 'Article 1 — Principe',
        blocks: [
          p(
            `Le site public de ${brand} est consultable sans cookie de suivi. Les seuls cookies ` +
              'utilisés servent à maintenir une session ouverte, à conserver une commande en cours ' +
              'et à protéger les formulaires.',
          ),
          p(
            'Nous n’utilisons ni cookie publicitaire, ni bouton de réseau social traceur, ni ' +
              'outil de mesure d’audience, ni outil d’analyse comportementale. Les polices de ' +
              'caractères sont servies par nos propres serveurs : votre navigateur ne contacte ' +
              'aucun service tiers pour les afficher.',
          ),
        ],
      },
      {
        id: 'cookies-utilises',
        title: 'Article 2 — Cookies et stockage utilisés',
        blocks: [
          defs([
            {
              term: 'Cookie de session',
              description:
                'Maintient votre connexion à l’espace client (cookies « sb-… »). Strictement ' +
                'nécessaire, exempté de consentement. Durée : la session, ou la durée de validité ' +
                'du jeton de rafraîchissement si vous restez connecté.',
            },
            {
              term: 'Commande en cours',
              description:
                'Conserve les étapes de votre commande pendant que vous la remplissez ' +
                '(« __nemasus_order »). Strictement nécessaire au service que vous demandez, ' +
                'exempté de consentement. Durée : quatorze jours au plus ; supprimé à la fin de la ' +
                'commande.',
            },
            {
              term: 'Espace de travail',
              description:
                'Retient l’entreprise et le site sur lesquels vous travaillez dans l’espace ' +
                'client (« nemasus_org », « nemasus_site »). Strictement nécessaire, exempté de ' +
                'consentement.',
            },
            {
              term: 'Protection des formulaires',
              description:
                'Jeton anti-falsification de requête et vérification anti-robot (Cloudflare ' +
                'Turnstile), utilisés lors de l’envoi d’un formulaire, uniquement pour distinguer ' +
                'un humain d’un robot. Strictement nécessaires à la sécurité du service, exemptés ' +
                'de consentement.',
            },
            {
              term: 'Préférences',
              description:
                'Affichage de la navigation et des guides de l’éditeur. Stockées localement dans ' +
                'votre navigateur, jamais transmises à nos serveurs.',
            },
          ]),
        ],
      },
      {
        id: 'consentement-cookies',
        title: 'Article 3 — Consentement',
        blocks: [
          p(
            'Les traceurs strictement nécessaires n’exigent pas de consentement, conformément à ' +
              'l’article 82 de la loi Informatique et Libertés et aux lignes directrices de la ' +
              'CNIL. Aucun autre traceur n’est utilisé.',
          ),
          p(
            'Si un traceur soumis à consentement devait être introduit, un bandeau permettant de ' +
              'l’accepter ou de le refuser avec la même facilité serait affiché, et aucun dépôt ' +
              'n’aurait lieu avant un choix explicite. Le refus serait mémorisé au même titre ' +
              'que l’acceptation, et cette page serait mise à jour.',
          ),
        ],
      },
      {
        id: 'controle-cookies',
        title: 'Article 4 — Contrôler les cookies',
        blocks: [
          p(
            'Vous pouvez configurer votre navigateur pour refuser ou supprimer les cookies. Le ' +
              'refus des cookies strictement nécessaires empêche cependant la connexion à ' +
              'l’espace client et la commande en ligne.',
          ),
          p(
            'La suppression des préférences stockées localement remet simplement l’interface à ' +
              'son état par défaut.',
          ),
        ],
      },
      {
        id: 'cookies-sites-clients',
        title: 'Article 5 — Cookies sur les sites de nos clients',
        blocks: [
          p(
            `Les sites publiés par ${brand} suivent la même règle : aucun traceur publicitaire ` +
              'n’est déposé par nos soins, et les polices de caractères sont servies sans passer ' +
              'par un service tiers. Lorsqu’un site dispose d’une mesure de fréquentation fournie ' +
              'par la plateforme, celle-ci fonctionne sans cookie ni identifiant persistant, ne ' +
              'conserve aucune adresse IP et ne produit que des statistiques agrégées.',
          ),
          p(
            'Une vidéo ou une carte intégrée provenant d’un service tiers (par exemple YouTube, ' +
              'Vimeo ou Google Maps) n’est chargée qu’après un clic du visiteur, qui est informé au ' +
              'préalable que ce service peut déposer des traceurs. Rien n’est transmis à ce service ' +
              'tant que le visiteur n’a pas fait ce choix.',
          ),
          note(
            'Chaque client est l’éditeur de son site : s’il y ajoute lui-même un outil soumis à ' +
              'consentement, il lui appartient de recueillir ce consentement.',
          ),
        ],
      },
    ],
  };
}

/* -------------------------------------------------------------------------- */
/*  Politique de remboursement                                                 */
/* -------------------------------------------------------------------------- */

export function buildRefundPolicy(): LegalDocument {
  const refund = refundPolicyConfig();

  return {
    slug: 'remboursements',
    title: 'Politique de remboursement',
    description:
      `Garantie commerciale de ${refund.windowDays} jours après la livraison : conditions, ` +
      'procédure, délais, effets et déduction éventuelle du nom de domaine.',
    updatedAt: UPDATED_AT,
    intro:
      'Cette garantie commerciale est un engagement volontaire du Prestataire, défini à ' +
      'l’article 18 des conditions générales de vente. Elle s’ajoute aux droits que vous tenez ' +
      'de la loi : elle ne les remplace ni ne les restreint en aucune manière.',
    articles: [
      {
        id: 'garantie',
        title: `Article 1 — Garantie de ${refund.windowDays} jours`,
        blocks: [
          p(
            `Vous disposez de ${refund.windowDays} jours calendaires à compter de la livraison ` +
              'de votre site — sa remise, une fois en ligne — pour demander le remboursement.',
          ),
          p(
            'Aucune justification n’est exigée. Nous vous demandons simplement, si vous le ' +
              'souhaitez, ce qui n’a pas convenu : c’est ainsi que le service progresse. La ' +
              'garantie peut être exercée une fois par client.',
          ),
        ],
      },
      {
        id: 'perimetre-remboursement',
        title: 'Article 2 — Ce qui est remboursé',
        blocks: [
          list([
            'le paiement de création effectivement réglé ;',
            'les mensualités de maintenance déjà prélevées, en totalité.',
          ]),
          p(
            'Le remboursement est effectué sur le moyen de paiement utilisé lors de la commande. ' +
              'Aucun autre moyen de remboursement ne peut être utilisé sans votre accord ' +
              'exprès.',
          ),
        ],
      },
      {
        id: 'deduction-domaine',
        title: 'Article 3 — Déduction liée au nom de domaine',
        blocks: [
          p(
            'Une seule déduction est possible, et uniquement dans un cas précis : lorsqu’un nom ' +
              'de domaine a été réellement acheté pour votre compte. Ce coût est engagé de ' +
              'manière irréversible auprès du bureau d’enregistrement dès l’achat.',
          ),
          p(
            `Dans ce cas, et dans ce cas seulement, un montant forfaitaire de ` +
              `${formatRefundDeduction(refund.domainDeductionCents)} est retenu sur le ` +
              'remboursement. Le nom de domaine, enregistré à votre nom, vous reste acquis pour la ' +
              'durée de son enregistrement.',
          ),
          note(
            'Si aucun nom de domaine n’a été acheté — parce que vous en possédiez déjà un, ou ' +
              'parce que le site utilisait encore une adresse de prévisualisation — rien n’est ' +
              'retenu. Cette condition est vérifiée automatiquement à partir de l’état réel de ' +
              'votre dossier, et non déclarée à la main.',
          ),
        ],
      },
      {
        id: 'procedure-remboursement',
        title: 'Article 4 — Procédure',
        blocks: [
          list([
            'depuis votre espace client, ouvrez « Facturation » puis « Demander un ' +
              'remboursement » ;',
            'la demande est enregistrée avec sa date, et son éligibilité est calculée ' +
              'automatiquement à partir de la date réelle de livraison ;',
            'nous accusons réception et examinons la demande ;',
            'en cas d’acceptation, le remboursement est déclenché auprès du prestataire de ' +
              'paiement ;',
            'vous suivez l’avancement de la demande depuis votre espace, à chaque changement ' +
              'd’état.',
          ]),
          p(
            'Les délais de mise à disposition des fonds dépendent ensuite de votre banque, ' +
              'généralement quelques jours ouvrés.',
          ),
        ],
      },
      {
        id: 'effets-remboursement',
        title: 'Article 5 — Effets du remboursement',
        blocks: [
          p(
            'Le remboursement met fin au contrat à sa date. Le site peut alors être mis hors ' +
              'ligne, et les textes, visuels et code créés par nos soins ne peuvent plus être ' +
              'utilisés : la cession de droits, qui supposait le paiement de la création, est ' +
              'réputée n’être jamais intervenue.',
          ),
          p(
            'Vous conservez vos propres contenus (textes, photographies, logos que vous avez ' +
              'fournis) et pouvez exporter vos données depuis votre espace pendant les délais de ' +
              'conservation prévus par les conditions générales de vente.',
          ),
        ],
      },
      {
        id: 'refus-remboursement',
        title: 'Article 6 — Cas de refus',
        blocks: [
          p('Une demande peut être refusée, avec un motif écrit, notamment lorsque :'),
          list([
            `le délai de ${refund.windowDays} jours après la livraison est dépassé ;`,
            'la garantie a déjà été exercée pour une précédente commande ;',
            'la demande porte sur une prestation sur mesure déjà livrée et acceptée, régie par ' +
              'son propre devis ;',
            'un usage manifestement frauduleux est caractérisé.',
          ]),
          p('Un refus n’éteint aucun des droits que vous tenez de la loi ou du contrat.'),
        ],
      },
      {
        id: 'garanties-legales',
        title: 'Article 7 — Articulation avec vos droits',
        blocks: [
          p(
            'La présente garantie commerciale est distincte des droits et garanties prévus par ' +
              'la loi et par les conditions générales de vente, qui demeurent applicables de plein ' +
              'droit, notamment en cas de manquement du Prestataire à ses obligations.',
          ),
        ],
      },
    ],
  };
}

/* -------------------------------------------------------------------------- */
/*  Données personnelles — exercice concret des droits                         */
/* -------------------------------------------------------------------------- */

export function buildDataPolicy(): LegalDocument {
  const maintenance = maintenancePolicyConfig();
  const dpo = legalValue('LEGAL_DPO_CONTACT');

  return {
    slug: 'donnees-personnelles',
    title: 'Vos données personnelles',
    description:
      'Exporter, corriger, supprimer : ce que vous pouvez faire vous-même, ce qui demande une ' +
      'demande, et ce que la loi nous impose de conserver.',
    updatedAt: UPDATED_AT,
    intro:
      'La politique de confidentialité décrit le cadre juridique. Cette page décrit les gestes ' +
      'concrets : où cliquer, quoi attendre, et dans quels délais.',
    articles: [
      {
        id: 'roles',
        title: 'Article 1 — Qui est responsable de quoi',
        blocks: [
          defs([
            {
              term: 'Vos données de client Nemasus',
              description:
                'Compte, facturation, échanges de projet. Nous en sommes responsables de ' +
                'traitement.',
            },
            {
              term: 'Les données collectées sur votre site',
              description:
                'Messages, réservations, commandes, contacts et comptes clients de vos propres ' +
                'visiteurs. Vous en êtes responsable de traitement ; nous agissons comme ' +
                'sous-traitant, sur vos instructions, selon l’accord de traitement des données.',
            },
          ]),
          p(
            'Cette distinction a une conséquence pratique : une demande d’un de vos visiteurs ' +
              'vous est adressée à vous, et notre rôle est de vous donner les outils pour y ' +
              'répondre.',
          ),
        ],
      },
      {
        id: 'export',
        title: 'Article 2 — Exporter vos données',
        blocks: [
          p(
            'L’export est disponible en libre-service depuis votre espace, sans demande ' +
              'préalable et sans frais :',
          ),
          list([
            'messages reçus et contacts, au format CSV lisible par un tableur ;',
            'réservations et commandes, avec leur historique ;',
            'comptes clients ouverts sur votre site ;',
            'factures et justificatifs de paiement.',
          ]),
          p(
            'Les exports CSV sont protégés contre l’injection de formule : une valeur commençant ' +
              'par un signe interprétable par un tableur est neutralisée avant l’écriture.',
          ),
        ],
      },
      {
        id: 'visiteurs',
        title: 'Article 3 — Répondre à la demande d’un de vos clients',
        blocks: [
          p(
            'Depuis « Comptes clients », vous consultez, bloquez ou supprimez définitivement le ' +
              'compte d’un client de votre site. Depuis « Messages » et « Contacts », vous ' +
              'retrouvez et supprimez ses demandes. Les commandes et réservations passées sont ' +
              'conservées, comme la loi l’impose pour les pièces commerciales.',
          ),
        ],
      },
      {
        id: 'rectification',
        title: 'Article 4 — Corriger vos informations',
        blocks: [
          p(
            'Les informations de compte et de facturation se modifient directement depuis votre ' +
              'espace. Une adresse e-mail de connexion modifiée fait l’objet d’une vérification ' +
              'du nouvel e-mail avant d’être prise en compte.',
          ),
        ],
      },
      {
        id: 'suppression',
        title: 'Article 5 — Supprimer votre compte et vos données',
        blocks: [
          p(
            'La demande de suppression s’effectue en nous écrivant depuis votre espace (« Aide & ' +
              'support »). Nous vérifions qu’elle émane bien de vous, vous rappelons d’exporter vos ' +
              'données, puis vous confirmons par écrit ce qui est effacé et ce que la loi nous ' +
              'oblige à conserver. Elle est exécutée après un délai de sécurité permettant ' +
              'd’annuler une demande accidentelle ou frauduleuse.',
          ),
          p('Sont alors supprimés :'),
          list([
            'votre compte et ceux des membres invités de votre organisation ;',
            'les contenus du site, les médias et les versions publiées ;',
            'les messages, contacts, réservations, commandes et comptes clients hébergés pour ' +
              'vous.',
          ]),
          p('Sont conservés, parce que la loi l’impose :'),
          list([
            `les factures et pièces comptables, pendant ${maintenance.financialRetentionYears} ans ;`,
            'les données d’identification que la loi impose aux hébergeurs de conserver (décret ' +
              'n° 2021-1362), pendant la durée légale, sous accès restreint ;',
            'les journaux de sécurité, pendant douze mois, sous forme minimisée.',
          ]),
          note(
            'Nous vous recommandons vivement de réaliser un export avant toute demande de ' +
              'suppression : celle-ci est irréversible.',
          ),
        ],
      },
      {
        id: 'retention-site',
        title: 'Article 6 — Ce qui se passe si vous arrêtez la maintenance',
        blocks: [
          list([
            `votre site reste en ligne pendant une période de continuité de ` +
              `${maintenance.gracePeriodDays} jours après la fin de la période payée ;`,
            `il est ensuite suspendu, mais ni supprimé ni effacé, pendant ` +
              `${maintenance.suspensionRetentionDays} jours ;`,
            `les données sont ensuite archivées et conservées ${maintenance.archiveRetentionDays} ` +
              'jours, période pendant laquelle une réactivation reste possible ;',
            'l’export de vos données reste accessible pendant toute cette durée.',
          ]),
          p(
            'Aucune suppression automatique n’intervient avant ces délais. Vous êtes informé ' +
              'avant chaque changement d’état.',
          ),
        ],
      },
      {
        id: 'contact-donnees',
        title: 'Article 7 — Nous écrire',
        blocks: [
          p(
            `Pour toute demande relative à vos données personnelles : ${dpo}. Précisez la nature ` +
              'de votre demande et l’adresse e-mail associée à votre compte. Une pièce ' +
              'justificative d’identité ne vous sera demandée qu’en cas de doute raisonnable sur ' +
              'votre identité.',
          ),
        ],
      },
    ],
  };
}

/* -------------------------------------------------------------------------- */
/*  Signalement de contenus illicites                                          */
/* -------------------------------------------------------------------------- */

export function buildNoticeAndAction(): LegalDocument {
  return {
    slug: 'signaler-un-contenu',
    title: 'Signaler un contenu',
    description:
      'Un contenu vous semble illicite sur un site hébergé par Nemasus ? Signalez-le : chaque ' +
      'signalement est examiné par une personne et reçoit une réponse motivée.',
    updatedAt: UPDATED_AT,
    intro:
      'Ce mécanisme répond à l’article 16 du règlement (UE) 2022/2065 sur les services numériques ' +
      'et à l’article 6 de la loi du 21 juin 2004 pour la confiance dans l’économie numérique.',
    articles: [
      {
        id: 'contenu-signalement',
        title: 'Ce que votre signalement doit contenir',
        blocks: [
          list([
            'l’adresse exacte (URL) du contenu concerné ;',
            'les raisons pour lesquelles vous estimez ce contenu illicite, aussi précises que ' +
              'possible (par exemple le droit ou la disposition légale en cause) ;',
            'votre nom et votre adresse e-mail ;',
            'une déclaration confirmant que vous êtes convaincu, de bonne foi, que les ' +
              'informations fournies sont exactes et complètes.',
          ]),
          note(
            'Pour un contenu relevant d’abus sexuels sur mineurs, vous pouvez signaler sans ' +
              'indiquer votre identité, ou vous adresser directement à internet-signalement.gouv.fr ' +
              '(PHAROS). En cas de danger immédiat, appelez le 17 ou le 112.',
          ),
        ],
      },
      {
        id: 'suite-signalement',
        title: 'Ce qui se passe ensuite',
        blocks: [
          list([
            'vous recevez un accusé de réception par e-mail ;',
            'une personne examine le signalement, sans décision automatisée ;',
            'si le contenu est manifestement illicite, son accès est retiré ou bloqué, ou le site ' +
              'concerné est suspendu ;',
            'l’éditeur du site est informé de la décision et de ses motifs, et peut la contester ;',
            'vous êtes informé de la suite donnée à votre signalement.',
          ]),
          note(
            'Un signalement que son auteur sait inexact, dans le but d’obtenir un retrait, ' +
              'engage sa responsabilité et peut constituer un délit.',
          ),
        ],
      },
    ],
  };
}

/* -------------------------------------------------------------------------- */
/*  Sous-traitants                                                             */
/* -------------------------------------------------------------------------- */

export function buildSubprocessors(): LegalDocument {
  return {
    slug: 'sous-traitants',
    title: 'Sous-traitants',
    description:
      'Liste des prestataires techniques qui traitent des données pour le compte de Nemasus, leur ' +
      'finalité, leur localisation et les garanties de transfert applicables.',
    updatedAt: UPDATED_AT,
    intro:
      'Cette liste est publiée par transparence et tenue à jour. Elle est lue directement depuis ' +
      'notre base de données : ce que vous voyez ici est ce que la plateforme utilise réellement.',
    articles: [
      {
        id: 'engagement-sous-traitants',
        title: 'Article 1 — Nos engagements',
        blocks: [
          list([
            'chaque sous-traitant est lié par un accord de traitement conforme à l’article 28 du ' +
              'RGPD ;',
            'aucun sous-traitant n’est autorisé à utiliser les données pour ses propres ' +
              'finalités ;',
            'les transferts hors Union européenne sont encadrés par des clauses contractuelles ' +
              'types ou une décision d’adéquation ;',
            'nous privilégions systématiquement, à service équivalent, un hébergement des ' +
              'données applicatives dans l’Union européenne.',
          ]),
        ],
      },
      {
        id: 'evolution-sous-traitants',
        title: 'Article 2 — Évolution de la liste',
        blocks: [
          p(
            'L’ajout ou le remplacement d’un sous-traitant traitant des données personnelles est ' +
              'publié sur cette page et annoncé aux clients dans leur espace au moins trente jours ' +
              'à l’avance ; ils peuvent formuler une objection motivée, conformément à l’accord de ' +
              'traitement des données.',
          ),
        ],
      },
    ],
  };
}

/* -------------------------------------------------------------------------- */
/*  Déclaration d'accessibilité                                                */
/* -------------------------------------------------------------------------- */

export function buildAccessibility(): LegalDocument {
  const support = legalValue('SUPPORT_EMAIL');
  const company = legalValue('LEGAL_COMPANY_NAME');

  return {
    slug: 'accessibilite',
    title: 'Accessibilité',
    description:
      'Notre démarche d’accessibilité numérique : ce qui est en place, ce qui ne l’est pas ' +
      'encore, et comment nous signaler une difficulté.',
    updatedAt: UPDATED_AT,
    intro:
      'Nous préférons une déclaration exacte à une déclaration flatteuse. Aucun audit de ' +
      'conformité externe n’a encore été réalisé : nous ne revendiquons donc aucun taux de ' +
      'conformité chiffré.',
    articles: [
      {
        id: 'etat-conformite',
        title: 'Article 1 — État de conformité',
        blocks: [
          p(
            `${company} s’engage à rendre la plateforme et les sites qu’elle publie accessibles, ` +
              'conformément aux principes du référentiel général d’amélioration de ' +
              'l’accessibilité (RGAA) et des règles WCAG 2.2 niveau AA.',
          ),
          note(
            'À ce jour, l’accessibilité repose sur une auto-évaluation et sur des contrôles ' +
              'automatisés intégrés à notre chaîne de développement. Aucun audit de conformité ' +
              'par un tiers n’a encore été mené : le statut déclaré est donc « non audité », et ' +
              'non « totalement conforme ». Cette déclaration sera mise à jour dès qu’un audit ' +
              'aura été réalisé.',
          ),
        ],
      },
      {
        id: 'mesures',
        title: 'Article 2 — Mesures mises en œuvre',
        blocks: [
          list([
            'structure sémantique des pages : titres hiérarchisés, repères de navigation, listes ' +
              'et tableaux correctement balisés ;',
            'navigation complète au clavier, ordre de tabulation cohérent, focus toujours ' +
              'visible et lien d’évitement vers le contenu principal ;',
            'contrastes de couleur vérifiés sur chaque surface, y compris les blocs sur fond sombre ;',
            'formulaires avec étiquettes explicites, messages d’erreur reliés à leur champ et ' +
              'résumé d’erreurs annoncé aux technologies d’assistance ;',
            'respect de « prefers-reduced-motion » : les animations sont désactivées et le ' +
              'contenu reste immédiatement visible ;',
            'respect de « prefers-reduced-transparency » et « prefers-contrast » : les effets de ' +
              'transparence sont remplacés par des surfaces opaques ;',
            'textes alternatifs demandés à la saisie pour chaque image ajoutée par un client ;',
            'interface utilisable jusqu’à 320 pixels de large et jusqu’à 200 % de zoom sans ' +
              'perte d’information.',
          ]),
        ],
      },
      {
        id: 'limites',
        title: 'Article 3 — Limites connues',
        blocks: [
          list([
            'les contenus ajoutés par nos clients (textes, images, documents) relèvent de leur ' +
              'responsabilité éditoriale : la plateforme les guide mais ne peut garantir leur ' +
              'accessibilité ;',
            'les documents bureautiques mis en ligne par un client ne font l’objet d’aucun ' +
              'traitement automatique d’accessibilité ;',
            'certains contenus tiers intégrés, lorsqu’ils sont autorisés, échappent à notre ' +
              'contrôle.',
          ]),
        ],
      },
      {
        id: 'retour-accessibilite',
        title: 'Article 4 — Signaler une difficulté',
        blocks: [
          p(
            `Si vous rencontrez un obstacle, écrivez-nous à ${support} en décrivant la page ` +
              'concernée et la difficulté rencontrée. Nous nous engageons à répondre et à ' +
              'proposer une alternative permettant d’accéder à l’information ou au service.',
          ),
        ],
      },
      {
        id: 'recours',
        title: 'Article 5 — Voies de recours',
        blocks: [
          p(
            'Si un signalement reste sans réponse satisfaisante, vous pouvez saisir le Défenseur ' +
              'des droits, par le formulaire en ligne du site defenseurdesdroits.fr, par ' +
              'téléphone au 09 69 39 00 00, ou en contactant le délégué du Défenseur des droits ' +
              'de votre département.',
          ),
        ],
      },
    ],
  };
}

/* -------------------------------------------------------------------------- */
/*  Registre des documents                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Formate la retenue liee au domaine sans jamais diviser des centimes a la main.
 * La valeur vient de la configuration : elle n'est ecrite en dur nulle part.
 */
function formatRefundDeduction(cents: number): string {
  return formatMoney(cents, 'EUR', { hideDecimalsWhenRound: true });
}

export const LEGAL_BUILDERS = {
  'mentions-legales': buildLegalNotice,
  cgv: buildTerms,
  cgu: buildTermsOfUse,
  'accord-de-traitement': buildDataProcessingAgreement,
  confidentialite: buildPrivacyPolicy,
  cookies: buildCookiePolicy,
  remboursements: buildRefundPolicy,
  'donnees-personnelles': buildDataPolicy,
  'sous-traitants': buildSubprocessors,
  'signaler-un-contenu': buildNoticeAndAction,
  accessibilite: buildAccessibility,
} as const satisfies Record<string, () => LegalDocument>;

export type LegalSlug = keyof typeof LEGAL_BUILDERS;

export function getLegalDocument(slug: LegalSlug): LegalDocument {
  return LEGAL_BUILDERS[slug]();
}

/** Ordre d'affichage dans la navigation transversale des pages légales. */
export const LEGAL_ORDER: readonly LegalSlug[] = [
  'mentions-legales',
  'cgv',
  'cgu',
  'accord-de-traitement',
  'confidentialite',
  'cookies',
  'remboursements',
  'donnees-personnelles',
  'sous-traitants',
  'signaler-un-contenu',
  'accessibilite',
];
