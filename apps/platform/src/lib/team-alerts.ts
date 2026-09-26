import 'server-only';
import { isLegalValueConfigured, legalValue, readEnv } from '@stax/config';
import type { Db } from '@stax/database';
import { internalLeadEmail, sendEmail, staffAlertEmail } from '@stax/emails';
import { absolutePlatformUrl } from './action-guard';

/**
 * Alertes internes à l'équipe StaX.
 *
 * Un client qui écrit, un prospect qui récupère son site, un paiement reçu :
 * l'équipe doit le savoir sans avoir à surveiller l'administration. Les
 * alertes partent à l'adresse de support publiée (`SUPPORT_EMAIL`), à défaut à
 * `ADMIN_EMAIL`. Sans l'une ni l'autre, rien n'est envoyé — et rien n'échoue :
 * une alerte manquée ne doit jamais faire échouer l'action du client.
 */

export function teamInboxAddress(): string | null {
  if (isLegalValueConfigured('SUPPORT_EMAIL')) return legalValue('SUPPORT_EMAIL');
  return readEnv('ADMIN_EMAIL') ?? null;
}

export async function alertTeam(
  alert: {
    subject: string;
    heading: string;
    lines: ReadonlyArray<[string, string]>;
    excerpt?: string | null;
    /** Chemin de l'administration à ouvrir, par exemple `/admin/messages`. */
    path: string;
    actionLabel?: string;
  },
  options: { db?: Db; organizationId?: string; siteId?: string } = {},
): Promise<void> {
  const to = teamInboxAddress();
  if (!to) return;
  try {
    await sendEmail(
      staffAlertEmail({
        to,
        subject: alert.subject,
        heading: alert.heading,
        lines: alert.lines,
        excerpt: alert.excerpt ?? null,
        actionUrl: absolutePlatformUrl(alert.path),
        actionLabel: alert.actionLabel,
      }),
      options,
    );
  } catch (error) {
    console.error('[stax:team-alert]', error instanceof Error ? error.message : error);
  }
}

/**
 * Demande de contact ou de devis du site public. « Répondre » dans la
 * messagerie de l'équipe répond directement à la personne.
 */
export async function alertTeamOfLead(lead: {
  kind: 'contact' | 'quote';
  name: string;
  email: string;
  summary: string;
}): Promise<void> {
  const to = teamInboxAddress();
  if (!to) return;
  try {
    const message = internalLeadEmail({
      to,
      kind: lead.kind,
      name: lead.name,
      email: lead.email,
      summary: lead.summary,
      adminUrl: absolutePlatformUrl(lead.kind === 'quote' ? '/admin/devis' : '/admin'),
    });
    await sendEmail({ ...message, replyTo: lead.email });
  } catch (error) {
    console.error('[stax:team-alert] demande', error instanceof Error ? error.message : error);
  }
}
