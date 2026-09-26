'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Dialog, Field, Textarea } from '@stax/ui';
import { renewProposalAction, withdrawProposalAction, type ProposalActionState } from './actions';
import { CodeHandOff } from './proposal-form';

/** Relancer (nouveau délai, rappel par e-mail) ou retirer une proposition. */
export function ProposalRowActions({
  proposalId,
  companyName,
  canRenew,
  canWithdraw,
}: {
  proposalId: string;
  companyName: string;
  canRenew: boolean;
  canWithdraw: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ProposalActionState | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');

  if (!canRenew && !canWithdraw) return null;

  const renew = () =>
    startTransition(() => {
      void renewProposalAction({ proposalId }).then((next) => {
        setResult(next);
        router.refresh();
      });
    });

  const withdraw = () =>
    startTransition(() => {
      void withdrawProposalAction({ proposalId, reason: reason || undefined }).then((next) => {
        setConfirming(false);
        setResult(next);
        router.refresh();
      });
    });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {canRenew ? (
          <Button size="sm" variant="secondary" loading={pending} onClick={renew}>
            Relancer (+14 jours)
          </Button>
        ) : null}
        {canWithdraw ? (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(true)}>
            Retirer
          </Button>
        ) : null}
      </div>

      {result?.message ? (
        <Alert tone={result.status === 'error' ? 'danger' : 'success'} live="status">
          {result.message}
          {result.code ? <CodeHandOff code={result.code} claimUrl={result.claimUrl} /> : null}
        </Alert>
      ) : null}

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        dismissible={!pending}
        size="sm"
        title={`Retirer la proposition « ${companyName} » ?`}
        description="Le code cesse de fonctionner. Si le prospect avait déjà récupéré le site, il n’y a plus accès. Rien n’est effacé : le site, le compte du prospect et l’historique restent."
        footer={
          <>
            <Button variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
              Annuler
            </Button>
            <Button variant="danger" loading={pending} onClick={withdraw}>
              Retirer la proposition
            </Button>
          </>
        }
      >
        <Field label="Motif (facultatif)" hint="Visible dans le journal, jamais par le prospect.">
          <Textarea
            rows={2}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
      </Dialog>
    </div>
  );
}
