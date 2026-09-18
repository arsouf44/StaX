/**
 * Vocabulaire affiche aux clients.
 *
 * Aucun libelle technique ne doit atteindre l'ecran d'un client : il lit
 * « En attente de votre confirmation », jamais `pending`. Ces tables vivent ici
 * pour que l'espace client, le back-office et les sites publics disent
 * exactement la meme chose du meme etat.
 */

export type LabelTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

export interface StatusLabel {
  label: string;
  tone: LabelTone;
  /** Phrase d'explication, quand l'etat merite d'etre justifie. */
  help?: string;
}

export const BOOKING_STATUS_LABELS = {
  pending: {
    label: 'À confirmer',
    tone: 'warning',
    help: 'Le client attend votre réponse.',
  },
  confirmed: { label: 'Confirmée', tone: 'success', help: 'Le client a reçu la confirmation.' },
  seated: { label: 'En cours', tone: 'info' },
  completed: { label: 'Honorée', tone: 'neutral' },
  cancelled: { label: 'Annulée', tone: 'neutral' },
  no_show: { label: 'Non présenté', tone: 'danger' },
} as const satisfies Record<string, StatusLabel>;

export const SHOP_ORDER_STATUS_LABELS = {
  pending: { label: 'Nouvelle', tone: 'info' },
  awaiting_payment: {
    label: 'En attente de paiement',
    tone: 'warning',
    help: 'La commande n’est pas encore réglée.',
  },
  paid: { label: 'Payée', tone: 'success', help: 'Le paiement est confirmé par Stripe.' },
  preparing: { label: 'En préparation', tone: 'accent' },
  fulfilled: { label: 'Livrée', tone: 'neutral' },
  cancelled: { label: 'Annulée', tone: 'neutral' },
  refunded: { label: 'Remboursée', tone: 'neutral' },
} as const satisfies Record<string, StatusLabel>;

export const CONTACT_STATUS_LABELS = {
  new: { label: 'Nouveau', tone: 'accent' },
  contacted: { label: 'Contacté', tone: 'info' },
  qualified: { label: 'Intéressé', tone: 'warning' },
  won: { label: 'Client', tone: 'success' },
  lost: { label: 'Sans suite', tone: 'neutral' },
} as const satisfies Record<string, StatusLabel>;

export const SUBMISSION_STATUS_LABELS = {
  unread: { label: 'Non lu', tone: 'accent' },
  read: { label: 'Lu', tone: 'neutral' },
  archived: { label: 'Archivé', tone: 'neutral' },
  spam: { label: 'Indésirable', tone: 'danger' },
} as const satisfies Record<string, StatusLabel>;

export const FORM_KIND_LABELS: Record<string, string> = {
  contact: 'Contact',
  quote: 'Demande de devis',
  reservation: 'Réservation',
  newsletter: 'Inscription à la lettre d’information',
  callback: 'Demande de rappel',
  application: 'Candidature',
  custom: 'Formulaire libre',
};

export const FULFILLMENT_LABELS: Record<string, string> = {
  pickup: 'Retrait sur place',
  delivery: 'Livraison locale',
  shipping: 'Expédition',
  digital: 'Produit numérique',
};

/** Libelle d'un etat inconnu : on montre l'etat brut plutot que rien. */
export function statusLabel(
  table: Record<string, StatusLabel>,
  value: string | null | undefined,
): StatusLabel {
  if (!value) return { label: '—', tone: 'neutral' };
  return table[value] ?? { label: value, tone: 'neutral' };
}

/**
 * Transitions autorisees depuis l'espace client.
 *
 * Elles decrivent ce qu'un professionnel peut faire de ses propres
 * reservations. Un etat comme « payée » n'y figure pas : il vient d'un webhook
 * Stripe signe, jamais d'un clic.
 */
export const BOOKING_TRANSITIONS: Record<string, readonly string[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['seated', 'completed', 'cancelled', 'no_show'],
  seated: ['completed', 'no_show'],
  completed: [],
  cancelled: [],
  no_show: [],
};

/**
 * Transitions autorisees sur une commande de boutique.
 *
 * `paid` et `refunded` sont absents de toutes les listes : seul un evenement
 * Stripe verifie peut les produire. Un commercant ne peut pas declarer une
 * commande payée depuis son navigateur.
 */
export const SHOP_ORDER_TRANSITIONS: Record<string, readonly string[]> = {
  pending: ['cancelled'],
  awaiting_payment: ['cancelled'],
  paid: ['preparing', 'fulfilled'],
  preparing: ['fulfilled'],
  fulfilled: [],
  cancelled: [],
  refunded: [],
};
