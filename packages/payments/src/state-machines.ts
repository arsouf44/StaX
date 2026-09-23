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
  ordered: ['questionnaire_pending', 'assets_pending', 'design', 'cancelled'],
  questionnaire_pending: ['assets_pending', 'design', 'in_progress', 'cancelled'],
  assets_pending: ['design', 'in_progress', 'cancelled'],
  design: ['client_review', 'development', 'assets_pending', 'cancelled'],
  development: ['verification', 'client_review', 'cancelled'],
  verification: ['deploying', 'development', 'client_review', 'cancelled'],
  deploying: ['delivered', 'verification', 'cancelled'],
  delivered: ['maintenance', 'archived'],
  in_progress: ['internal_review', 'assets_pending', 'development', 'cancelled'],
  internal_review: ['in_progress', 'client_review', 'verification', 'cancelled'],
  client_review: ['changes_requested', 'approved', 'development', 'verification', 'cancelled'],
  changes_requested: ['in_progress', 'design', 'development', 'cancelled'],
  approved: ['ready_to_publish', 'changes_requested', 'deploying'],
  ready_to_publish: ['published', 'changes_requested', 'deploying'],
  published: ['maintenance', 'changes_requested', 'delivered'],
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

/**
 * Etapes visibles par le client, chacune adossee a un etat backend reel :
 *
 *   Commande validee -> Informations recues -> Conception -> Developpement
 *     -> Verifications -> Mise en ligne -> Livraison
 *
 * Le site est concu et developpe individuellement (son propre depot), mis en
 * ligne sur son propre projet Cloudflare avec son domaine, verifie, puis
 * livre. Les etats anterieurs (`in_progress`, `approved`…) sont ranges dans
 * l'etape qui leur correspond.
 */
export const PROJECT_TIMELINE: ReadonlyArray<{
  key: string;
  label: string;
  description: string;
  statuses: readonly ProjectStatus[];
}> = [
  {
    key: 'ordered',
    label: 'Commande validée',
    description: 'Votre paiement est confirmé et votre projet est ouvert.',
    statuses: ['ordered'],
  },
  {
    key: 'briefing',
    label: 'Informations reçues',
    description: 'Vous nous transmettez vos informations, vos textes, vos photos et votre logo.',
    statuses: ['questionnaire_pending', 'assets_pending'],
  },
  {
    key: 'design',
    label: 'Conception',
    description:
      'Nous concevons votre site pour votre entreprise — structure, contenus, design — et vous le présentons.',
    statuses: ['design', 'client_review', 'changes_requested'],
  },
  {
    key: 'development',
    label: 'Développement',
    description:
      'Votre site est développé dans son propre projet, à partir de la conception validée.',
    statuses: ['development', 'in_progress'],
  },
  {
    key: 'verification',
    label: 'Vérifications',
    description: 'Affichage mobile, formulaires, performances, référencement : nous testons tout.',
    statuses: ['verification', 'internal_review', 'approved', 'ready_to_publish'],
  },
  {
    key: 'deploying',
    label: 'Mise en ligne',
    description: 'Le site est déployé sur son infrastructure et relié à votre domaine, en HTTPS.',
    statuses: ['deploying', 'published'],
  },
  {
    key: 'delivered',
    label: 'Livraison',
    description:
      'Nous vous confions votre site : vous le gérez depuis StaX, la maintenance mensuelle commence.',
    statuses: ['delivered', 'maintenance'],
  },
];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  ordered: 'Commande validée',
  questionnaire_pending: 'Informations attendues',
  assets_pending: 'Éléments attendus',
  design: 'Conception en cours',
  development: 'Développement en cours',
  verification: 'Vérifications en cours',
  deploying: 'Mise en ligne en cours',
  delivered: 'Site livré',
  in_progress: 'Création en cours',
  internal_review: 'Relecture interne',
  client_review: 'Votre validation est attendue',
  changes_requested: 'Corrections en cours',
  approved: 'Validé',
  ready_to_publish: 'Prêt à mettre en ligne',
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
