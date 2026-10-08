import 'server-only';
import { emailSettings, platformUrl } from '@nemasus/config';
import type { Db } from '@nemasus/database';
import { sendEmail, siteMonthlyReportEmail, type MonthlyReportFigures } from '@nemasus/emails';
import { formatMoney } from '@nemasus/payments';

/**
 * Bilan mensuel des sites livrés (tâche de fond).
 *
 * Le 1er du mois, à partir de 8 h (heure de Paris), chaque site livré reçoit
 * le bilan du mois écoulé. Un bilan part une seule fois (la base refuse le
 * second) ; s'il n'a pu partir chez aucun destinataire, rien n'est inscrit et
 * la tâche suivante réessaie.
 *
 * Sans vrai fournisseur d'e-mails, rien ne part et rien n'est inscrit : le
 * bilan du mois partira dès que le fournisseur sera configuré.
 */

export function realEmailProvider(): boolean {
  return emailSettings().provider !== 'console';
}

/** Mois à couvrir (AAAA-MM-01) et s'il est déjà l'heure de l'envoyer. */
export function reportMonth(now: Date): { month: string; ready: boolean } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Paris',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  const year = Number(parts['year']);
  const month = Number(parts['month']);
  const previousYear = month === 1 ? year - 1 : year;
  const previousMonth = month === 1 ? 12 : month - 1;
  return {
    month: `${previousYear}-${String(previousMonth).padStart(2, '0')}-01`,
    ready: !(Number(parts['day']) === 1 && Number(parts['hour']) < 8),
  };
}

interface Payload {
  siteId: string;
  siteName: string;
  month: string;
  current: {
    visitors: number;
    pageviews: number;
    contacts: number;
    orders: number;
    revenueCents: number;
    days: number;
  };
  previous: { visitors: number; contacts: number; days: number };
  health: { checks: number; uptimeBps: number | null; avgResponseMs: number | null } | null;
  quality: { score: number; maxScore: number } | null;
  topPages: Array<{ path: string; views: number }>;
  topSources: Array<{ source: string; visits: number }>;
  recipients: Array<{ email: string; firstName: string | null }>;
}

export function figuresFrom(payload: Payload): MonthlyReportFigures {
  const measuredBefore = payload.previous.days > 0;
  return {
    siteName: payload.siteName,
    month: payload.month,
    visitors: payload.current.visitors,
    pageviews: payload.current.pageviews,
    contacts: payload.current.contacts,
    orders: payload.current.orders,
    revenueLabel:
      payload.current.orders > 0 ? formatMoney(payload.current.revenueCents, 'EUR') : null,
    previousVisitors: measuredBefore ? payload.previous.visitors : null,
    previousContacts: measuredBefore ? payload.previous.contacts : null,
    uptimeBps: payload.health && payload.health.checks > 0 ? payload.health.uptimeBps : null,
    avgResponseMs:
      payload.health && payload.health.checks > 0 ? payload.health.avgResponseMs : null,
    qualityScore:
      payload.quality && payload.quality.maxScore > 0
        ? Math.round((payload.quality.score / payload.quality.maxScore) * 100)
        : null,
    topPages: payload.topPages,
    topSources: payload.topSources,
  };
}

export async function sendMonthlyReports(
  db: Db,
  options: { now?: Date; limit?: number } = {},
): Promise<{ sent: number; skipped: number; failed: number; waiting: boolean }> {
  const outcome = { sent: 0, skipped: 0, failed: 0, waiting: false };
  const { month, ready } = reportMonth(options.now ?? new Date());
  if (!ready || !realEmailProvider()) {
    outcome.waiting = true;
    return outcome;
  }

  const { data: due, error } = await db.rpc('sites_due_for_monthly_report', {
    p_month: month,
    p_limit: options.limit ?? 5,
  });
  if (error) throw new Error(error.message);

  for (const row of (due ?? []) as Array<{ site_id: string }>) {
    const { data, error: payloadError } = await db.rpc('monthly_report_payload', {
      p_site: row.site_id,
      p_month: month,
    });
    if (payloadError || !data) continue;
    const payload = data as Payload;
    const figures = figuresFrom(payload);

    if (payload.recipients.length === 0) {
      await db.rpc('record_monthly_report', {
        p_site: row.site_id,
        p_month: month,
        p_status: 'skipped',
        p_recipients: 0,
        p_summary: figures,
        p_error: 'Aucun destinataire (bilan refusé ou aucun responsable).',
      });
      outcome.skipped += 1;
      continue;
    }

    let delivered = 0;
    for (const person of payload.recipients) {
      const result = await sendEmail(
        siteMonthlyReportEmail({
          to: person.email,
          firstName: person.firstName,
          figures,
          appUrl: `${platformUrl()}/app/statistiques`,
          preferencesUrl: `${platformUrl()}/app/compte`,
        }),
        { db, siteId: row.site_id },
      );
      if (result.ok) delivered += 1;
    }

    if (delivered === 0) {
      // Rien n'est inscrit : la tâche suivante réessaiera.
      outcome.failed += 1;
      continue;
    }
    await db.rpc('record_monthly_report', {
      p_site: row.site_id,
      p_month: month,
      p_status: 'sent',
      p_recipients: delivered,
      p_summary: figures,
      p_error: null,
    });
    outcome.sent += 1;
  }
  return outcome;
}
