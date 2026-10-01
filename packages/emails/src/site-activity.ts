import type { SupabaseClient } from '@supabase/supabase-js';
import { isProduction } from '@nemasus/config';
import { formatMoney } from '@nemasus/payments/money';
import type { Cents } from '@nemasus/types';
import { getEmailProvider, type EmailMessage } from './provider';
import { sendEmail } from './send';
import { newBookingEmail, newMessageEmail, newShopOrderEmail } from './templates';

/**
 * Le commerçant est prévenu de ce qui arrive par son site : un message laissé
 * par un formulaire, une demande de réservation, une commande payée.
 *
 * La base dit ce qui reste à signaler et à qui (`site_activity_to_notify`,
 * migration 0065) ; ce module réserve chaque élément, écrit les e-mails, les
 * envoie, et libère l'élément si aucun destinataire ne l'a reçu. Appelé par
 * le moteur des sites juste après l'enregistrement, et par la tâche de fond
 * de la plateforme pour rattraper ce qui n'a pas pu partir.
 */

export interface SiteActivityItem {
  kind: 'message' | 'booking' | 'order';
  id: string;
  happenedAt: string;
  siteId: string;
  siteName: string;
  organizationId: string;
  timezone: string | null;
  detail: Record<string, unknown>;
  recipients: string[];
}

const text = (value: unknown, fallback = ''): string =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

const email = (value: unknown): string | null => {
  const candidate = text(value).toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(candidate) ? candidate : null;
};

function dateLabel(iso: unknown, timezone: string | null): string {
  const date = new Date(text(iso));
  if (Number.isNaN(date.getTime())) return 'date à confirmer';
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: timezone ?? 'Europe/Paris',
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: 'Europe/Paris',
    }).format(date);
  }
}

/** Les e-mails d'un élément, un par destinataire. */
export function siteActivityEmails(item: SiteActivityItem, appUrl: string): EmailMessage[] {
  const base = appUrl.replace(/\/+$/, '');
  const detail = item.detail;
  const replyTo = email(detail['replyTo']);
  return item.recipients.map((to) => {
    if (item.kind === 'message') {
      return newMessageEmail({
        to,
        siteName: item.siteName,
        senderName: text(detail['senderName'], 'Un visiteur'),
        excerpt: text(detail['excerpt']),
        formName: text(detail['formName']) || null,
        inboxUrl: `${base}/app/messages`,
        replyTo,
      });
    }
    if (item.kind === 'booking') {
      const partySize = Number(detail['partySize']);
      return newBookingEmail({
        to,
        siteName: item.siteName,
        customerName: text(detail['customerName'], 'Un client'),
        dateLabel: dateLabel(detail['startsAt'], item.timezone),
        partySize: Number.isInteger(partySize) && partySize > 0 ? partySize : 1,
        serviceName: text(detail['serviceName']) || null,
        needsAnswer: detail['needsAnswer'] !== false,
        bookingsUrl: `${base}/app/reservations`,
        replyTo,
      });
    }
    const cents = Number(detail['totalCents']);
    return newShopOrderEmail({
      to,
      siteName: item.siteName,
      reference: text(detail['reference'], '—'),
      customerName: text(detail['customerName'], 'Un client'),
      total: Number.isInteger(cents) ? formatMoney(cents as Cents, 'EUR') : '—',
      ordersUrl: `${base}/app/commandes`,
      replyTo,
    });
  });
}

export interface SiteActivityOutcome {
  sent: number;
  failed: number;
  skipped: number;
}

export async function notifySiteActivity(
  db: SupabaseClient,
  options: { appUrl: string; siteId?: string; limit?: number; minAgeSeconds?: number },
): Promise<SiteActivityOutcome> {
  const outcome: SiteActivityOutcome = { sent: 0, failed: 0, skipped: 0 };
  // En production, sans vrai fournisseur (Worker sans `EMAIL_*`, Resend pas
  // encore branché), un e-mail « envoyé » dans la console serait marqué comme
  // reçu et perdu. On n'envoie rien : la plateforme, ou le prochain passage
  // une fois le fournisseur configuré, s'en chargera (48 heures au plus).
  if (isProduction() && getEmailProvider().name === 'console') return outcome;
  const { data, error } = await db.rpc('site_activity_to_notify', {
    p_site: options.siteId ?? null,
    p_limit: options.limit ?? 20,
    p_min_age_seconds: options.minAgeSeconds ?? 0,
  });
  // Fonction absente (migration 0065 pas encore appliquée) : rien à faire.
  if (error || !Array.isArray(data)) return outcome;

  for (const item of data as SiteActivityItem[]) {
    // Réservé AVANT l'envoi : un envoi concurrent (autre message arrivé en
    // même temps, tâche de fond) ne préviendra pas une seconde fois.
    const claim = await db.rpc('mark_site_activity_notified', {
      p_kind: item.kind,
      p_id: item.id,
    });
    if (claim.error || claim.data !== true) continue;

    const messages = siteActivityEmails(item, options.appUrl);
    if (messages.length === 0) {
      // Personne à prévenir (aucun responsable) : inutile de réessayer.
      outcome.skipped += 1;
      continue;
    }
    let delivered = 0;
    for (const message of messages) {
      const result = await sendEmail(message, {
        db,
        organizationId: item.organizationId,
        siteId: item.siteId,
      }).catch(() => ({ ok: false }));
      if (result.ok) delivered += 1;
    }
    if (delivered === 0) {
      // Libéré : la prochaine tâche de fond réessaiera.
      await db.rpc('release_site_activity', { p_kind: item.kind, p_id: item.id });
      outcome.failed += 1;
      continue;
    }
    outcome.sent += 1;
  }
  return outcome;
}
