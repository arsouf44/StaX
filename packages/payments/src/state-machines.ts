import type {
  MaintenanceState,
  OrderStatus,
  PaymentStatus,
  ProjectStatus,
  QuoteStatus,
  SiteStatus,
  SubscriptionStatus,
} from '@stax/types';

/**
 * Machines a etats du produit. Les memes regles sont appliquees par des
 * triggers PostgreSQL : cette couche donne un message clair a l'utilisateur
 * avant que la base ne refuse une transition incoherente.
 */

function transition<S extends string>(map: Record<S, readonly S[]>) {
  return {
    can: (from: S, to: S): boolean => from === to || map[from].includes(to),
    next: (from: S): readonly S[] => map[from],
    assert: (from: S, to: S): void => {
      if (from !== to && !map[from].includes(to)) {
        throw new Error(`Transition interdite : ${from} -> ${to}`);
      }
    },
  };
}

export const siteStatusMachine = transition<SiteStatus>({
  draft: ['building', 'archived'],
  building: ['draft', 'review', 'ready', 'archived'],
  review: ['building', 'ready', 'archived'],
  ready: ['building', 'review', 'live', 'archived'],
  live: ['suspended', 'archived', 'ready'],
  suspended: ['live', 'ready', 'archived'],
  archived: ['draft'],
});

export const orderStatusMachine = transition<OrderStatus>({
  draft: ['checkout_pending', 'cancelled'],
  checkout_pending: ['paid', 'cancelled'],
  paid: ['refunded', 'partially_refunded'],
  partially_refunded: ['refunded'],
  refunded: [],
  cancelled: [],
});

export const paymentStatusMachine = transition<PaymentStatus>({
  pending: ['processing', 'succeeded', 'failed'],
  processing: ['succeeded', 'failed'],
  succeeded: ['refunded', 'partially_refunded', 'disputed'],
  partially_refunded: ['refunded', 'disputed'],
  failed: ['processing'],
  refunded: ['disputed'],
  disputed: ['refunded', 'succeeded'],
});

export const subscriptionStatusMachine = transition<SubscriptionStatus>({
  incomplete: ['active', 'trialing', 'canceled'],
  trialing: ['active', 'past_due', 'canceled', 'paused'],
  active: ['past_due', 'cancel_at_period_end', 'canceled', 'paused'],
  past_due: ['active', 'unpaid', 'canceled'],
  unpaid: ['active', 'canceled'],
  cancel_at_period_end: ['active', 'canceled'],
  paused: ['active', 'canceled'],
  canceled: [],
});

export const maintenanceStateMachine = transition<MaintenanceState>({
  active: ['cancel_at_period_end', 'grace_period', 'suspended'],
  cancel_at_period_end: ['active', 'maintenance_ended'],
  maintenance_ended: ['grace_period', 'active'],
  grace_period: ['active', 'suspended'],
  suspended: ['active', 'archived'],
  archived: [],
});

export const projectStatusMachine = transition<ProjectStatus>({
  ordered: ['questionnaire_pending', 'cancelled'],
  questionnaire_pending: ['assets_pending', 'in_progress', 'cancelled'],
  assets_pending: ['in_progress', 'cancelled'],
  in_progress: ['internal_review', 'assets_pending', 'cancelled'],
  internal_review: ['in_progress', 'client_review', 'cancelled'],
  client_review: ['changes_requested', 'approved', 'cancelled'],
  changes_requested: ['in_progress', 'cancelled'],
  approved: ['ready_to_publish', 'changes_requested'],
  ready_to_publish: ['published', 'changes_requested'],
  published: ['maintenance', 'changes_requested'],
  maintenance: ['changes_requested', 'archived'],
  cancelled: ['archived'],
  archived: [],
});

export const quoteStatusMachine = transition<QuoteStatus>({
  draft: ['sent'],
  sent: ['viewed', 'accepted', 'rejected', 'expired'],
  viewed: ['accepted', 'rejected', 'expired'],
  accepted: ['paid'],
  rejected: [],
  expired: ['sent'],
  paid: [],
});

/** Etapes visibles par le client, chacune adossee a un etat backend reel. */
export const PROJECT_TIMELINE: ReadonlyArray<{
  key: string;
  label: string;
  description: string;
  statuses: readonly ProjectStatus[];
}> = [
  {
    key: 'ordered',
    label: 'Commande reçue',
    description: 'Votre paiement est confirme et votre projet est ouvert.',
    statuses: ['ordered'],
  },
  {
    key: 'briefing',
    label: 'Informations reçues',
    description: 'Nous rassemblons votre questionnaire, vos textes et vos visuels.',
    statuses: ['questionnaire_pending', 'assets_pending'],
  },
  {
    key: 'creation',
    label: 'Création',
    description: 'Notre équipe concoit et developpe votre site.',
    statuses: ['in_progress', 'internal_review'],
  },
  {
    key: 'review',
    label: 'Votre validation',
    description: 'Vous relisez le site et demandez vos corrections.',
    statuses: ['client_review', 'changes_requested'],
  },
  {
    key: 'publish',
    label: 'Mise en ligne',
    description: 'Le site est publié sur votre domaine, en HTTPS.',
    statuses: ['approved', 'ready_to_publish', 'published'],
  },
  {
    key: 'maintenance',
    label: 'Maintenance',
    description: 'Nous assurons les mises a jour, la sécurité et le support.',
    statuses: ['maintenance'],
  },
];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  ordered: 'Commande reçue',
  questionnaire_pending: 'Questionnaire à compléter',
  assets_pending: 'En attente de vos éléments',
  in_progress: 'Création en cours',
  internal_review: 'Relecture interne',
  client_review: 'En attente de votre validation',
  changes_requested: 'Corrections demandées',
  approved: 'Validé',
  ready_to_publish: 'Prêt à publier',
  published: 'En ligne',
  maintenance: 'En maintenance',
  cancelled: 'Annulé',
  archived: 'Archivé',
};

export const SITE_STATUS_LABELS: Record<SiteStatus, string> = {
  draft: 'Brouillon',
  building: 'En construction',
  review: 'En relecture',
  ready: 'Prêt à publier',
  live: 'En ligne',
  suspended: 'Suspendu',
  archived: 'Archivé',
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  draft: 'Brouillon',
  checkout_pending: 'Paiement en attente',
  paid: 'Payée',
  cancelled: 'Annulée',
  refunded: 'Remboursée',
  partially_refunded: 'Partiellement remboursée',
};

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  incomplete: 'Incomplet',
  trialing: 'Période d’essai',
  active: 'Actif',
  past_due: 'Paiement en retard',
  unpaid: 'Impaye',
  cancel_at_period_end: 'Résiliation programmée',
  canceled: 'Résilié',
  paused: 'Suspendu',
};
