import {
  LEGAL_REVIEW_REQUIRED,
  isLegalValueConfigured,
  legalValue,
  deliveryPolicyConfig,
  maintenancePolicyConfig,
  refundPolicyConfig,
} from '@stax/config';
import { formatMoney, maintenanceTrialDays } from '@stax/payments';

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
 *     réellement (maintenance annuelle, compte Stripe au nom du client,
 *     export en libre-service…) — un texte qui promet autre chose que le
 *     produit est le premier motif de litige ;
 *  2. aucune valeur d'identité (dénomination, SIREN, siège, capital,
 *     directeur de la publication, hébergeur) n'est écrite en dur : tout
 *     provient de la configuration, et un champ non renseigné affiche un
 *     marqueur explicite.
 */
export const LEGAL_DOCUMENTS_REQUIRE_REVIEW = LEGAL_REVIEW_REQUIRED;

/**
 * Versions réellement acceptées, conservées en base avec leur date.
 * 2026-09 : maintenance annuelle, offres réservées aux professionnels et aux
 * associations, accord de traitement des données, règlement sur les services
 * numériques.
 */
export const TERMS_VERSION = '2026-09';
export const PRIVACY_VERSION = '2026-09';
export const TERMS_OF_USE_VERSION = '2026-09';
export const DPA_VERSION = '2026-09';

const UPDATED_AT = '2026-09-23';

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

/* -------------------------------------------------------------------------- */
/*  Mentions légales                                                           */
/* -------------------------------------------------------------------------- */

