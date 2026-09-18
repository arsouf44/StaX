import type { Metadata } from 'next';
import Link from 'next/link';
import { unwrapList } from '@stax/database';
import { legalValue } from '@stax/config';
import { Panel } from '@stax/ui';
import type { StatusTone } from '@stax/ui';
import { PageHeader } from '~/components/app/page-header';
import { getWorkspace } from '~/lib/workspace';
import { SupportForms } from './support-forms';

export const metadata: Metadata = { title: 'Aide & support' };

const STATUS_LABELS: Record<string, { label: string; tone: StatusTone }> = {
  open: { label: 'Ouverte', tone: 'accent' },
  waiting_support: { label: 'Chez nous', tone: 'info' },
  waiting_customer: { label: 'En attente de votre réponse', tone: 'warning' },
  resolved: { label: 'Résolue', tone: 'success' },
  closed: { label: 'Close', tone: 'neutral' },
};

export default async function SupportPage() {
  const { db } = await getWorkspace();
  const support = legalValue('SUPPORT_EMAIL');

  const tickets = unwrapList<{
    id: string;
    reference: string;
    subject: string;
    status: string;
    created_at: string;
  }>(
    (await db
      .from('support_tickets')
      .select('id, reference, subject, status, created_at')
      .order('created_at', { ascending: false })
      .limit(30)) as never,
  );

  return (
    <>
      <PageHeader
        title="Aide & support"
        description="Écrivez-nous depuis votre espace : votre message arrive avec le contexte de votre site, ce qui nous fait gagner un aller-retour."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
        <SupportForms
          tickets={tickets.map((ticket) => ({
            id: ticket.id,
            reference: ticket.reference,
            subject: ticket.subject,
            status: ticket.status,
            statusLabel: STATUS_LABELS[ticket.status]?.label ?? ticket.status,
            statusTone: STATUS_LABELS[ticket.status]?.tone ?? 'neutral',
            createdAt: ticket.created_at,
          }))}
        />

        <aside className="space-y-4">
          <Panel level={1} padding="md">
            <h2 className="text-sm font-medium">Nos délais</h2>
            <ul className="mt-2 space-y-1.5 text-sm text-[var(--foreground-muted)]">
              <li>Une réponse sous un jour ouvré.</li>
              <li>Site inaccessible : traitement immédiat.</li>
              <li>Demande de modification : sous deux jours ouvrés.</li>
            </ul>
            <p className="mt-3 text-xs text-[var(--muted)]">
              Ce sont nos engagements de service, pas des moyennes mesurées. Nous publierons des
              chiffres réels quand nous en aurons assez pour qu’ils veuillent dire quelque chose.
            </p>
          </Panel>

          <Panel level={1} padding="md">
            <h2 className="text-sm font-medium">Avant d’écrire</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
              Beaucoup de questions trouvent leur réponse dans le{' '}
              <Link href="/aide" className="underline underline-offset-4">
                centre d’aide
              </Link>{' '}
              ou la{' '}
              <Link href="/faq" className="underline underline-offset-4">
                foire aux questions
              </Link>
              .
            </p>
          </Panel>

          <Panel level={1} padding="md">
            <h2 className="text-sm font-medium">Autrement</h2>
            <p className="mt-2 text-sm break-all text-[var(--foreground-muted)]">
              <a href={`mailto:${support}`} className="underline underline-offset-4">
                {support}
              </a>
            </p>
            <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
              Passer par votre espace reste plus efficace : nous voyons immédiatement de quel site
              vous parlez.
            </p>
          </Panel>
        </aside>
      </div>
    </>
  );
}
