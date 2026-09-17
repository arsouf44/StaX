import {
  LEGAL_REVIEW_REQUIRED,
  legalValue,
  maintenancePolicyConfig,
  refundPolicyConfig,
} from '@stax/config';
import { formatMoney } from '@stax/payments';

/**
 * LEGAL_REVIEW_REQUIRED
 * ---------------------
 * Les textes ci-dessous sont des MODÈLES. Ils doivent être relus et validés
 * par un professionnel du droit avant toute ouverture commerciale. Rien ici ne
 * remplace ni ne restreint les protections d'ordre public du droit français et
 * européen de la consommation.
 *
 * Aucune valeur d'identité (dénomination, SIREN, siège, capital, directeur de
 * la publication, hébergeur) n'est écrite en dur : tout provient de la
 * configuration, et un champ non renseigné affiche un marqueur explicite.
 */
export const LEGAL_DOCUMENTS_REQUIRE_REVIEW = LEGAL_REVIEW_REQUIRED;

/** Version des CGV réellement acceptée par les clients, conservée en base. */
export const TERMS_VERSION = '2026-01';
export const PRIVACY_VERSION = '2026-01';
export const TERMS_OF_USE_VERSION = '2026-01';

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

export function buildLegalNotice(): LegalDocument {
  return {
    slug: 'mentions-legales',
    title: 'Mentions légales',
    description:
      'Identité de l’éditeur, hébergeur, propriété intellectuelle et responsabilité, ' +
      'conformément à la loi du 21 juin 2004 pour la confiance dans l’économie numérique.',
    updatedAt: '2026-01-01',
    articles: [
      {
        id: 'editeur',
        title: 'Éditeur du site',
        blocks: [
          p('Le présent site est édité par :'),
          {
            kind: 'definitions',
            definitions: [
              { term: 'Dénomination sociale', description: legalValue('LEGAL_COMPANY_NAME') },
              { term: 'Forme juridique', description: legalValue('LEGAL_FORM') },
              { term: 'Capital social', description: legalValue('LEGAL_CAPITAL') },
              { term: 'Siège social', description: legalValue('LEGAL_ADDRESS') },
              { term: 'SIREN / SIRET', description: legalValue('LEGAL_SIREN') },
              { term: 'RCS', description: legalValue('LEGAL_RCS') },
              { term: 'TVA intracommunautaire', description: legalValue('LEGAL_VAT') },
              { term: 'Directeur de la publication', description: legalValue('LEGAL_DIRECTOR') },
              { term: 'Contact', description: legalValue('SUPPORT_EMAIL') },
            ],
          },
        ],
      },
      {
        id: 'hebergeur',
        title: 'Hébergement',
        blocks: [
          p('Le site et les sites de nos clients sont hébergés par :'),
          {
            kind: 'definitions',
            definitions: [
              { term: 'Hébergeur', description: legalValue('LEGAL_HOST') },
              { term: 'Adresse', description: legalValue('LEGAL_HOST_ADDRESS') },
            ],
          },
          p(
            'Les données applicatives (contenus, messages, réservations, contacts) sont ' +
              'stockées dans une base de données PostgreSQL hébergée dans une région de l’Union ' +
              'européenne. La liste complète de nos sous-traitants est publiée sur la page ' +
              'dédiée.',
          ),
        ],
      },
      {
        id: 'propriete',
        title: 'Propriété intellectuelle',
        blocks: [
          p(
            'La structure du site, ses textes, son identité visuelle et les éléments logiciels ' +
              'qui le composent sont protégés par le droit de la propriété intellectuelle. Toute ' +
              'reproduction ou représentation, totale ou partielle, sans autorisation écrite ' +
              'préalable est interdite.',
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
              'conseil fiscal, ni un engagement contractuel.',
          ),
          p(
            'Conformément à l’article 6 de la loi du 21 juin 2004, StaX agit en qualité ' +
              'd’hébergeur pour les contenus publiés par ses clients sur leurs sites. Tout ' +
              'contenu manifestement illicite peut être signalé à l’adresse de contact ' +
              'ci-dessus, et sera traité dans les meilleurs délais.',
          ),
        ],
      },
      {
        id: 'mediation',
        title: 'Médiation de la consommation',
        blocks: [
          p(
            'Conformément à l’article L.612-1 du Code de la consommation, un consommateur a le ' +
              'droit de recourir gratuitement à un médiateur de la consommation en vue de la ' +
              'résolution amiable d’un litige l’opposant à un professionnel.',
          ),
          {
            kind: 'definitions',
            definitions: [{ term: 'Médiateur désigné', description: legalValue('LEGAL_MEDIATOR') }],
          },
          p(
            'La plateforme européenne de règlement en ligne des litiges est accessible à ' +
              'l’adresse ec.europa.eu/consumers/odr.',
          ),
        ],
      },
    ],
  };
}