export function buildLegalNotice(): LegalDocument {
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
            `${legalValue('LEGAL_BRAND')} est une marque et une branche d’activité de ` +
              `${legalValue('LEGAL_COMPANY_NAME')}. Le présent site est édité par :`,
          ),
          defs([
            { term: 'Dénomination sociale', description: legalValue('LEGAL_COMPANY_NAME') },
            { term: 'Nom commercial', description: legalValue('LEGAL_BRAND') },
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
            'Les données applicatives (contenus, messages, réservations, contacts) sont ' +
              'stockées dans une base de données hébergée dans une région de l’Union européenne. ' +
              'La liste complète de nos sous-traitants, avec leur localisation, est publiée sur ' +
              'la page « Sous-traitants ».',
          ),
        ],
      },
      {
        id: 'sites-clients',
        title: 'Sites de nos clients',
        blocks: [
          p(
            `Les sites réalisés avec ${legalValue('LEGAL_BRAND')} sont édités par nos clients, ` +
              'qui en déterminent le contenu et en sont responsables en qualité d’éditeurs. ' +
              `${legalValue('LEGAL_COMPANY_NAME')} en assure l’hébergement au sens de l’article 6 ` +
              'de la loi du 21 juin 2004 et du règlement (UE) 2022/2065 sur les services ' +
              'numériques. Les mentions légales de chaque site identifient son éditeur.',
          ),
        ],
      },
      {
        id: 'propriete',
        title: 'Propriété intellectuelle',
        blocks: [
          p(
            'La structure du site, ses textes, son identité visuelle, la marque StaX et les ' +
              'éléments logiciels qui le composent sont protégés par le droit de la propriété ' +
              'intellectuelle. Toute reproduction ou représentation, totale ou partielle, sans ' +
              'autorisation écrite préalable est interdite.',
          ),
          p(
            'Les contenus publiés par nos clients sur leurs propres sites restent leur ' +
              'propriété exclusive. StaX n’acquiert aucun droit sur ces contenus, en dehors des ' +
              'droits techniques strictement nécessaires à l’hébergement et à l’affichage du site.',
          ),
        ],
      },
      {
        id: 'responsabilite',
        title: 'Responsabilité',
        blocks: [
          p(
            'StaX met en œuvre les moyens raisonnables pour assurer l’exactitude des ' +
              'informations publiées sur ce site et la disponibilité de ses services. Les ' +
              'informations à caractère général ne constituent ni un conseil juridique, ni un ' +
              'conseil fiscal, ni une offre contractuelle : seules les conditions générales de ' +
              'vente acceptées lors de la commande engagent les parties.',
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
        blocks: [
          p(
            'Nos offres sont réservées aux professionnels et aux associations. Si un litige ' +
              'devait néanmoins nous opposer à un consommateur, celui-ci pourrait recourir ' +
              'gratuitement au médiateur de la consommation désigné ci-dessous, conformément à ' +
              'l’article L.612-1 du Code de la consommation, après avoir tenté de résoudre le ' +
              'litige directement auprès de nous par une réclamation écrite.',
          ),
          defs([{ term: 'Médiateur désigné', description: legalValue('LEGAL_MEDIATOR') }]),
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
  const trialDays = maintenanceTrialDays();
  const company = legalValue('LEGAL_COMPANY_NAME');

  return {
    slug: 'cgv',
    title: 'Conditions générales de vente',
    description:
      'Commande, prix, paiement, réalisation, maintenance annuelle, résiliation, réversibilité, ' +
      'paiements sur votre site, responsabilité : les règles qui s’appliquent aux prestations ' +
      'StaX.',
    version: TERMS_VERSION,
    updatedAt: UPDATED_AT,
    intro:
      'Les présentes conditions régissent la vente des prestations de création, d’hébergement ' +
      'et de maintenance de sites internet proposées sous la marque StaX. Elles sont acceptées ' +
      'lors de la commande ; la version acceptée est conservée avec sa date et son numéro.',
    articles: [
      {
        id: 'objet',
        title: 'Article 1 — Objet et champ d’application',
        blocks: [
          p(
            'Les présentes conditions générales de vente (les « CGV ») définissent les droits et ' +
              `obligations de ${company} (le « Prestataire »), qui exerce sous la marque StaX, et ` +
              'de toute personne qui commande l’une de ses prestations (le « Client »).',
          ),
          p(
            'Elles prévalent sur tout autre document du Client, notamment ses conditions ' +
              'générales d’achat, sauf accord écrit et contraire du Prestataire.',
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
              'commande, le Client déclare agir en l’une de ces qualités.',
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
                'Le site internet réalisé pour le Client, hébergé et maintenu par le Prestataire.',
            },
            {
              term: 'Espace client',
              description:
                'L’interface en ligne mise à disposition du Client pour modifier son Site, suivre ' +
                'son projet et gérer son abonnement, ses données et ses paiements.',
            },
            {
              term: 'Création',
              description:
                'La conception, la réalisation et la mise en ligne du Site, réglées par un ' +
                'paiement unique à la commande.',
            },
            {
              term: 'Maintenance',
              description:
                'L’abonnement annuel couvrant l’hébergement, le certificat de sécurité, les ' +
                'sauvegardes, les mises à jour de sécurité, la surveillance, le support et, le cas ' +
                'échéant, le renouvellement du nom de domaine acheté par le Prestataire pour le ' +
                'compte du Client.',
            },
            {
              term: 'Offre',
              description:
                'La formule choisie par le Client (Essentiel, Premium, Ultra Premium ou devis ' +
                'sur mesure), dont le contenu est décrit sur la page des tarifs au jour de la ' +
                'commande.',
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
            'le récapitulatif de commande (offre, prix, options, adresse du Site) ;',
            'les présentes CGV ;',
            'l’accord de traitement des données personnelles (article 28 du RGPD), qui en fait ' +
              'partie intégrante ;',
            'les conditions générales d’utilisation de la plateforme.',
          ]),
          p(
            'Le Client peut consulter, télécharger et imprimer ces documents à tout moment depuis ' +
              'le site et son Espace client.',
          ),
        ],
      },
      {
        id: 'commande',
        title: 'Article 5 — Commande',
        blocks: [
          p(
            'La commande est passée en ligne. Le Client choisit une Offre et son métier, renseigne ' +
              'les informations relatives à son activité, vérifie le récapitulatif (prix hors taxes, ' +
              'TVA et total toutes taxes comprises), accepte les présentes CGV et l’accord de ' +
              'traitement des données, puis procède au paiement.',
          ),
          p(
            'Le contrat est formé à la confirmation du paiement par le prestataire de paiement. ' +
              'Le Client reçoit alors une confirmation par e-mail reprenant les éléments ' +
              'essentiels de sa commande. L’acceptation des CGV est horodatée et conservée avec le ' +
              'numéro de version du texte accepté, à titre de preuve.',
          ),
          p(
            'Le Client s’engage à fournir des informations exactes et à jour, et garantit disposer ' +
              'des droits nécessaires sur les contenus qu’il transmet (textes, photographies, ' +
              'logos, marques).',
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
            'un abonnement annuel de Maintenance, dont le montant est indiqué par an.',
          ]),
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
              'virement, selon les modalités indiquées sur la facture.',
          ),
          p(
            'La Création est payée à la commande. La Maintenance est payée d’avance, pour chaque ' +
              `période annuelle. La première période commence à la mise en ligne du Site, et au ` +
              `plus tard ${trialDays} jours après la commande ; les périodes suivantes sont ` +
              'prélevées à leur date anniversaire sur le moyen de paiement enregistré.',
          ),
          p(
            'Une facture conforme à la réglementation est émise pour chaque paiement et reste ' +
              'téléchargeable depuis l’Espace client.',
          ),
          p(
            'En cas de retard de paiement, et après une relance restée sans effet, sont exigibles de ' +
              'plein droit, conformément à l’article L.441-10 du Code de commerce : des pénalités de ' +
              'retard calculées au taux d’intérêt appliqué par la Banque centrale européenne à son ' +
              'opération de refinancement la plus récente majoré de dix points, et une indemnité ' +
              'forfaitaire pour frais de recouvrement de 40 euros. Aucun escompte n’est accordé ' +
              'pour paiement anticipé.',
          ),
          note(
            'Les pénalités de retard et l’indemnité forfaitaire ne s’appliquent pas au Client non ' +
              'professionnel, qui reste redevable des seuls intérêts au taux légal.',
          ),
        ],
      },
      {
        id: 'realisation',
        title: 'Article 8 — Réalisation, validation et mise en ligne',
        blocks: [
          p(
            'Le Prestataire réalise le Site à partir des informations et des éléments fournis par ' +
              'le Client. Le Client dispose d’un aperçu privé lui permettant de relire l’ensemble du ' +
              'Site avant sa mise en ligne, et demande ses corrections depuis son Espace client.',
          ),
          p(
            `Le Prestataire livre une première version du Site dans un délai de ${delivery.label} ` +
              'à compter de la réception de l’ensemble des éléments nécessaires à sa réalisation ' +
              '(contenus, photographies, identité visuelle, accès éventuels). Ce point de départ est ' +
              'notifié au Client dans son Espace client.',
          ),
          p(
            'La mise en ligne intervient après la validation explicite du Client, qui vaut ' +
              'réception de la Création. Le Client peut ensuite modifier lui-même ses contenus à ' +
              'tout moment depuis son Espace client.',
          ),
          note(
            'Le délai ne court pas tant que les éléments demandés n’ont pas été transmis, et les ' +
              'allers-retours de correction demandés après la première version décalent la mise ' +
              'en ligne d’autant. En cas de retard imputable au seul Prestataire, le Client peut, ' +
              'après une mise en demeure restée sans effet pendant quinze jours, résoudre la ' +
              'commande et obtenir le remboursement de la Création.',
          ),
        ],
      },
      {
        id: 'maintenance',
        title: 'Article 9 — Maintenance annuelle : durée et reconduction',
        blocks: [
          p(
            'La Maintenance est conclue pour une durée d’un an à compter du début de la première ' +
              'période. Elle se reconduit tacitement par périodes successives d’un an, sauf ' +
              'résiliation dans les conditions de l’article 10.',
          ),
          p(
            'Le Prestataire rappelle au Client, par e-mail, au plus tôt trois mois et au plus tard ' +
              'un mois avant le terme de chaque période, la date de reconduction et la faculté de ' +
              'ne pas reconduire le contrat.',
          ),
          p('La Maintenance comprend :'),
          list([
            'l’hébergement du Site et la mise à disposition de l’Espace client ;',
            'le certificat de sécurité (HTTPS) et son renouvellement automatique ;',
            'les sauvegardes régulières et la surveillance du service ;',
            'les mises à jour de sécurité de la plateforme ;',
            'le support relatif à l’utilisation du Site et de l’Espace client ;',
            'le renouvellement du nom de domaine acheté par le Prestataire pour le compte du ' +
              'Client, le cas échéant.',
          ]),
          p(
            'Elle ne comprend pas les évolutions fonctionnelles majeures, les refontes graphiques ' +
              'complètes ni la production de contenus rédactionnels ou photographiques, qui font ' +
              'l’objet d’un devis distinct.',
          ),
          note(
            'Le Client non professionnel qui n’aurait pas reçu ce rappel peut mettre fin au contrat ' +
              'gratuitement, à tout moment à compter de la date de reconduction, et obtenir le ' +
              'remboursement des sommes versées pour la période postérieure à la résiliation ' +
              '(articles L.215-1 et L.215-3 du Code de la consommation).',
          ),
        ],
      },
      {
        id: 'resiliation',
        title: 'Article 10 — Résiliation',
        blocks: [
          p(
            'Le Client peut résilier sa Maintenance à tout moment, en ligne, depuis son Espace ' +
              'client (« Résilier votre contrat »), sans avoir à se justifier. La résiliation prend ' +
              'effet au terme de la période annuelle en cours ; les sommes déjà réglées pour cette ' +
              'période restent acquises, sous réserve de la garantie commerciale de l’article 16. ' +
              'Le Client reçoit par e-mail une confirmation indiquant la date à laquelle le contrat ' +
              'prend fin et ses effets.',
          ),
          p(
            'Le Prestataire peut résilier le contrat en cas de défaut de paiement persistant, ou ' +
              'de manquement grave du Client aux présentes CGV ou à la loi, après une mise en ' +
              'demeure restée sans effet pendant quinze jours, sans préjudice de la suspension ' +
              'prévue à l’article 17.',
          ),
          p(
            `À l’issue de la dernière période payée, le Site demeure accessible pendant une ` +
              `période de continuité de ${maintenance.gracePeriodDays} jours. Il est ensuite ` +
              `suspendu : il n’est plus accessible au public, mais les données du Client ne sont ni ` +
              `supprimées ni altérées pendant ${maintenance.suspensionRetentionDays} jours, puis ` +
              `sont archivées ${maintenance.archiveRetentionDays} jours, période pendant laquelle ` +
              'le Client peut les exporter ou réactiver son abonnement.',
          ),
        ],
      },
      {
        id: 'reversibilite',
        title: 'Article 11 — Réversibilité : ce que le Client emporte',
        blocks: [
          p('À tout moment, et sans frais, le Client peut :'),
          list([
            'exporter ses données depuis son Espace client, dans des formats ouverts et lisibles ' +
              'par un tableur (messages, contacts, réservations, commandes, comptes clients) ;',
            'récupérer ses contenus : textes, photographies et documents qu’il a fournis ou qui ' +
              'lui ont été cédés ;',
            'obtenir le code de transfert de son nom de domaine, sur simple demande ;',
            'conserver son compte de paiement Stripe, ouvert à son nom, indépendamment de StaX.',
          ]),
          p(
            'La plateforme logicielle, ses modèles et ses composants restent la propriété du ' +
              'Prestataire : leur usage prend fin avec le contrat.',
          ),
        ],
      },
      {
        id: 'domaine',
        title: 'Article 12 — Nom de domaine',
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
              'tiers, notamment à une marque ou à une dénomination sociale.',
          ),
        ],
      },
      {
        id: 'paiements-site',
        title: 'Article 13 — Paiements encaissés sur le Site du Client',
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
        title: 'Article 14 — Obligations du Client, éditeur de son Site',
        blocks: [
          p(
            'Le Client est l’éditeur de son Site et le responsable de son contenu. Il lui ' +
              'appartient notamment :',
          ),
          list([
            'de renseigner les informations permettant d’établir les mentions légales de son Site ' +
              '(identité, immatriculation, directeur de la publication), que la plateforme met en ' +
              'forme automatiquement ;',
            'de s’assurer que les contenus publiés sont licites et qu’il dispose des droits ' +
              'nécessaires ;',
            'lorsqu’il vend en ligne, de publier ses propres conditions générales de vente, dont ' +
              'la plateforme propose un modèle à adapter, et de respecter les règles applicables ' +
              'à ses clients ;',
            'de respecter la réglementation relative aux données personnelles de ses visiteurs, ' +
              'dont il est responsable du traitement, avec l’aide des outils fournis.',
          ]),
        ],
      },
      {
        id: 'propriete-cgv',
        title: 'Article 15 — Propriété intellectuelle',
        blocks: [
          p(
            'Les contenus fournis par le Client demeurent sa propriété exclusive. Il concède au ' +
              'Prestataire, pour la durée du contrat et pour le monde entier, le droit non exclusif ' +
              'de les reproduire et de les représenter aux seules fins de l’hébergement et de ' +
              'l’affichage du Site.',
          ),
          p(
            'Les textes et visuels créés spécifiquement pour le Client par le Prestataire lui sont ' +
              'cédés, dès le paiement intégral de la Création, à titre exclusif, pour le monde ' +
              'entier et pour toute la durée des droits d’auteur, pour tous usages de ' +
              'reproduction, de représentation et d’adaptation, sur tout support.',
          ),
          p(
            'La plateforme, ses logiciels, ses modèles de pages et ses composants génériques ' +
              'restent la propriété du Prestataire. Le contrat confère au Client un droit d’usage ' +
              'personnel et non exclusif, pour sa durée.',
          ),
        ],
      },
      {
        id: 'garantie',
        title: 'Article 16 — Garantie commerciale de satisfaction',
        blocks: [
          p(
            `Le Prestataire accorde une garantie commerciale de ${refund.windowDays} jours à ` +
              'compter de la mise en ligne initiale du Site. Pendant cette période, le Client ' +
              'insatisfait peut demander, sans justification, le remboursement de la Création et de ' +
              'la Maintenance déjà prélevée, selon la politique de remboursement.',
          ),
          p(
            'Lorsqu’un nom de domaine a effectivement été acheté pour le compte du Client, un ' +
              `montant forfaitaire de ${formatRefundDeduction(refund.domainDeductionCents)} est ` +
              'déduit du remboursement, ce coût étant définitivement engagé ; le nom de domaine ' +
              'reste acquis au Client. Aucune déduction n’est appliquée si aucun achat n’a eu lieu.',
          ),
          note(
            'Cette garantie est une faveur commerciale. Elle s’ajoute aux droits que le Client ' +
              'tient de la loi et ne s’y substitue en aucun cas.',
          ),
        ],
      },
      {
        id: 'suspension-cgv',
        title: 'Article 17 — Suspension',
        blocks: [
          p(
            'Le Prestataire peut suspendre l’accès au Site ou à un contenu, en informant le Client ' +
              'et en motivant sa décision, lorsque cela est nécessaire pour faire cesser un contenu ' +
              'manifestement illicite, pour préserver la sécurité de la plateforme ou d’autres ' +
              'clients, ou en cas de défaut de paiement persistant après relance.',
          ),
          p(
            'La suspension n’emporte pas suppression des données, qui restent exportables. Elle ' +
              'prend fin dès que sa cause a disparu.',
          ),
        ],
      },
      {
        id: 'donnees',
        title: 'Article 18 — Données personnelles',
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
        title: 'Article 19 — Responsabilité',
        blocks: [
          p(
            'Le Prestataire est tenu à une obligation de moyens. Il met en œuvre les moyens ' +
              'conformes aux règles de l’art pour assurer la disponibilité, la sécurité et la ' +
              'sauvegarde du Site. Aucun engagement chiffré de disponibilité n’est pris tant ' +
              'qu’il n’est pas mesuré et vérifiable.',
          ),
          p(
            'Il ne saurait être tenu responsable des conséquences d’informations inexactes ou de ' +
              'contenus fournis par le Client, d’un usage non conforme de l’Espace client, ni de la ' +
              'défaillance d’un tiers indépendant de sa volonté, notamment un opérateur de réseau, ' +
              'un bureau d’enregistrement de noms de domaine ou le prestataire de paiement du Client.',
          ),
          p(
            'Lorsque le Client est un professionnel, la responsabilité du Prestataire, toutes ' +
              'causes confondues, est limitée aux dommages directs et prévisibles, dans la limite ' +
              'des sommes payées par le Client au titre du contrat au cours des douze mois ' +
              'précédant le fait générateur. Cette limitation ne s’applique ni en cas de faute ' +
              'lourde ou dolosive, ni aux dommages corporels, ni au Client non professionnel.',
          ),
        ],
      },
      {
        id: 'force-majeure',
        title: 'Article 20 — Force majeure',
        blocks: [
          p(
            'Aucune partie n’est responsable d’un manquement causé par un événement de force ' +
              'majeure au sens de l’article 1218 du Code civil. Si l’empêchement dure plus de ' +
              'trente jours, chaque partie peut résilier le contrat par écrit, sans indemnité ; les ' +
              'sommes versées pour une période non exécutée sont alors remboursées.',
          ),
        ],
      },
      {
        id: 'retractation',
        title: 'Article 21 — Droit de rétractation',
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
        title: 'Article 22 — Évolution des CGV',
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
        title: 'Article 23 — Preuve et archivage',
        blocks: [
          p(
            'Les enregistrements électroniques conservés par le Prestataire dans des conditions ' +
              'raisonnables de sécurité (horodatage de l’acceptation des CGV, journal des ' +
              'opérations, confirmations de paiement) font foi entre les parties, sauf preuve ' +
              'contraire. Les commandes et factures sont archivées pendant dix ans.',
          ),
        ],
      },
      {
        id: 'divers',
        title: 'Article 24 — Dispositions générales',
        blocks: [
          list([
            'le fait de ne pas se prévaloir d’une stipulation n’emporte pas renonciation à s’en ' +
              'prévaloir ultérieurement ;',
            'la nullité d’une stipulation n’affecte pas les autres, qui restent applicables ;',
            'le Client ne peut céder le contrat sans l’accord préalable du Prestataire.',
          ]),
        ],
      },
      {
        id: 'droit',
        title: 'Article 25 — Droit applicable et litiges',
        blocks: [
          p(
            'Les présentes CGV sont soumises au droit français. En cas de difficulté, les parties ' +
              'rechercheront une solution amiable : le Client adresse sa réclamation par écrit au ' +
              'support, qui y répond dans un délai d’un mois.',
          ),
          p(
            'À défaut d’accord, et lorsque les deux parties ont la qualité de commerçant, tout ' +
              'litige relève de la compétence exclusive des juridictions du ressort du siège social ' +
              'du Prestataire. Dans les autres cas, les règles de compétence de droit commun ' +
              's’appliquent.',
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
      'Les engagements de StaX lorsqu’elle traite, pour votre compte, les données collectées sur ' +
      'votre site : l’accord de sous-traitance exigé par l’article 28 du RGPD.',
    version: DPA_VERSION,
    updatedAt: UPDATED_AT,
    intro:
      'Cet accord fait partie intégrante des conditions générales de vente. Il est accepté lors de ' +
      'la commande et s’applique pendant toute la durée du contrat, puis jusqu’à la suppression ' +
      'des données.',
    articles: [
      {
        id: 'parties-dpa',
        title: 'Article 1 — Rôles',
        blocks: [
          p(
            'Pour les données personnelles collectées sur son Site, le Client agit en qualité de ' +
              `responsable de traitement et ${company}, sous la marque StaX, en qualité de ` +
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
              'plus une fois par an, par un auditeur indépendant tenu au secret, moyennant un ' +
              'préavis de trente jours et sans accès aux données des autres clients.',
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
    ],
  };
}

/* -------------------------------------------------------------------------- */
/*  Conditions générales d'utilisation                                         */
/* -------------------------------------------------------------------------- */

export function buildTermsOfUse(): LegalDocument {
  return {
    slug: 'cgu',
    title: 'Conditions générales d’utilisation',
    description:
      'Règles d’utilisation de la plateforme StaX, de l’espace client et des sites publiés : ' +
      'compte, sécurité, contenus autorisés, modération, disponibilité et suspension.',
    version: TERMS_OF_USE_VERSION,
    updatedAt: UPDATED_AT,
    intro:
      'Les présentes conditions régissent l’utilisation de la plateforme. Elles complètent les ' +
      'conditions générales de vente, qui régissent quant à elles la relation commerciale.',
    articles: [
      {
        id: 'objet-cgu',
        title: 'Article 1 — Objet et acceptation',
        blocks: [
          p(
            'Les présentes conditions générales d’utilisation définissent les règles d’accès et ' +
              'd’usage de la plateforme, de l’espace client et des sites qu’elle publie.',
          ),
          p(
            'La création d’un compte ou l’utilisation de l’espace client vaut acceptation des ' +
              'présentes conditions dans leur version en vigueur.',
          ),
        ],
      },
      {
        id: 'compte',
        title: 'Article 2 — Compte et sécurité',
        blocks: [
          p(
            'L’accès à l’espace client nécessite un compte nominatif. L’Utilisateur est ' +
              'responsable de la confidentialité de ses identifiants et de toute action réalisée ' +
              'depuis son compte.',
          ),
          list([
            'un compte est personnel : il ne doit pas être partagé entre plusieurs personnes ;',
            'plusieurs personnes peuvent être invitées sur un même espace, chacune avec son ' +
              'propre compte et son propre niveau d’accès ;',
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
        title: 'Article 3 — Usage conforme',
        blocks: [
          p('L’Utilisateur s’interdit notamment :'),
          list([
            'de tenter d’accéder aux données d’un autre client, ou de contourner les ' +
              'mécanismes d’isolation et de contrôle d’accès ;',
            'd’injecter du code exécutable, des scripts ou des cadres tiers non autorisés dans ' +
              'les contenus publiés ;',
            'de soumettre la plateforme à des tests de charge, à un balayage automatisé ou à ' +
              'toute sollicitation anormale sans autorisation écrite préalable ;',
            'd’utiliser le service pour diffuser des contenus illicites, contrefaisants, ' +
              'trompeurs, haineux, ou portant atteinte à la vie privée ou aux droits d’autrui ;',
            'de revendre l’accès à la plateforme sans accord exprès.',
          ]),
          p(
            'Les recherches de sécurité menées de bonne foi sont bienvenues et doivent être ' +
              'signalées de manière responsable à l’adresse de contact indiquée dans les mentions ' +
              'légales, avant toute divulgation publique.',
          ),
        ],
      },
      {
        id: 'contenus-utilisateur',
        title: 'Article 4 — Contenus publiés par l’Utilisateur',
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
        title: 'Article 5 — Modération des contenus',
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
              'personne ;',
            'l’auteur du signalement est informé de la suite donnée.',
          ]),
          note(
            'Un signalement que son auteur sait inexact, présenté dans le but d’obtenir un retrait, ' +
              'engage sa responsabilité et peut constituer un délit.',
          ),
        ],
      },
      {
        id: 'disponibilite',
        title: 'Article 6 — Disponibilité et maintenance technique',
        blocks: [
          p(
            'Le service est fourni en continu, sous réserve des opérations de maintenance et des ' +
              'événements indépendants de la volonté du Prestataire.',
          ),
          p(
            'Les interventions programmées susceptibles d’affecter la disponibilité sont ' +
              'annoncées à l’avance dans l’espace client lorsque cela est possible.',
          ),
          note(
            'Aucun engagement chiffré de disponibilité n’est publié tant qu’il n’est pas mesuré ' +
              'et vérifiable. L’état du service est consultable publiquement sur la page dédiée.',
          ),
        ],
      },
      {
        id: 'suspension',
        title: 'Article 7 — Suspension et résiliation de l’accès',
        blocks: [
          p(
            'Le Prestataire peut suspendre un accès en cas de manquement grave aux présentes ' +
              'conditions, d’atteinte à la sécurité de la plateforme ou de défaut de paiement ' +
              'persistant, après information motivée de l’Utilisateur, sauf urgence caractérisée.',
          ),
          p(
            'La suspension d’un accès n’emporte pas suppression des données : celles-ci ' +
              'demeurent conservées et exportables dans les conditions prévues par la politique ' +
              'de conservation.',
          ),
        ],
      },
      {
        id: 'propriete-plateforme',
        title: 'Article 8 — Propriété de la plateforme',
        blocks: [
          p(
            'La plateforme, son interface, ses composants techniques et sa documentation ' +
              'demeurent la propriété du Prestataire. L’abonnement confère un droit d’usage ' +
              'personnel et non exclusif, et n’emporte aucune cession de droits.',
          ),
        ],
      },
      {
        id: 'evolution-cgu',
        title: 'Article 9 — Évolution des conditions',
        blocks: [
          p(
            'Les présentes conditions peuvent évoluer. Les Utilisateurs sont informés des ' +
              'modifications substantielles dans leur espace, au moins trente jours avant leur ' +
              'entrée en vigueur, et la version applicable est identifiée par son numéro et sa date.',
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
      'Cette politique décrit le traitement des données personnelles des visiteurs et des ' +
      'clients de StaX. Le traitement des données collectées sur les sites de nos clients est ' +
      'décrit à l’article 9.',
    articles: [
      {
        id: 'responsable',
        title: 'Article 1 — Responsable du traitement',
        blocks: [
          p(
            `Le responsable du traitement est ${company}, dont les coordonnées complètes figurent ` +
              'dans les mentions légales.',
          ),
          p(`Contact pour toute question relative aux données personnelles : ${dpo}.`),
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
                'Adresse e-mail, nom, prénom, rôle dans l’organisation, préférences de langue ' +
                'et d’affichage, état de l’authentification à double facteur.',
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
                'professionnelles, horaires, prestations, textes et photographies fournis.',
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
            {
              term: 'Mesure d’audience',
              description:
                'Compteurs agrégés de pages vues, sans cookie, sans identifiant persistant et ' +
                'sans profilage individuel.',
            },
          ]),
          note(
            'Aucune donnée sensible au sens de l’article 9 du RGPD n’est demandée. Nous ' +
              'recommandons de ne pas en transmettre via les formulaires de contact.',
          ),
        ],
      },
      {
        id: 'finalites',
        title: 'Article 3 — Finalités et bases légales',
        blocks: [
          list([
            'Fourniture du service, création et maintenance du site, accès à l’espace client — ' +
              'exécution du contrat (article 6.1.b du RGPD).',
            'Facturation, recouvrement et obligations comptables — obligation légale ' +
              '(article 6.1.c).',
            'Traitement des signalements de contenus illicites — obligation légale ' +
              '(article 6.1.c ; règlement sur les services numériques).',
            'Sécurité de la plateforme, prévention de la fraude, journaux d’audit — intérêt ' +
              'légitime (article 6.1.f).',
            'Mesure d’audience agrégée et sans cookie — intérêt légitime (article 6.1.f).',
            'Réponse aux demandes de contact et aux devis — mesures précontractuelles ' +
              '(article 6.1.b).',
            'Rappels liés à votre abonnement (échéance, reconduction) — exécution du contrat et ' +
              'obligation légale.',
            'Communications commerciales adressées à des personnes n’étant pas encore clientes — ' +
              'consentement (article 6.1.a), révocable à tout moment.',
          ]),
        ],
      },
      {
        id: 'durees',
        title: 'Article 4 — Durées de conservation',
        blocks: [
          list([
            'Données de compte et de projet : pendant la durée du contrat, puis ' +
              `${maintenance.archiveRetentionDays} jours d’archivage permettant une réactivation ` +
              'ou un export.',
            `Site suspendu faute de maintenance : conservé ${maintenance.suspensionRetentionDays} ` +
              'jours avant archivage, sans suppression automatique des contenus.',
            `Documents comptables et factures : ${maintenance.financialRetentionYears} ans, ` +
              'durée imposée par le Code de commerce.',
            'Journaux de sécurité et journaux techniques : douze mois ; journal d’audit des ' +
              'actions sensibles : trois ans.',
            'Statistiques de visite : trente jours pour les événements unitaires, vingt-cinq mois ' +
              'pour les agrégats.',
            'Signalements de contenus : un an après la clôture de leur traitement.',
            'Demandes de contact et de devis restées sans suite : trois ans à compter du dernier ' +
              'échange.',
          ]),
          p(
            'À l’expiration de ces durées, les données sont supprimées ou anonymisées de manière ' +
              'irréversible.',
          ),
        ],
      },
      {
        id: 'destinataires',
        title: 'Article 5 — Destinataires et sous-traitants',
        blocks: [
          p(
            'Les données ne sont ni vendues, ni louées, ni cédées à des tiers à des fins ' +
              'publicitaires.',
          ),
          p(
            'Elles sont accessibles au personnel habilité et aux sous-traitants techniques ' +
              'strictement nécessaires au fonctionnement du service : hébergement, base de ' +
              'données, envoi des e-mails transactionnels. La liste complète et à jour de ces ' +
              'sous-traitants est publiée et accessible publiquement.',
          ),
          p(
            'Les paiements sont traités par Stripe, qui agit en qualité de responsable de ' +
              'traitement distinct pour l’exécution des paiements et la lutte contre la fraude, ' +
              'conformément à sa propre politique de confidentialité.',
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
        title: 'Article 6 — Transferts hors Union européenne',
        blocks: [
          p(
            'Les données applicatives sont hébergées dans une région européenne. Certains ' +
              'prestataires, notamment pour la diffusion des pages et l’envoi des e-mails, sont ' +
              'des sociétés établies hors de l’Union européenne.',
          ),
          p(
            'Ces transferts sont encadrés par une décision d’adéquation de la Commission ' +
              'européenne (notamment le cadre de protection des données UE–États-Unis pour les ' +
              'sociétés certifiées) ou par ses clauses contractuelles types. Les garanties ' +
              'applicables à chaque prestataire sont indiquées sur la page des sous-traitants.',
          ),
        ],
      },
      {
        id: 'droits',
        title: 'Article 7 — Vos droits',
        blocks: [
          p('Vous disposez des droits suivants :'),
          list([
            'droit d’accès à vos données et d’obtention d’une copie ;',
            'droit de rectification des données inexactes ;',
            'droit à l’effacement, dans les limites des obligations légales de conservation ;',
            'droit à la limitation et droit d’opposition, notamment aux traitements fondés sur ' +
              'l’intérêt légitime et, sans justification, à la prospection commerciale ;',
            'droit à la portabilité de vos données, dans un format structuré et lisible par ' +
              'machine ;',
            'droit de retirer votre consentement à tout moment, lorsque le traitement repose ' +
              'sur celui-ci ;',
            'droit de définir des directives relatives au sort de vos données après votre décès.',
          ]),
          p(
            'L’export de vos contenus, messages et contacts est disponible en libre-service ' +
              `depuis votre espace. Pour toute autre demande, écrivez à ${dpo}. Une réponse est ` +
              'apportée dans un délai d’un mois, prolongeable de deux mois pour les demandes ' +
              'complexes.',
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
        title: 'Article 8 — Cookies',
        blocks: [
          p(
            'Le site public est consultable sans cookie de suivi. Les seuls cookies utilisés sont ' +
              'strictement nécessaires (session, sécurité des formulaires, commande en cours). Le ' +
              'détail figure dans la politique relative aux cookies.',
          ),
        ],
      },
      {
        id: 'sites-clients',
        title: 'Article 9 — Données collectées sur les sites de nos clients',
        blocks: [
          p(
            'Lorsqu’un visiteur remplit un formulaire, réserve un créneau, crée un compte ou passe ' +
              'commande sur le site d’un client StaX, le responsable du traitement est ce client, ' +
              'et non StaX. La politique de confidentialité de son site l’identifie.',
          ),
          p(
            'StaX intervient alors en qualité de sous-traitant au sens de l’article 28 du RGPD : ' +
              'nous hébergeons et traitons ces données sur instruction du client, sans les ' +
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
        title: 'Article 10 — Sécurité',
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
    ],
  };
}

/* -------------------------------------------------------------------------- */
/*  Politique de cookies                                                       */
/* -------------------------------------------------------------------------- */

export function buildCookiePolicy(): LegalDocument {
  return {
    slug: 'cookies',
    title: 'Cookies et traceurs',
    description:
      'Ce que StaX dépose sur votre appareil, pourquoi, et comment le contrôler. Aucun cookie ' +
      'publicitaire, aucun traceur tiers.',
    updatedAt: UPDATED_AT,
    intro:
      'Notre position est simple : nous ne déposons aucun cookie qui ne soit strictement ' +
      'nécessaire au fonctionnement du service. La mesure d’audience fonctionne sans cookie.',
    articles: [
      {
        id: 'principe-cookies',
        title: 'Article 1 — Principe',
        blocks: [
          p(
            'Le site public de StaX est consultable sans cookie de suivi. Les seuls cookies ' +
              'utilisés servent à maintenir une session ouverte, à conserver une commande en cours ' +
              'et à protéger les formulaires.',
          ),
          p(
            'Nous n’utilisons ni cookie publicitaire, ni bouton de réseau social traceur, ni ' +
              'outil d’analyse comportementale tiers. Les polices de caractères sont servies par ' +
              'nos propres serveurs : votre navigateur ne contacte aucun service tiers pour les ' +
              'afficher.',
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
                'Maintient votre connexion à l’espace client. Strictement nécessaire, exempté ' +
                'de consentement. Durée : la session, ou la durée de validité du jeton de ' +
                'rafraîchissement si vous choisissez de rester connecté.',
            },
            {
              term: 'Commande en cours',
              description:
                'Conserve les étapes de votre commande pendant que vous la remplissez. ' +
                'Strictement nécessaire au service que vous demandez, exempté de consentement.',
            },
            {
              term: 'Protection des formulaires',
              description:
                'Jeton anti-falsification de requête et vérification anti-robot, déposés lors ' +
                'de l’envoi d’un formulaire. Strictement nécessaires, exemptés de consentement.',
            },
            {
              term: 'Préférences',
              description:
                'Thème clair ou sombre, choix exprimé dans le bandeau de confidentialité, ' +
                'fermeture des bandeaux d’information. Stockés localement dans votre navigateur, ' +
                'jamais transmis à nos serveurs.',
            },
            {
              term: 'Mesure d’audience',
              description:
                'Comptage agrégé des pages vues, sans cookie, sans identifiant persistant et ' +
                'sans reconstitution de parcours individuel. Aucune adresse IP complète n’est ' +
                'conservée. Vous pouvez la refuser depuis le bandeau de confidentialité.',
            },
          ]),
        ],
      },
      {
        id: 'consentement-cookies',
        title: 'Article 3 — Consentement',
        blocks: [
          p(
            'Les cookies strictement nécessaires n’exigent pas de consentement, conformément à ' +
              'l’article 82 de la loi Informatique et Libertés et aux lignes directrices de la ' +
              'CNIL.',
          ),
          p(
            'Si un traceur soumis à consentement devait être introduit, un bandeau permettant de ' +
              'l’accepter ou de le refuser avec la même facilité serait affiché, et aucun dépôt ' +
              'n’aurait lieu avant un choix explicite. Le refus serait mémorisé au même titre ' +
              'que l’acceptation.',
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
              'l’espace client.',
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
            'Les sites publiés par StaX suivent la même règle : aucun traceur publicitaire n’est ' +
              'déposé, et les polices de caractères sont servies sans passer par un service tiers.',
          ),
          p(
            'Une vidéo ou une carte intégrée provenant d’un service tiers (par exemple YouTube, ' +
              'Vimeo ou Google Maps) n’est chargée qu’après un clic du visiteur, qui est informé au ' +
              'préalable que ce service peut déposer des traceurs. Rien n’est transmis à ce service ' +
              'tant que le visiteur n’a pas fait ce choix. Seules des intégrations approuvées sont ' +
              'autorisées.',
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
      `Garantie commerciale de ${refund.windowDays} jours après la mise en ligne : conditions, ` +
      'procédure, délais et déduction éventuelle du nom de domaine.',
    updatedAt: UPDATED_AT,
    intro:
      'Cette garantie commerciale est un engagement volontaire du Prestataire. Elle s’ajoute aux ' +
      'droits que vous tenez de la loi : elle ne les remplace ni ne les restreint en aucune ' +
      'manière.',
    articles: [
      {
        id: 'garantie',
        title: `Article 1 — Garantie de ${refund.windowDays} jours`,
        blocks: [
          p(
            `Vous disposez de ${refund.windowDays} jours calendaires à compter de la première ` +
              'mise en ligne de votre site pour demander le remboursement.',
          ),
          p(
            'Aucune justification n’est exigée. Nous vous demandons simplement, si vous le ' +
              'souhaitez, ce qui n’a pas convenu : c’est ainsi que le service progresse.',
          ),
        ],
      },
      {
        id: 'perimetre-remboursement',
        title: 'Article 2 — Ce qui est remboursé',
        blocks: [
          list([
            'le paiement de création effectivement réglé ;',
            'la maintenance annuelle déjà prélevée, en totalité ;',
          ]),
          p(
            'Le remboursement est effectué sur le moyen de paiement utilisé lors de la commande. ' +
              'Aucun autre moyen de remboursement ne peut être utilisé sans votre accord ' +
              'exprès. Le contrat prend fin à la date du remboursement.',
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
              'automatiquement à partir de la date réelle de mise en ligne ;',
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
        id: 'refus-remboursement',
        title: 'Article 5 — Cas de refus',
        blocks: [
          p('Une demande peut être refusée, avec un motif écrit, notamment lorsque :'),
          list([
            `le délai de ${refund.windowDays} jours après la mise en ligne est dépassé ;`,
            'la demande porte sur une prestation sur mesure déjà livrée et acceptée, régie par ' +
              'son propre devis ;',
            'un usage manifestement frauduleux est caractérisé.',
          ]),
          p('Un refus n’éteint aucun des droits que vous tenez de la loi ou du contrat.'),
        ],
      },
      {
        id: 'garanties-legales',
        title: 'Article 6 — Articulation avec vos droits',
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
              term: 'Vos données de client StaX',
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
            'La demande de suppression s’effectue depuis votre espace. Elle est confirmée par ' +
              'e-mail, puis exécutée après un délai de sécurité permettant d’annuler une demande ' +
              'accidentelle ou frauduleuse.',
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
      'Un contenu vous semble illicite sur un site hébergé par StaX ? Signalez-le : chaque ' +
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
      'Liste des prestataires techniques qui traitent des données pour le compte de StaX, leur ' +
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
            'contrastes de couleur vérifiés dans les thèmes clair et sombre ;',
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
