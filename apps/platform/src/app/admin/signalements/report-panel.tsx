'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  Dialog,
  Field,
  Panel,
  StatusPill,
  Textarea,
  type StatusTone,
  useToast,
} from '@stax/ui';
import { decideContentReportAction } from './actions';

/**
 * Signalements de contenus.
 *
 * Chaque decision est prise par une personne et motivee : le motif part tel
 * quel a l'auteur du signalement et, en cas de retrait, a l'editeur du site.
 */

export interface ContentReportView {
  id: string;
  reference: string;
  url: string;
  category: string;
  categoryLabel: string;
  explanation: string;
  reporter: string;
  status: string;
  decision: string | null;
  siteName: string | null;
  receivedLabel: string;
}

const RECEIVED: { label: string; tone: StatusTone } = { label: 'À examiner', tone: 'warning' };

const STATUS: Record<string, { label: string; tone: StatusTone }> = {
  received: RECEIVED,
  reviewing: { label: 'En cours d’examen', tone: 'accent' },
  actioned: { label: 'Contenu restreint', tone: 'danger' },
  rejected: { label: 'Non retenu', tone: 'neutral' },
};

type Outcome = 'actioned' | 'rejected';

export function ContentReportPanel({
  reports,
  canDecide,
}: {
  reports: ContentReportView[];
  canDecide: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [deciding, setDeciding] = useState<{ report: ContentReportView; outcome: Outcome } | null>(
    null,
  );
  const [decision, setDecision] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (id: string, outcome: Outcome | 'reviewing', text?: string) => {
    setError(null);
    startTransition(() => {
      void decideContentReportAction({ id, outcome, decision: text }).then((result) => {
        if (result.status === 'error') {
          if (outcome === 'reviewing') toast.error(result.message ?? 'Action refusée.');
          else setError(result.message ?? 'Action refusée.');
          return;
        }
        if (result.message) toast.success(result.message);
        setDeciding(null);
        router.refresh();
      });
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium tracking-[-0.02em]">Signalements de contenus</h1>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-[var(--foreground-muted)]">
          Contenus signalés comme illicites sur les sites hébergés. Chaque signalement reçoit une
          décision humaine et motivée, communiquée à son auteur et, en cas de retrait, à l’éditeur
          du site. Un contenu manifestement illicite doit être retiré promptement.
        </p>
      </div>

      {reports.length === 0 ? (
        <Panel level={1} padding="lg">
          <p className="text-sm text-[var(--foreground-muted)]">Aucun signalement reçu.</p>
        </Panel>
      ) : (
        <ul className="space-y-4">
          {reports.map((report) => {
            const status = STATUS[report.status] ?? RECEIVED;
            const open = report.status === 'received' || report.status === 'reviewing';
            return (
              <li key={report.id}>
                <Panel level={1} padding="lg">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-medium">{report.reference}</span>
                    <StatusPill tone={status.tone}>{status.label}</StatusPill>
                    <StatusPill tone={report.category === 'child_abuse' ? 'danger' : 'neutral'}>
                      {report.categoryLabel}
                    </StatusPill>
                  </p>
                  <p className="mt-2 text-sm break-all">
                    <a
                      href={report.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="underline underline-offset-4"
                    >
                      {report.url}
                    </a>
                    {report.siteName ? (
                      <span className="text-[var(--muted)]"> · {report.siteName}</span>
                    ) : (
                      <span className="text-[var(--muted)]"> · site non hébergé par StaX</span>
                    )}
                  </p>
                  <p className="mt-4 max-w-prose text-sm leading-relaxed whitespace-pre-line">
                    {report.explanation}
                  </p>
                  <p className="mt-3 text-xs text-[var(--muted)]">
                    {report.reporter} · reçu le {report.receivedLabel}
                  </p>
                  {report.decision ? (
                    <p className="mt-3 border-l-2 border-[var(--border-strong)] pl-3 text-sm text-[var(--foreground-muted)]">
                      {report.decision}
                    </p>
                  ) : null}

                  {open && canDecide ? (
                    <div className="mt-5 flex flex-wrap gap-2">
                      {report.status === 'received' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                          onClick={() => submit(report.id, 'reviewing')}
                        >
                          Prendre en charge
                        </Button>
                      ) : null}
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={pending}
                        onClick={() => {
                          setDecision('');
                          setError(null);
                          setDeciding({ report, outcome: 'actioned' });
                        }}
                      >
                        Restreindre le contenu
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={pending}
                        onClick={() => {
                          setDecision('');
                          setError(null);
                          setDeciding({ report, outcome: 'rejected' });
                        }}
                      >
                        Ne pas donner suite
                      </Button>
                    </div>
                  ) : null}
                </Panel>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        open={deciding !== null}
        onClose={() => setDeciding(null)}
        size="md"
        title={deciding?.outcome === 'actioned' ? 'Restreindre le contenu' : 'Ne pas donner suite'}
        description={
          deciding?.outcome === 'actioned'
            ? 'Retirez ou masquez d’abord le contenu (ou suspendez le site), puis motivez la décision. Les motifs sont envoyés à l’auteur du signalement et à l’éditeur du site.'
            : 'Motivez la décision : les motifs sont envoyés à l’auteur du signalement.'
        }
        footer={
          <>
            <Button variant="ghost" disabled={pending} onClick={() => setDeciding(null)}>
              Annuler
            </Button>
            <Button
              variant={deciding?.outcome === 'actioned' ? 'danger' : 'primary'}
              loading={pending}
              onClick={() => {
                if (deciding) submit(deciding.report.id, deciding.outcome, decision.trim());
              }}
            >
              Enregistrer et informer
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error ? (
            <Alert tone="danger" live="alert">
              {error}
            </Alert>
          ) : null}
          <Field
            label="Motifs de la décision"
            required
            hint="Les faits constatés, la règle en cause, et ce qui a été fait."
          >
            <Textarea
              value={decision}
              rows={5}
              maxLength={4000}
              onChange={(event) => setDecision(event.target.value)}
            />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
