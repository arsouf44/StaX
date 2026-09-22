import 'server-only';
import type { LabelTone, StatusLabel } from '@stax/business';
import type { PlatformRole } from '@stax/types';

/**
 * Registre des ecrans de liste du back-office.
 *
 * Ce fichier decrit uniquement la PRESENTATION : quelles colonnes, quels
 * libelles, quels filtres. Il n'accorde aucun droit.
 *
 * Ce qui autorise la lecture transverse, ce sont les policies
 * `app.is_platform_staff()` et `app.is_platform_admin()`, appliquees par
 * PostgreSQL sur le jeton de la personne connectee. Un descripteur mal ecrit ne
 * peut pas ouvrir une table qu'un role n'a pas le droit de lire : la base
 * renverrait zero ligne.
 */

export type AdminColumnKind =
  'text' | 'mono' | 'money' | 'date' | 'datetime' | 'status' | 'boolean' | 'relation';

export interface AdminColumn {
  key: string;
  label: string;
  kind: AdminColumnKind;
  /** Pour `relation` : colonne lue dans la table jointe. */
  path?: string;
  statuses?: Record<string, StatusLabel>;
  /** Masquee sous 640 px pour garder le tableau lisible sur telephone. */
  secondary?: boolean;
}

export interface AdminFilter {
  /** Valeur attendue dans `?filtre=`. */
  value: string;
  label: string;
  column: string;
  operator: 'eq' | 'in' | 'notNull' | 'isNull';
  match?: string | readonly string[];
}

export interface AdminView {
  id: string;
  route: string;
  table: string;
  title: string;
  description: string;
  /** Role minimum. Le controle qui fait foi reste la RLS. */
  minimum: PlatformRole;
  select: string;
  orderColumn: string;
  ascending: boolean;
  columns: readonly AdminColumn[];
  searchColumn?: string;
  searchLabel?: string;
  filters?: readonly AdminFilter[];
  emptyTitle: string;
  emptyDescription: string;
  icon: string;
  /**
   * Prefixe de la fiche detaillee, si elle existe.
   *
   * La premiere colonne devient alors un lien vers `<detailRoute>/<id>`. Un
   * ecran sans fiche n'en declare pas : il ne faut pas proposer un lien qui
   * menerait a une page introuvable.
   */
  detailRoute?: string;
  /** Ce que l'ecran ne permet PAS de faire, et pourquoi. */
  note?: string;
}

function label(text: string, tone: LabelTone, help?: string): StatusLabel {
  return help ? { label: text, tone, help } : { label: text, tone };
}

export const SITE_STATUSES: Record<string, StatusLabel> = {
  draft: label('Brouillon', 'neutral'),
  building: label('En création', 'info'),
  review: label('Relecture interne', 'warning'),
  ready: label('Prêt à publier', 'accent'),
  live: label('En ligne', 'success'),
  suspended: label('Suspendu', 'danger'),
  archived: label('Archivé', 'neutral'),
};

export const PROJECT_STATUSES: Record<string, StatusLabel> = {
  ordered: label('Commandé', 'info'),
  questionnaire_pending: label('Questionnaire attendu', 'warning'),
  assets_pending: label('Éléments attendus', 'warning'),
  in_progress: label('En création', 'accent'),
  internal_review: label('Relecture interne', 'info'),
  client_review: label('Chez le client', 'warning'),
  changes_requested: label('Retours à traiter', 'warning'),
  approved: label('Validé', 'success'),
  ready_to_publish: label('Prêt à publier', 'accent'),
  published: label('Publié', 'success'),
  maintenance: label('En maintenance', 'neutral'),
  cancelled: label('Annulé', 'neutral'),
  archived: label('Archivé', 'neutral'),
};

export const QUOTE_STATUSES: Record<string, StatusLabel> = {
  draft: label('Brouillon', 'neutral'),
  sent: label('Envoyé', 'info'),
  viewed: label('Consulté', 'accent'),
  accepted: label('Accepté', 'success'),
  rejected: label('Refusé', 'neutral'),
  expired: label('Expiré', 'neutral'),
  paid: label('Payé', 'success'),
};

export const REFUND_STATUSES: Record<string, StatusLabel> = {
  requested: label('Demandé', 'warning'),
  under_review: label('En examen', 'info'),
  approved: label('Approuvé', 'accent'),
  rejected: label('Refusé', 'neutral'),
  processing: label('En cours chez Stripe', 'info'),
  refunded: label('Remboursé', 'success'),
  failed: label('Échec', 'danger'),
};