export function buildTerms(): LegalDocument {
  const refund = refundPolicyConfig();
  const maintenance = maintenancePolicyConfig();

  return {
    slug: 'cgv',
    title: 'Conditions générales de vente',
    description:
      'Objet, commande, prix, paiement, livraison, maintenance, résiliation, garanties et ' +
      'responsabilité applicables aux prestations StaX.',
    version: TERMS_VERSION,
    updatedAt: '2026-01-01',
    intro:
      'Les présentes conditions régissent la vente des prestations de création, d’hébergement ' +
      'et de maintenance de sites internet proposées par StaX. Elles sont acceptées lors de la ' +
      'commande, et la version acceptée est conservée avec sa date.',
    articles: [
      {
        id: 'objet',
        title: 'Article 1 — Objet et définitions',
        blocks: [
          p(
            'Les présentes conditions définissent les droits et obligations des parties dans le ' +
              'cadre de la vente de prestations de création, d’hébergement et de maintenance de ' +
              'sites internet.',
          ),
          {
            kind: 'definitions',
            definitions: [
              {
                term: 'Prestataire',
                description: `${legalValue('LEGAL_COMPANY_NAME')}, éditeur de la plateforme StaX.`,
              },
              {
                term: 'Client',
                description:
                  'Toute personne physique ou morale passant commande. Les prestations s’adressent principalement à des professionnels agissant dans le cadre de leur activité.',
              },
              {
                term: 'Site',
                description:
                  'Le site internet créé pour le Client, hébergé et maintenu par le Prestataire.',
              },
              {
                term: 'Espace client',
                description:
                  'L’interface d’administration mise à disposition du Client pour gérer son Site.',
              },
              {
                term: 'Maintenance',
                description:
                  'L’abonnement mensuel couvrant l’hébergement, le nom de domaine le cas échéant, le certificat de sécurité, les sauvegardes, les mises à jour de sécurité, la surveillance et le support.',
              },
            ],
          },
        ],
      },
      {
        id: 'commande',
        title: 'Article 2 — Commande',
        blocks: [
          p(
            'La commande est passée en ligne. Le Client sélectionne une offre, renseigne les ' +
              'informations relatives à son activité, accepte les présentes conditions et procède ' +
              'au paiement. La commande n’est définitive qu’après confirmation du paiement par ' +
              'notre prestataire de paiement.',
          ),
          p(
            'L’acceptation des présentes conditions est horodatée et conservée avec le numéro ' +
              'de version du texte accepté, à titre de preuve.',
          ),
          p(
            'Le Client s’engage à fournir des informations exactes et à disposer des droits ' +
              'nécessaires sur les contenus qu’il transmet, notamment les textes, photographies, ' +
              'logos et marques.',
          ),
        ],
      },
      {
        id: 'prix',
        title: 'Article 3 — Prix et paiement',
        blocks: [
          p(
            'Les prix sont indiqués en euros hors taxes. La taxe sur la valeur ajoutée ' +
              'applicable est ajoutée au moment du paiement, au taux en vigueur.',
          ),
          p('La prestation comprend deux composantes distinctes, présentées séparément :'),
          list([
            'un paiement initial, couvrant la conception et la réalisation du Site ;',
            'un abonnement mensuel de maintenance, prélevé automatiquement.',
          ]),
          p(
            'Le prix de la maintenance est celui en vigueur au jour de la commande. Une ' +
              'évolution ultérieure du tarif public ne s’applique pas aux contrats en cours : le ' +
              'tarif du Client reste celui de sa commande, sauf accord exprès de sa part.',
          ),
          p(
            'Les paiements sont traités par un prestataire de services de paiement agréé. ' +
              'Aucune donnée de carte bancaire n’est collectée ni conservée par le Prestataire.',
          ),
        ],
      },
      {
        id: 'realisation',
        title: 'Article 4 — Réalisation et livraison',
        blocks: [
          p(
            'Le Prestataire réalise le Site à partir des informations et des éléments fournis ' +
              'par le Client. Le Client dispose d’un accès à un aperçu privé lui permettant de ' +
              'relire l’ensemble du Site avant sa mise en ligne.',
          ),
          p(
            'Le Client demande ses corrections depuis son espace. La mise en ligne intervient ' +
              'après sa validation explicite.',
          ),
          note(
            'Les délais communiqués sont indicatifs et dépendent directement de la rapidité avec ' +
              'laquelle le Client transmet les informations et éléments demandés.',
          ),
        ],
      },
      {
        id: 'maintenance',
        title: 'Article 5 — Maintenance et durée',
        blocks: [
          p(
            'L’abonnement de maintenance est conclu pour une durée indéterminée, sans engagement ' +
              'minimal, et se renouvelle par périodes mensuelles.',
          ),
          p('La maintenance comprend :'),
          list([
            'l’hébergement du Site et la mise à disposition de l’espace client ;',
            'le certificat de sécurité et son renouvellement automatique ;',
            'les sauvegardes régulières et la surveillance du service ;',
            'les mises à jour de sécurité de la plateforme ;',
            'le support relatif à l’utilisation du Site et de l’espace client.',
          ]),
          p(
            'Elle ne comprend pas les évolutions fonctionnelles majeures, les refontes ' +
              'graphiques complètes ni la production de contenus rédactionnels ou ' +
              'photographiques, qui font l’objet d’un devis distinct.',
          ),
        ],
      },
      {
        id: 'resiliation',
        title: 'Article 6 — Résiliation',
        blocks: [
          p(
            'Le Client peut résilier son abonnement de maintenance à tout moment depuis son ' +
              'espace. La résiliation prend effet à l’échéance de la période en cours ; les ' +
              'sommes déjà réglées pour la période entamée restent acquises au Prestataire.',
          ),
          p(
            `À l’issue de la période payée, le Site demeure accessible pendant une période de ` +
              `continuité de ${maintenance.gracePeriodDays} jours. Passé ce délai, le Site est ` +
              `suspendu : il n’est plus accessible au public, mais les données du Client ne sont ` +
              `ni supprimées ni altérées.`,
          ),
          p(
            `Les données sont conservées ${maintenance.suspensionRetentionDays} jours après la ` +
              `suspension, période pendant laquelle le Client peut les exporter ou réactiver son ` +
              `abonnement. Les pièces comptables sont conservées ` +
              `${maintenance.financialRetentionYears} ans conformément aux obligations légales.`,
          ),
          p(
            'Le Prestataire peut résilier le contrat en cas de défaut de paiement persistant ' +
              'après relance, ou en cas d’usage du service contraire à la loi ou aux présentes ' +
              'conditions, après mise en demeure restée sans effet.',
          ),
        ],
      },
      {
        id: 'garantie',
        title: 'Article 7 — Garantie commerciale de satisfaction',
        blocks: [
          p(
            `Le Prestataire accorde une garantie commerciale de ${refund.windowDays} jours à ` +
              `compter de la mise en ligne initiale du Site. Pendant cette période, le Client ` +
              `insatisfait peut demander le remboursement du paiement initial.`,
          ),
          p(
            `Lorsqu’un nom de domaine a effectivement été acheté par le Prestataire pour le ` +
              `compte du Client, le coût correspondant est déduit du remboursement, ce coût étant ` +
              `définitivement engagé. Cette déduction n’est appliquée que si un tel achat a ` +
              `réellement eu lieu, et sa preuve est conservée.`,
          ),
          note(
            'Cette garantie est une faveur commerciale. Elle s’ajoute aux garanties légales et ' +
              'ne s’y substitue en aucun cas, notamment la garantie légale de conformité et la ' +
              'garantie des vices cachés. Elle ne restreint aucun droit que la loi reconnaît au ' +
              'Client.',
          ),
        ],
      },
      {
        id: 'retractation',
        title: 'Article 8 — Droit de rétractation',
        blocks: [
          p(
            'Les prestations proposées s’adressent à des professionnels agissant dans le cadre ' +
              'de leur activité. Le droit de rétractation prévu aux articles L.221-18 et suivants ' +
              'du Code de la consommation bénéficie aux consommateurs et, dans les conditions de ' +
              'l’article L.221-3, à certains professionnels employant au plus cinq salariés et ' +
              'dont l’objet de la commande n’entre pas dans le champ de leur activité principale.',
          ),
          p(
            'Lorsque ce droit est applicable, le Client dispose de quatorze jours pour se ' +
              'rétracter. Si le Client demande expressément l’exécution de la prestation avant la ' +
              'fin de ce délai, il reste redevable du montant correspondant au service déjà ' +
              'fourni au jour de sa rétractation.',
          ),
          note(
            'Cet article traite d’un droit d’ordre public. Sa rédaction définitive doit être ' +
              'validée par un professionnel du droit au regard de la clientèle réellement visée.',
          ),
        ],
      },
      {
        id: 'donnees',
        title: 'Article 9 — Données et propriété des contenus',
        blocks: [
          p(
            'Les contenus fournis ou créés par le Client demeurent sa propriété exclusive. Le ' +
              'Client peut les exporter à tout moment depuis son espace, dans un format ' +
              'exploitable.',
          ),
          p(
            'Le Prestataire agit en qualité de sous-traitant au sens du règlement général sur ' +
              'la protection des données pour les données personnelles traitées pour le compte du ' +
              'Client. Les modalités figurent dans la politique de confidentialité et la page ' +
              'consacrée aux données personnelles.',
          ),
        ],
      },
      {
        id: 'responsabilite-cgv',
        title: 'Article 10 — Responsabilité',
        blocks: [
          p(
            'Le Prestataire est tenu à une obligation de moyens. Il met en œuvre les moyens ' +
              'raisonnables pour assurer la disponibilité et la sécurité du Site.',
          ),
          p(
            'Le Prestataire ne saurait être tenu responsable des conséquences d’informations ' +
              'inexactes fournies par le Client, d’un usage non conforme de l’espace client, ni ' +
              'de la défaillance d’un tiers indépendant de sa volonté, notamment un opérateur ' +
              'réseau ou un bureau d’enregistrement de noms de domaine.',
          ),
          note(
            'Les clauses limitatives de responsabilité doivent être rédigées avec prudence : une ' +
              'clause qui viderait de sa substance l’obligation essentielle du contrat serait ' +
              'réputée non écrite (article 1170 du Code civil).',
          ),
        ],
      },
      {
        id: 'droit',
        title: 'Article 11 — Droit applicable et litiges',
        blocks: [
          p(
            'Les présentes conditions sont soumises au droit français. En cas de litige, les ' +
              'parties rechercheront une solution amiable avant toute action judiciaire.',
          ),
          p(
            'Un Client consommateur peut recourir gratuitement au médiateur de la consommation ' +
              'désigné dans les mentions légales.',
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
  return {
    slug: 'cgu',
    title: 'Conditions générales d’utilisation',
    description:
      'Règles d’utilisation de la plateforme StaX, de l’espace client et des sites publiés : ' +
      'compte, sécurité, contenus autorisés, disponibilité et suspension.',
    version: TERMS_OF_USE_VERSION,
    updatedAt: '2026-01-01',
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
              'trompeurs, haineux ou portant atteinte à la vie privée d’autrui ;',
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
          p(
            'Le Prestataire n’exerce pas de contrôle éditorial a priori sur les contenus ' +
              'publiés. Il peut retirer un contenu manifestement illicite qui lui serait signalé, ' +
              'dans les conditions prévues par la loi.',
          ),
        ],
      },
      {
        id: 'disponibilite',
        title: 'Article 5 — Disponibilité et maintenance technique',
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
        title: 'Article 6 — Suspension et résiliation de l’accès',
        blocks: [
          p(
            'Le Prestataire peut suspendre un accès en cas de manquement grave aux présentes ' +
              'conditions, d’atteinte à la sécurité de la plateforme ou de défaut de paiement ' +
              'persistant, après information de l’Utilisateur sauf urgence caractérisée.',
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
        title: 'Article 7 — Propriété de la plateforme',
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
        title: 'Article 8 — Évolution des conditions',
        blocks: [
          p(
            'Les présentes conditions peuvent évoluer. Les Utilisateurs sont informés des ' +
              'modifications substantielles dans leur espace, et la version applicable est ' +
              'identifiée par son numéro et sa date.',
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
    updatedAt: '2026-01-01',
    intro:
      'Cette politique décrit le traitement des données personnelles des visiteurs et des ' +
      'clients de StaX. Le traitement des données collectées sur les sites de nos clients est ' +
      'décrit à l’article 8.',
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
          {
            kind: 'definitions',
            definitions: [
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
                term: 'Données techniques',
                description:
                  'Journaux de connexion (date, adresse IP tronquée, agent utilisateur) ' +
                  'conservés à des fins de sécurité, et journaux d’audit des actions sensibles ' +
                  'réalisées dans l’espace client.',
              },
              {
                term: 'Mesure d’audience',
                description:
                  'Compteurs agrégés de pages vues, sans cookie, sans identifiant persistant et ' +
                  'sans profilage individuel.',
              },
            ],
          },
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
            'Sécurité de la plateforme, prévention de la fraude, journaux d’audit — intérêt ' +
              'légitime (article 6.1.f).',
            'Mesure d’audience agrégée et sans cookie — intérêt légitime (article 6.1.f).',
            'Réponse aux demandes de contact et aux devis — mesures précontractuelles ' +
              '(article 6.1.b).',
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
              'durée imposée par le code de commerce.',
            'Journaux de sécurité et d’audit : douze mois.',
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
              'données, traitement des paiements, envoi des e-mails transactionnels. La liste ' +
              'complète et à jour de ces sous-traitants est publiée et accessible ' +
              'publiquement.',
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
              'prestataires, notamment pour la diffusion des pages et le traitement des ' +
              'paiements, sont des sociétés établies hors de l’Union européenne.',
          ),
          p(
            'Ces transferts sont encadrés par les clauses contractuelles types de la Commission ' +
              'européenne ou par une décision d’adéquation. Les garanties applicables à chaque ' +
              'prestataire sont indiquées sur la page des sous-traitants.',
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
              'l’intérêt légitime ;',
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
        id: 'sites-clients',
        title: 'Article 8 — Données collectées sur les sites de nos clients',
        blocks: [
          p(
            'Lorsqu’un visiteur remplit un formulaire, réserve un créneau ou passe commande sur ' +
              'le site d’un client StaX, le responsable du traitement est ce client, et non ' +
              'StaX.',
          ),
          p(
            'StaX intervient alors en qualité de sous-traitant au sens de l’article 28 du RGPD : ' +
              'nous hébergeons et traitons ces données sur instruction du client, sans les ' +
              'utiliser à nos propres fins.',
          ),
          note(
            'Chaque client reste responsable de l’information des personnes concernées et de ' +
              'l’exercice de leurs droits sur son propre site.',
          ),
        ],
      },
      {
        id: 'securite-donnees',
        title: 'Article 9 — Sécurité',
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
    updatedAt: '2026-01-01',
    intro:
      'Notre position est simple : nous ne déposons aucun cookie qui ne soit strictement ' +
      'nécessaire au fonctionnement du service. La mesure d’audience fonctionne sans cookie.',
    articles: [
      {
        id: 'principe-cookies',
        title: 'Article 1 — Principe',
        blocks: [
          p(
            'Le site public de StaX est consultable sans qu’aucun cookie ne soit déposé. Les ' +
              'seuls cookies utilisés le sont après connexion, pour maintenir la session ouverte ' +
              'et protéger les formulaires.',
          ),
          p(
            'Nous n’utilisons ni cookie publicitaire, ni bouton de réseau social traceur, ni ' +
              'outil d’analyse comportementale tiers.',
          ),
        ],
      },
      {
        id: 'cookies-utilises',
        title: 'Article 2 — Cookies et stockage utilisés',
        blocks: [
          {
            kind: 'definitions',
            definitions: [
              {
                term: 'Cookie de session',
                description:
                  'Maintient votre connexion à l’espace client. Strictement nécessaire, exempté ' +
                  'de consentement. Durée : la session, ou la durée de validité du jeton de ' +
                  'rafraîchissement si vous choisissez de rester connecté.',
              },
              {
                term: 'Protection des formulaires',
                description:
                  'Jeton anti-falsification de requête et vérification anti-robot, déposés lors ' +
                  'de l’envoi d’un formulaire. Strictement nécessaires, exemptés de consentement.',
              },
              {
                term: 'Préférences d’affichage',
                description:
                  'Thème clair ou sombre, choix de langue et fermeture des bandeaux ' +
                  'd’information. Stockés localement dans votre navigateur, jamais transmis à ' +
                  'nos serveurs.',
              },
              {
                term: 'Mesure d’audience',
                description:
                  'Comptage agrégé des pages vues, sans cookie, sans identifiant persistant et ' +
                  'sans reconstitution de parcours individuel. Aucune adresse IP complète n’est ' +
                  'conservée.',
              },
            ],
          },
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
              'déposé par défaut.',
          ),
          p(
            'Si un client ajoute lui-même un contenu tiers susceptible de déposer des traceurs — ' +
              'par exemple une vidéo intégrée ou une carte — il lui appartient d’en informer ses ' +
              'visiteurs et de recueillir leur consentement. La plateforme n’autorise que des ' +
              'intégrations approuvées, précisément pour éviter les dépôts non maîtrisés.',
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
    updatedAt: '2026-01-01',
    intro:
      'Cette garantie commerciale est un engagement volontaire du Prestataire. Elle s’ajoute aux ' +
      'garanties légales et aux droits que vous tenez du Code de la consommation : elle ne les ' +
      'remplace ni ne les restreint en aucune manière.',
    articles: [
      {
        id: 'garantie',
        title: `Article 1 — Garantie de ${refund.windowDays} jours`,
        blocks: [
          p(
            `Vous disposez de ${refund.windowDays} jours calendaires à compter de la première ` +
              'mise en ligne de votre site pour demander le remboursement du montant initial de ' +
              'réalisation.',
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
            'le montant initial de réalisation effectivement réglé ;',
            'les mensualités de maintenance déjà prélevées pour la période en cours, calculées ' +
              'au prorata de la période non consommée.',
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
              'remboursement. Le nom de domaine vous reste acquis pour la durée de son ' +
              'enregistrement.',
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
          p(
            'Un refus n’éteint aucun de vos droits légaux et ne vous prive pas de la possibilité ' +
              'de saisir le médiateur de la consommation.',
          ),
        ],
      },
      {
        id: 'garanties-legales',
        title: 'Article 6 — Articulation avec vos droits légaux',
        blocks: [
          p(
            'La présente garantie commerciale est distincte de la garantie légale de conformité ' +
              'et de la garantie des vices cachés, qui demeurent applicables de plein droit.',
          ),
          note(
            'Le droit de rétractation applicable aux contrats conclus à distance, et ses ' +
              'exceptions en matière de services pleinement exécutés ou de biens personnalisés, ' +
              'sont traités dans les conditions générales de vente. Leur rédaction définitive ' +
              'doit être validée par un professionnel du droit.',
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
    updatedAt: '2026-01-01',
    intro:
      'La politique de confidentialité décrit le cadre juridique. Cette page décrit les gestes ' +
      'concrets : où cliquer, quoi attendre, et dans quels délais.',
    articles: [
      {
        id: 'roles',
        title: 'Article 1 — Qui est responsable de quoi',
        blocks: [
          {
            kind: 'definitions',
            definitions: [
              {
                term: 'Vos données de client StaX',
                description:
                  'Compte, facturation, échanges de projet. Nous en sommes responsables de ' +
                  'traitement.',
              },
              {
                term: 'Les données collectées sur votre site',
                description:
                  'Messages, réservations, commandes, contacts de vos propres visiteurs. Vous ' +
                  'en êtes responsable de traitement ; nous agissons comme sous-traitant, sur ' +
                  'vos instructions.',
              },
            ],
          },
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
            'contenus du site : pages, textes, structure et médias associés ;',
            'messages reçus et contacts, au format CSV lisible par un tableur ;',
            'réservations et commandes, avec leur historique ;',
            'factures et justificatifs de paiement.',
          ]),
          p(
            'Les exports CSV sont protégés contre l’injection de formule : une valeur commençant ' +
              'par un signe interprétable par un tableur est neutralisée avant l’écriture.',
          ),
        ],
      },
      {
        id: 'rectification',
        title: 'Article 3 — Corriger vos informations',
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
        title: 'Article 4 — Supprimer votre compte et vos données',
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
            'les messages, contacts, réservations et commandes hébergés pour vous.',
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
        title: 'Article 5 — Ce qui se passe si vous arrêtez la maintenance',
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
        title: 'Article 6 — Nous écrire',
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
/*  Sous-traitants                                                             */
/* -------------------------------------------------------------------------- */

export function buildSubprocessors(): LegalDocument {
  return {
    slug: 'sous-traitants',
    title: 'Sous-traitants',
    description:
      'Liste des prestataires techniques qui traitent des données pour le compte de StaX, leur ' +
      'finalité, leur localisation et les garanties de transfert applicables.',
    updatedAt: '2026-01-01',
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
            'L’ajout d’un nouveau sous-traitant traitant des données personnelles est publié sur ' +
              'cette page. Les clients sont informés dans leur espace des changements ' +
              'substantiels et peuvent formuler une objection motivée.',
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
    updatedAt: '2026-01-01',
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
  confidentialite: buildPrivacyPolicy,
  cookies: buildCookiePolicy,
  remboursements: buildRefundPolicy,
  'donnees-personnelles': buildDataPolicy,
  'sous-traitants': buildSubprocessors,
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
  'confidentialite',
  'cookies',
  'remboursements',
  'donnees-personnelles',
  'sous-traitants',
  'accessibilite',
];
