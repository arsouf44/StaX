import type { Metadata } from 'next';
import { unwrapList } from '@stax/database';
import { requireAdminRole } from '~/lib/admin';
import { BreachRegister, type BreachView } from './breach-panel';

export const metadata: Metadata = { title: 'Registre des violations' };

/**
 * Registre des violations de donnees (RGPD art. 33.5).
 *
 * Reserve a l'administration de la plateforme : ce registre decrit nos propres
 * failles, leur portee et ce qui a ete fait. La RLS l'applique de toute facon.
 */

const DATE_TIME = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

export default async function Page() {
  const { db } = await requireAdminRole('platform_admin');

  const rows = unwrapList<{
    id: string;
    reference: string;
    nature: string;
    description: string;
    discovered_at: string;
    notify_deadline_at: string;
    risk_level: BreachView['riskLevel'];
    subject_categories: string[] | null;
    data_categories: string[] | null;
    approximate_subjects: number | null;
    cnil_notified_at: string | null;
    subjects_notified_at: string | null;
    closed_at: string | null;
  }>(
    (await db
      .from('data_breaches')
      .select(
        'id, reference, nature, description, discovered_at, notify_deadline_at, risk_level, ' +
          'subject_categories, data_categories, approximate_subjects, cnil_notified_at, ' +
          'subjects_notified_at, closed_at',
      )
      .order('discovered_at', { ascending: false })
      .limit(100)) as never,
  );

  // Le compte a rebours est calcule COTE SERVEUR : l'horloge d'un poste peut
  // etre fausse, et se tromper de quelques heures sur ce delai-la se paie.
  const now = new Date().getTime();

  const breaches: BreachView[] = rows.map((row) => ({
    id: row.id,
    reference: row.reference,
    nature: row.nature,
    description: row.description,
    discoveredLabel: DATE_TIME.format(new Date(row.discovered_at)),
    deadlineLabel: DATE_TIME.format(new Date(row.notify_deadline_at)),
    hoursLeft: Math.trunc((new Date(row.notify_deadline_at).getTime() - now) / 3_600_000),
    riskLevel: row.risk_level,
    subjectCategories: row.subject_categories ?? [],
    dataCategories: row.data_categories ?? [],
    approximateSubjects: row.approximate_subjects,
    cnilNotifiedLabel: row.cnil_notified_at
      ? DATE_TIME.format(new Date(row.cnil_notified_at))
      : null,
    subjectsNotifiedLabel: row.subjects_notified_at
      ? DATE_TIME.format(new Date(row.subjects_notified_at))
      : null,
    closedLabel: row.closed_at ? DATE_TIME.format(new Date(row.closed_at)) : null,
  }));

  return <BreachRegister breaches={breaches} />;
}