export const SUBSCRIPTION_STATUSES: Record<string, StatusLabel> = {
  incomplete: label('Incomplet', 'warning'),
  trialing: label('Période offerte', 'info'),
  active: label('Actif', 'success'),
  past_due: label('Impayé', 'warning'),
  unpaid: label('Impayé prolongé', 'danger'),
  cancel_at_period_end: label('Résiliation programmée', 'warning'),
  canceled: label('Résilié', 'neutral'),
  paused: label('En pause', 'neutral'),
};

export const TICKET_STATUSES: Record<string, StatusLabel> = {
  open: label('Ouvert', 'accent'),
  waiting_support: label('À traiter', 'warning'),
  waiting_customer: label('Chez le client', 'info'),
  resolved: label('Résolu', 'success'),
  closed: label('Clos', 'neutral'),
};

export const DOMAIN_STATUSES: Record<string, StatusLabel> = {
  pending: label('En attente', 'warning'),
  verifying: label('Vérification', 'info'),
  active: label('Actif', 'success'),
  failed: label('Échec', 'danger'),
  expired: label('Expiré', 'danger'),
  detached: label('Retiré', 'neutral'),
};

export const SEVERITIES: Record<string, StatusLabel> = {
  info: label('Information', 'neutral'),
  low: label('Faible', 'info'),
  warning: label('Attention', 'warning'),
  medium: label('Moyenne', 'warning'),
  high: label('Élevée', 'danger'),
  critical: label('Critique', 'danger'),
};

export const PLATFORM_ROLE_LABELS: Record<string, StatusLabel> = {
  platform_owner: label('Propriétaire', 'accent'),
  platform_admin: label('Administrateur', 'accent'),
  billing_admin: label('Facturation', 'info'),
  support: label('Support', 'info'),
  developer: label('Développement', 'neutral'),
  designer: label('Design', 'neutral'),
};

export const INVOICE_STATUSES: Record<string, StatusLabel> = {
  issued: label('Émise', 'warning', 'En attente de rattachement par le client.'),
  claimed: label('Rattachée', 'accent', 'Le client a retrouvé sa commande.'),
  paid: label('Payée', 'success'),
  cancelled: label('Annulée', 'neutral'),
};

const PRIVACY_KINDS: Record<string, StatusLabel> = {
  export: label('Accès / portabilité', 'info'),
  deletion: label('Effacement', 'warning'),
  rectification: label('Rectification', 'accent'),
  objection: label('Opposition', 'neutral'),
};

const PRIVACY_STATUSES: Record<string, StatusLabel> = {
  received: label('Reçue', 'warning', 'Le délai d’un mois court déjà.'),
  verifying: label('Identité à vérifier', 'warning', 'Ne rien livrer avant vérification.'),
  in_progress: label('En cours', 'info'),
  completed: label('Traitée', 'success'),
  refused: label('Refusée', 'neutral', 'Un refus doit être motivé et notifié.'),
};

const COUPON_KINDS: Record<string, StatusLabel> = {
  percent: label('Pourcentage', 'info'),
  amount: label('Montant fixe', 'accent'),
};

const JOB_STATUSES: Record<string, StatusLabel> = {
  queued: label('En attente', 'neutral'),
  running: label('En cours', 'info'),
  completed: label('Terminée', 'success'),
  failed: label('En échec', 'danger', 'Essais épuisés : reprise manuelle nécessaire.'),
  cancelled: label('Annulée', 'neutral'),
};

export const ADMIN_VIEWS = {
  sites: {
    id: 'sites',
    route: '/admin/sites',
    table: 'sites',
    title: 'Sites',
    description:
      'Tous les sites de la plateforme. Un site en relecture attend une action de notre côté.',
    minimum: 'support',
    select:
      'id, name, slug, status, is_demo, last_published_at, created_at, organizations ( name )',
    orderColumn: 'created_at',
    ascending: false,
    searchColumn: 'name',
    searchLabel: 'Rechercher un site',
    filters: [
      {
        value: 'relecture',
        label: 'En relecture',
        column: 'status',
        operator: 'in',
        match: ['review', 'ready'],
      },
      { value: 'en-ligne', label: 'En ligne', column: 'status', operator: 'eq', match: 'live' },
      {
        value: 'suspendus',
        label: 'Suspendus',
        column: 'status',
        operator: 'eq',
        match: 'suspended',
      },
    ],
    columns: [
      { key: 'name', label: 'Site', kind: 'text' },
      { key: 'organizations', label: 'Client', kind: 'relation', path: 'name' },
      { key: 'status', label: 'État', kind: 'status', statuses: SITE_STATUSES },
      {
        key: 'last_published_at',
        label: 'Dernière publication',
        kind: 'datetime',
        secondary: true,
      },
      { key: 'created_at', label: 'Créé le', kind: 'date', secondary: true },
    ],
    emptyTitle: 'Aucun site',
    emptyDescription: 'Les sites apparaissent ici dès la première commande payée.',
    icon: 'globe',
    detailRoute: '/admin/sites',
  },

  utilisateurs: {
    id: 'utilisateurs',
    route: '/admin/utilisateurs',
    table: 'profiles',
    title: 'Utilisateurs',
    description:
      'Les comptes de la plateforme. Le rôle interne n’est jamais déduit d’une adresse e-mail : il est porté par la base.',
    minimum: 'support',
    select:
      'id, email, first_name, last_name, platform_role, mfa_enforced, disabled_at, created_at',
    orderColumn: 'created_at',
    ascending: false,
    searchColumn: 'email',
    searchLabel: 'Rechercher par e-mail',
    filters: [
      { value: 'equipe', label: 'Équipe StaX', column: 'platform_role', operator: 'notNull' },
      { value: 'desactives', label: 'Désactivés', column: 'disabled_at', operator: 'notNull' },
    ],
    columns: [
      { key: 'email', label: 'Adresse', kind: 'text' },
      { key: 'last_name', label: 'Nom', kind: 'text', secondary: true },
      {
        key: 'platform_role',
        label: 'Rôle interne',
        kind: 'status',
        statuses: PLATFORM_ROLE_LABELS,
      },
      { key: 'mfa_enforced', label: 'Second facteur', kind: 'boolean', secondary: true },
      { key: 'created_at', label: 'Inscrit le', kind: 'date', secondary: true },
    ],
    emptyTitle: 'Aucun compte',
    emptyDescription: 'Les comptes créés sur la plateforme apparaissent ici.',
    icon: 'users',
    note: 'Lecture seule. Un changement de rôle interne se fait en base, avec trace au journal : il ne doit jamais tenir à un clic.',
  },

  domaines: {
    id: 'domaines',
    route: '/admin/domaines',
    table: 'site_domains',
    title: 'Domaines',
    description: 'Les noms de domaine des sites clients et l’état réel de leur vérification DNS.',
    minimum: 'support',
    select:
      'id, hostname, status, ssl_status, is_primary, last_error, last_checked_at, created_at, sites ( name )',
    orderColumn: 'created_at',
    ascending: false,
    searchColumn: 'hostname',
    searchLabel: 'Rechercher un domaine',
    filters: [
      {
        value: 'echec',
        label: 'En échec',
        column: 'status',
        operator: 'in',
        match: ['failed', 'expired'],
      },
      {
        value: 'attente',
        label: 'En attente',
        column: 'status',
        operator: 'in',
        match: ['pending', 'verifying'],
      },
      { value: 'actifs', label: 'Actifs', column: 'status', operator: 'eq', match: 'active' },
    ],
    columns: [
      { key: 'hostname', label: 'Domaine', kind: 'mono' },
      { key: 'sites', label: 'Site', kind: 'relation', path: 'name' },
      { key: 'status', label: 'État', kind: 'status', statuses: DOMAIN_STATUSES },
      { key: 'last_error', label: 'Dernière erreur', kind: 'text', secondary: true },
      { key: 'last_checked_at', label: 'Vérifié le', kind: 'datetime', secondary: true },
    ],
    emptyTitle: 'Aucun domaine',
    emptyDescription: 'Les domaines rattachés par les clients apparaissent ici.',
    icon: 'map-pin',
  },

  projets: {
    id: 'projets',
    route: '/admin/projets',
    table: 'projects',
    title: 'Projets',
    description: 'La création de chaque site, de la commande à la mise en ligne.',
    minimum: 'support',
    select: 'id, reference, title, status, due_at, go_live_at, created_at, organizations ( name )',
    orderColumn: 'created_at',
    ascending: false,
    searchColumn: 'reference',
    searchLabel: 'Rechercher une référence',
    filters: [
      {
        value: 'a-traiter',
        label: 'À traiter',
        column: 'status',
        operator: 'in',
        match: ['ordered', 'questionnaire_pending', 'assets_pending', 'changes_requested'],
      },
      {
        value: 'en-cours',
        label: 'En création',
        column: 'status',
        operator: 'in',
        match: ['in_progress', 'internal_review'],
      },
      {
        value: 'chez-le-client',
        label: 'Chez le client',
        column: 'status',
        operator: 'eq',
        match: 'client_review',
      },
    ],
    columns: [
      { key: 'reference', label: 'Référence', kind: 'mono' },
      { key: 'organizations', label: 'Client', kind: 'relation', path: 'name' },
      { key: 'status', label: 'Étape', kind: 'status', statuses: PROJECT_STATUSES },
      { key: 'due_at', label: 'Échéance', kind: 'date', secondary: true },
      { key: 'go_live_at', label: 'Mise en ligne', kind: 'date', secondary: true },
    ],
    emptyTitle: 'Aucun projet',
    emptyDescription: 'Un projet est ouvert automatiquement à chaque commande payée.',
    icon: 'route',
  },

  devis: {
    id: 'devis',
    route: '/admin/devis',
    table: 'quotes',
    title: 'Devis',
    description: 'Les demandes sur mesure et les devis émis.',
    minimum: 'support',
    select:
      'id, reference, contact_name, company_name, status, total_cents, currency, expires_at, created_at',
    orderColumn: 'created_at',
    ascending: false,
    searchColumn: 'reference',
    searchLabel: 'Rechercher une référence',
    filters: [
      { value: 'a-traiter', label: 'À chiffrer', column: 'status', operator: 'eq', match: 'draft' },
      {
        value: 'envoyes',
        label: 'Envoyés',
        column: 'status',
        operator: 'in',
        match: ['sent', 'viewed'],
      },
      {
        value: 'acceptes',
        label: 'Acceptés',
        column: 'status',
        operator: 'in',
        match: ['accepted', 'paid'],
      },
    ],
    columns: [
      { key: 'reference', label: 'Référence', kind: 'mono' },
      { key: 'contact_name', label: 'Contact', kind: 'text' },
      { key: 'company_name', label: 'Entreprise', kind: 'text', secondary: true },
      { key: 'status', label: 'État', kind: 'status', statuses: QUOTE_STATUSES },
      { key: 'total_cents', label: 'Montant', kind: 'money' },
      { key: 'expires_at', label: 'Expire le', kind: 'date', secondary: true },
    ],
    emptyTitle: 'Aucun devis',
    emptyDescription: 'Les demandes sur mesure envoyées depuis le site public apparaissent ici.',
    icon: 'file-text',
  },

  abonnements: {
    id: 'abonnements',
    route: '/admin/abonnements',
    table: 'subscriptions',
    title: 'Abonnements',
    description:
      'Les contrats de maintenance. Leur état vient des webhooks Stripe signés : il n’est jamais saisi ici.',
    minimum: 'billing_admin',
    select:
      'id, status, maintenance_state, plan_slug, maintenance_price_cents, billing_interval, currency, current_period_end, cancel_at_period_end, created_at, organizations ( name )',
    orderColumn: 'created_at',
    ascending: false,
    filters: [
      {
        value: 'impayes',
        label: 'Impayés',
        column: 'status',
        operator: 'in',
        match: ['past_due', 'unpaid'],
      },
      {
        value: 'risque',
        label: 'Résiliation programmée',
        column: 'cancel_at_period_end',
        operator: 'eq',
        match: 'true',
      },
      { value: 'actifs', label: 'Actifs', column: 'status', operator: 'eq', match: 'active' },
    ],
    columns: [
      { key: 'organizations', label: 'Client', kind: 'relation', path: 'name' },
      { key: 'plan_slug', label: 'Offre', kind: 'text', secondary: true },
      { key: 'status', label: 'État', kind: 'status', statuses: SUBSCRIPTION_STATUSES },
      { key: 'maintenance_price_cents', label: 'Maintenance', kind: 'money' },
      { key: 'current_period_end', label: 'Échéance', kind: 'date', secondary: true },
    ],
    emptyTitle: 'Aucun abonnement',
    emptyDescription: 'Un abonnement démarre à la mise en ligne du site du client.',
    icon: 'shield-check',
    note: 'Lecture seule. Modifier un abonnement se fait dans Stripe : la base suit ensuite, par le webhook signé.',
  },

  remboursements: {
    id: 'remboursements',
    route: '/admin/remboursements',
    table: 'refund_requests',
    title: 'Remboursements',
    description:
      'Les demandes et leur éligibilité, calculée à partir de la date réelle de mise en ligne.',
    minimum: 'billing_admin',
    select:
      'id, status, eligible, eligibility_reason, amount_paid_cents, deduction_cents, refund_amount_cents, currency, requested_at, deadline_at, organizations ( name )',
    orderColumn: 'requested_at',
    ascending: false,
    filters: [
      {
        value: 'a-traiter',
        label: 'À traiter',
        column: 'status',
        operator: 'in',
        match: ['requested', 'under_review'],
      },
      {
        value: 'en-cours',
        label: 'En cours',
        column: 'status',
        operator: 'in',
        match: ['approved', 'processing'],
      },
      {
        value: 'traites',
        label: 'Traités',
        column: 'status',
        operator: 'in',
        match: ['refunded', 'rejected', 'failed'],
      },
    ],
    columns: [
      { key: 'organizations', label: 'Client', kind: 'relation', path: 'name' },
      { key: 'status', label: 'État', kind: 'status', statuses: REFUND_STATUSES },
      { key: 'eligible', label: 'Éligible', kind: 'boolean' },
      { key: 'refund_amount_cents', label: 'À rembourser', kind: 'money' },
      { key: 'deduction_cents', label: 'Déduction domaine', kind: 'money', secondary: true },
      { key: 'requested_at', label: 'Demandé le', kind: 'datetime', secondary: true },
    ],
    emptyTitle: 'Aucune demande',
    emptyDescription: 'Les demandes de remboursement des clients apparaissent ici.',
    icon: 'rotate-ccw',
  },

  support: {
    id: 'support',
    route: '/admin/support',
    table: 'support_tickets',
    title: 'Tickets',
    description: 'Les demandes d’assistance des clients.',
    minimum: 'support',
    select:
      'id, reference, subject, category, status, priority, created_at, organizations ( name )',
    orderColumn: 'created_at',
    ascending: false,
    searchColumn: 'subject',
    searchLabel: 'Rechercher un sujet',
    filters: [
      {
        value: 'urgent',
        label: 'Urgents',
        column: 'priority',
        operator: 'in',
        match: ['high', 'urgent'],
      },
      {
        value: 'a-traiter',
        label: 'À traiter',
        column: 'status',
        operator: 'in',
        match: ['open', 'waiting_support'],
      },
      {
        value: 'clos',
        label: 'Clos',
        column: 'status',
        operator: 'in',
        match: ['resolved', 'closed'],
      },
    ],
    columns: [
      { key: 'reference', label: 'Référence', kind: 'mono' },
      { key: 'subject', label: 'Sujet', kind: 'text' },
      { key: 'organizations', label: 'Client', kind: 'relation', path: 'name' },
      { key: 'status', label: 'État', kind: 'status', statuses: TICKET_STATUSES },
      { key: 'created_at', label: 'Ouvert le', kind: 'datetime', secondary: true },
    ],
    emptyTitle: 'Aucun ticket',
    emptyDescription: 'Les demandes envoyées depuis l’espace client apparaissent ici.',
    icon: 'life-buoy',
  },

  catalogue: {
    id: 'catalogue',
    route: '/admin/catalogue',
    table: 'plans',
    title: 'Offres',
    description:
      'Le catalogue commercial. Une offre n’est jamais modifiée en place : une nouvelle version est créée, et les contrats en cours gardent leur prix.',
    minimum: 'platform_admin',
    select:
      'id, slug, version, name, setup_price_cents, maintenance_price_cents, billing_interval, currency, is_quote_only, is_active, is_public, valid_from, valid_until',
    orderColumn: 'sort_order',
    ascending: true,
    filters: [
      { value: 'actives', label: 'En vente', column: 'is_active', operator: 'eq', match: 'true' },
      { value: 'retirees', label: 'Retirées', column: 'is_active', operator: 'eq', match: 'false' },
    ],
    columns: [
      { key: 'name', label: 'Offre', kind: 'text' },
      { key: 'version', label: 'Version', kind: 'mono', secondary: true },
      { key: 'setup_price_cents', label: 'Création HT', kind: 'money' },
      { key: 'maintenance_price_cents', label: 'Maintenance HT', kind: 'money' },
      { key: 'is_public', label: 'Publique', kind: 'boolean', secondary: true },
      { key: 'valid_from', label: 'En vigueur depuis', kind: 'date', secondary: true },
    ],
    emptyTitle: 'Aucune offre',
    emptyDescription: 'Le catalogue est vide : appliquez la migration de données de référence.',
    icon: 'package',
    note: 'Lecture seule. Un changement de prix passe par une migration versionnée, pour que l’historique des commandes reste vérifiable.',
  },

  securite: {
    id: 'securite',
    route: '/admin/securite',
    table: 'security_events',
    title: 'Sécurité',
    description: 'Échecs d’authentification, limites de débit atteintes, accès refusés.',
    minimum: 'platform_admin',
    select: 'id, kind, severity, email_attempted, user_agent_family, created_at',
    orderColumn: 'created_at',
    ascending: false,
    filters: [
      {
        value: 'critiques',
        label: 'Critiques',
        column: 'severity',
        operator: 'in',
        match: ['high', 'critical'],
      },
    ],
    columns: [
      { key: 'created_at', label: 'Quand', kind: 'datetime' },
      { key: 'kind', label: 'Événement', kind: 'mono' },
      { key: 'severity', label: 'Gravité', kind: 'status', statuses: SEVERITIES },
      { key: 'email_attempted', label: 'Adresse tentée', kind: 'text', secondary: true },
      { key: 'user_agent_family', label: 'Navigateur', kind: 'text', secondary: true },
    ],
    emptyTitle: 'Rien à signaler',
    emptyDescription: 'Aucun événement de sécurité enregistré.',
    icon: 'lock',
    note: 'Les adresses IP ne sont jamais conservées en clair : seule une empreinte tronquée est enregistrée.',
  },

  activite: {
    id: 'activite',
    route: '/admin/activite',
    table: 'audit_logs',
    title: 'Journal',
    description:
      'Toutes les actions tracées, y compris celles de notre équipe et les accès d’assistance.',
    minimum: 'platform_admin',
    select: 'id, action, actor_type, actor_email, impersonated_by, target_type, created_at',
    orderColumn: 'created_at',
    ascending: false,
    searchColumn: 'action',
    searchLabel: 'Rechercher une action',
    filters: [
      {
        value: 'equipe',
        label: 'Équipe StaX',
        column: 'actor_type',
        operator: 'eq',
        match: 'platform_staff',
      },
      {
        value: 'assistance',
        label: 'Accès d’assistance',
        column: 'impersonated_by',
        operator: 'notNull',
      },
    ],
    columns: [
      { key: 'created_at', label: 'Quand', kind: 'datetime' },
      { key: 'action', label: 'Action', kind: 'mono' },
      { key: 'actor_email', label: 'Par qui', kind: 'text' },
      { key: 'actor_type', label: 'Type', kind: 'text', secondary: true },
      { key: 'target_type', label: 'Cible', kind: 'text', secondary: true },
    ],
    emptyTitle: 'Journal vide',
    emptyDescription: 'Les actions tracées apparaîtront ici.',
    icon: 'history',
    note: 'Le journal est en ajout seul : une ligne écrite ne peut être ni modifiée ni supprimée, y compris par un administrateur.',
  },

  factures: {
    id: 'factures',
    route: '/admin/factures',
    table: 'sales_invoices',
    title: 'Factures de vente',
    description:
      'Les factures émises après un appel et une démonstration. Le client saisit le numéro pour retrouver sa commande.',
    minimum: 'billing_admin',
    select:
      'id, number, plan_slug, company_name, customer_email, total_cents, currency, status, issued_at, claimed_at, attempt_count',
    orderColumn: 'issued_at',
    ascending: false,
    searchColumn: 'number',
    searchLabel: 'Rechercher un numéro',
    filters: [
      {
        value: 'en-attente',
        label: 'Non rattachées',
        column: 'status',
        operator: 'eq',
        match: 'issued',
      },
      {
        value: 'rattachees',
        label: 'Rattachées',
        column: 'status',
        operator: 'in',
        match: ['claimed', 'paid'],
      },
      {
        value: 'annulees',
        label: 'Annulées',
        column: 'status',
        operator: 'eq',
        match: 'cancelled',
      },
    ],
    columns: [
      { key: 'number', label: 'Numéro', kind: 'mono' },
      { key: 'company_name', label: 'Entreprise', kind: 'text' },
      { key: 'customer_email', label: 'Destinataire', kind: 'text', secondary: true },
      { key: 'plan_slug', label: 'Offre', kind: 'text', secondary: true },
      { key: 'total_cents', label: 'Total TTC', kind: 'money' },
      { key: 'status', label: 'État', kind: 'status', statuses: INVOICE_STATUSES },
      { key: 'attempt_count', label: 'Tentatives', kind: 'text', secondary: true },
    ],
    emptyTitle: 'Aucune facture',
    emptyDescription:
      'Émettez une facture après un accord commercial pour que le client puisse rattacher sa commande.',
    icon: 'receipt',
    note: 'Un nombre de tentatives élevé sur une facture non rattachée signale une énumération de numéros.',
  },

  confidentialite: {
    id: 'confidentialite',
    route: '/admin/confidentialite',
    table: 'privacy_requests',
    title: 'Demandes RGPD',
    description:
      'Accès, effacement, rectification, opposition. Le règlement impose une réponse sous un mois.',
    minimum: 'platform_admin',
    select:
      'id, reference, kind, status, requester_email, due_at, identity_verified_at, created_at, ' +
      'organizations ( name )',
    orderColumn: 'due_at',
    ascending: true,
    searchColumn: 'requester_email',
    searchLabel: 'Rechercher une adresse',
    filters: [
      {
        value: 'a-traiter',
        label: 'À traiter',
        column: 'status',
        operator: 'in',
        match: ['received', 'verifying', 'in_progress'],
      },
      {
        value: 'identite-a-verifier',
        label: 'Identité à vérifier',
        column: 'identity_verified_at',
        operator: 'isNull',
      },
    ],
    columns: [
      { key: 'due_at', label: 'Échéance', kind: 'date' },
      { key: 'reference', label: 'Référence', kind: 'mono' },
      { key: 'kind', label: 'Demande', kind: 'status', statuses: PRIVACY_KINDS },
      { key: 'requester_email', label: 'Demandeur', kind: 'text' },
      { key: 'organizations', label: 'Client', kind: 'relation', path: 'name', secondary: true },
      { key: 'status', label: 'État', kind: 'status', statuses: PRIVACY_STATUSES },
      { key: 'created_at', label: 'Reçue le', kind: 'date', secondary: true },
    ],
    emptyTitle: 'Aucune demande',
    emptyDescription: 'Les demandes d’exercice des droits arrivent ici dès leur dépôt.',
    icon: 'shield-check',
    note: 'Trié par échéance, la plus proche en premier. Une demande sans identité vérifiée ne doit jamais être exécutée : c’est ainsi qu’on livre les données de quelqu’un d’autre.',
  },

  coupons: {
    id: 'coupons',
    route: '/admin/coupons',
    table: 'coupons',
    title: 'Codes promotionnels',
    description: 'Remises applicables à la création du site ou à la maintenance.',
    minimum: 'platform_admin',
    select:
      'id, code, label, kind, value, applies_to, max_redemptions, redeemed_count, ' +
      'valid_until, is_active, created_at',
    orderColumn: 'created_at',
    ascending: false,
    searchColumn: 'code',
    searchLabel: 'Rechercher un code',
    filters: [
      { value: 'actifs', label: 'Actifs', column: 'is_active', operator: 'eq', match: 'true' },
    ],
    columns: [
      { key: 'code', label: 'Code', kind: 'mono' },
      { key: 'label', label: 'Libellé', kind: 'text' },
      { key: 'kind', label: 'Type', kind: 'status', statuses: COUPON_KINDS },
      { key: 'applies_to', label: 'Porte sur', kind: 'text', secondary: true },
      { key: 'redeemed_count', label: 'Utilisé', kind: 'text' },
      { key: 'valid_until', label: 'Jusqu’au', kind: 'date', secondary: true },
      { key: 'is_active', label: 'Actif', kind: 'boolean' },
    ],
    emptyTitle: 'Aucun code',
    emptyDescription: 'Créez un code pour accorder une remise sur une commande.',
    icon: 'badge',
    note: 'La remise est toujours recalculée par la base au moment de la commande : un code affiché ici ne fixe jamais un montant à lui seul.',
  },

  'feature-flags': {
    id: 'feature-flags',
    route: '/admin/feature-flags',
    table: 'feature_flags',
    title: 'Activations progressives',
    description:
      'Fonctionnalités activables globalement ou par règle, indépendamment des droits d’offre.',
    minimum: 'platform_admin',
    select: 'key, label, description, enabled_globally, updated_at',
    orderColumn: 'key',
    ascending: true,
    columns: [
      { key: 'key', label: 'Clé', kind: 'mono' },
      { key: 'label', label: 'Nom', kind: 'text' },
      { key: 'enabled_globally', label: 'Actif partout', kind: 'boolean' },
      { key: 'description', label: 'Rôle', kind: 'text', secondary: true },
      { key: 'updated_at', label: 'Modifié le', kind: 'datetime', secondary: true },
    ],
    emptyTitle: 'Aucune activation progressive',
    emptyDescription: 'Les drapeaux déclarés par le produit apparaissent ici.',
    icon: 'zap',
    note: 'À ne pas confondre avec les droits d’offre : un drapeau sert à déployer progressivement, pas à vendre. Les droits d’offre se règlent par client depuis sa fiche.',
  },

  templates: {
    id: 'templates',
    route: '/admin/templates',
    table: 'site_templates',
    title: 'Modèles de site',
    description: 'Structures de départ proposées à la création d’un site.',
    minimum: 'designer',
    select: 'slug, name, description, is_active, sort_order, updated_at',
    orderColumn: 'sort_order',
    ascending: true,
    columns: [
      { key: 'name', label: 'Modèle', kind: 'text' },
      { key: 'slug', label: 'Identifiant', kind: 'mono', secondary: true },
      { key: 'description', label: 'Description', kind: 'text', secondary: true },
      { key: 'is_active', label: 'Proposé', kind: 'boolean' },
    ],
    emptyTitle: 'Aucun modèle',
    emptyDescription: 'Les modèles de site sont livrés par migration de données de référence.',
    icon: 'layout-grid',
    note: 'Lecture seule. Un modèle est du code versionné : le modifier depuis une interface le désynchroniserait du dépôt.',
  },

  metiers: {
    id: 'metiers',
    route: '/admin/metiers',
    table: 'business_types',
    title: 'Métiers',
    description: 'Les métiers proposés à la commande, et les modules que chacun active.',
    minimum: 'support',
    select: 'slug, name, sector_slug, is_active, sort_order, business_sectors ( name )',
    orderColumn: 'sort_order',
    ascending: true,
    searchColumn: 'name',
    searchLabel: 'Rechercher un métier',
    columns: [
      { key: 'name', label: 'Métier', kind: 'text' },
      { key: 'business_sectors', label: 'Secteur', kind: 'relation', path: 'name' },
      { key: 'slug', label: 'Identifiant', kind: 'mono', secondary: true },
      { key: 'is_active', label: 'Proposé', kind: 'boolean' },
    ],
    emptyTitle: 'Aucun métier',
    emptyDescription: 'Les métiers sont livrés par migration de données de référence.',
    icon: 'briefcase',
    note: 'Lecture seule. Les métiers et leurs modules sont définis dans @stax/business, en même temps que les blocs et les questionnaires qui en dépendent.',
  },

  taches: {
    id: 'taches',
    route: '/admin/taches',
    table: 'background_jobs',
    title: 'Tâches de fond',
    description:
      'Vérifications DNS, agrégations, publications programmées. Ce qui échoue ici ne se voit nulle part ailleurs.',
    minimum: 'developer',
    select: 'id, kind, status, attempts, max_attempts, run_after, last_error, created_at',
    orderColumn: 'created_at',
    ascending: false,
    filters: [
      {
        value: 'en-echec',
        label: 'En échec',
        column: 'status',
        operator: 'eq',
        match: 'failed',
      },
      {
        value: 'en-attente',
        label: 'En attente',
        column: 'status',
        operator: 'in',
        match: ['queued', 'running'],
      },
    ],
    columns: [
      { key: 'created_at', label: 'Créée', kind: 'datetime' },
      { key: 'kind', label: 'Tâche', kind: 'mono' },
      { key: 'status', label: 'État', kind: 'status', statuses: JOB_STATUSES },
      { key: 'attempts', label: 'Essais', kind: 'text', secondary: true },
      { key: 'last_error', label: 'Dernière erreur', kind: 'text', secondary: true },
    ],
    emptyTitle: 'Aucune tâche',
    emptyDescription: 'Aucune tâche de fond enregistrée pour l’instant.',
    icon: 'clock',
    note: 'Une tâche qui a épuisé ses essais ne sera plus reprise toute seule : elle attend une intervention.',
  },
} as const satisfies Record<string, Omit<AdminView, 'id'> & { id: string }>;

export type AdminViewId = keyof typeof ADMIN_VIEWS;

export function getAdminView(id: AdminViewId): AdminView {
  return ADMIN_VIEWS[id] as unknown as AdminView;
}
