'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  Dialog,
  Field,
  Input,
  Panel,
  Select,
  StatusPill,
  Textarea,
  type StatusTone,
  useToast,
} from '@stax/ui';
import type { ActionState } from '~/lib/form-state';
import { resolvePrivacyRequestAction, verifyRequesterIdentityAction } from './actions';

/**
 * Demandes en cours.
 *
 * L'interface impose l'ordre : verifier l'identite, puis traiter. Ce n'est pas
 * de la rigidite — livrer des donnees a qui n'a pas prouve etre la personne
 * concernee, c'est commettre la violation qu'on croyait eviter.
 */

export interface PrivacyRequestView {
  id: string;
  reference: string;
  kind: string;
  kindLabel: string;
  status: string;
  requesterEmail: string;
  organizationName: string | null;
  details: string | null;
  receivedLabel: string;
  dueLabel: string;
  /** Jours restants, calcules cote serveur. Negatif = delai depasse. */
  daysLeft: number;
  identityVerified: boolean;
}

function deadline(daysLeft: number): { label: string; tone: StatusTone } {
  if (daysLeft < 0) return { label: `En retard de ${Math.abs(daysLeft)} j`, tone: 'danger' };
  if (daysLeft <= 7) return { label: `${daysLeft} j restants`, tone: 'danger' };
  return { label: `${daysLeft} j restants`, tone: 'warning' };
}

export function PrivacyRequestPanel({ requests }: { requests: PrivacyRequestView[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [verifying, setVerifying] = useState<PrivacyRequestView | null>(null);
  const [method, setMethod] = useState('');
  const [resolving, setResolving] = useState<PrivacyRequestView | null>(null);
  const [outcome, setOutcome] = useState<'completed' | 'refused'>('completed');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const announce = (result: ActionState) => {
    if (result.status === 'error') toast.error(result.message ?? 'Action refusée.');
    else if (result.message) toast.success(result.message);
  };

  if (requests.length === 0) {
    return (
      <Panel level={1} padding="lg">
        <h2 className="text-sm font-medium">Demandes à traiter</h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
          Aucune demande en attente. Le règlement impose une réponse sous un mois : les demandes
          apparaissent ici dès leur dépôt, triées par échéance.
        </p>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-medium">Demandes à traiter</h2>

      <ul className="space-y-4">
        {requests.map((request) => {
          const clock = deadline(request.daysLeft);
          return (
            <li key={request.id}>
              <Panel level={1} padding="lg">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-medium">{request.reference}</span>
                      <StatusPill tone="accent">{request.kindLabel}</StatusPill>
                      <StatusPill tone={clock.tone}>{clock.label}</StatusPill>
                      {request.identityVerified ? (
                        <StatusPill tone="success">Identité vérifiée</StatusPill>
                      ) : (
                        <StatusPill tone="warning">Identité à vérifier</StatusPill>
                      )}
                    </p>
                    <p className="mt-2 text-sm text-[var(--foreground-muted)]">
                      {request.requesterEmail}
                      {request.organizationName ? ` · ${request.organizationName}` : ''}
                    </p>
                  </div>
                </div>

                {request.details ? (
                  <p className="mt-4 max-w-prose text-sm leading-relaxed">{request.details}</p>
                ) : null}

                <p className="mt-3 text-xs text-[var(--muted)]">
                  Reçue le {request.receivedLabel} · réponse due le {request.dueLabel}
                </p>

                <div className="mt-5 flex flex-wrap gap-2">
                  {request.identityVerified ? null : (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={pending}
                      onClick={() => {
                        setMethod('');
                        setError(null);
                        setVerifying(request);
                      }}
                    >
                      Vérifier l’identité
                    </Button>
                  )}
                  <Button
                    variant={request.identityVerified ? 'secondary' : 'ghost'}
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      setOutcome('completed');
                      setNote('');
                      setError(null);
                      setResolving(request);
                    }}
                  >
                    Répondre
                  </Button>
                </div>
              </Panel>
            </li>
          );
        })}
      </ul>

      <Dialog
        open={verifying !== null}
        onClose={() => setVerifying(null)}
        size="sm"
        title="Vérification de l’identité"
        description="Décrivez comment vous vous êtes assuré que le demandeur est bien la personne concernée."
        footer={
          <>
            <Button variant="ghost" disabled={pending} onClick={() => setVerifying(null)}>
              Annuler
            </Button>
            <Button
              loading={pending}
              onClick={() => {
                if (!verifying) return;
                setError(null);
                startTransition(() => {
                  void verifyRequesterIdentityAction({
                    id: verifying.id,
                    method: method.trim(),
                  }).then((result) => {
                    if (result.status === 'error') {
                      setError(result.message ?? 'Refusé.');
                      return;
                    }
                    announce(result);
                    setVerifying(null);
                    router.refresh();
                  });
                });
              }}
            >
              Enregistrer
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
            label="Méthode de vérification"
            required
            hint="Demande envoyée depuis l’adresse du compte, appel de rappel, pièce justificative…"
          >
            <Input value={method} maxLength={300} onChange={(e) => setMethod(e.target.value)} />
          </Field>
        </div>
      </Dialog>

      <Dialog
        open={resolving !== null}
        onClose={() => setResolving(null)}
        title={`Répondre — ${resolving?.reference ?? ''}`}
        description="Cette réponse est due à la personne. Elle sera relue en cas de réclamation auprès de la CNIL."
        footer={
          <>
            <Button variant="ghost" disabled={pending} onClick={() => setResolving(null)}>
              Annuler
            </Button>
            <Button
              loading={pending}
              onClick={() => {
                if (!resolving) return;
                setError(null);
                startTransition(() => {
                  void resolvePrivacyRequestAction({
                    id: resolving.id,
                    outcome,
                    note: note.trim(),
                  }).then((result) => {
                    if (result.status === 'error') {
                      setError(result.message ?? 'Refusé.');
                      return;
                    }
                    announce(result);
                    setResolving(null);
                    router.refresh();
                  });
                });
              }}
            >
              Enregistrer
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

          {resolving && !resolving.identityVerified ? (
            <Alert tone="warning" live="status" title="Identité non vérifiée">
              Une demande ne peut pas être marquée traitée tant que l’identité n’est pas vérifiée.
              Seul un refus motivé reste possible.
            </Alert>
          ) : null}

          <Field label="Issue">
            <Select
              value={outcome}
              onChange={(event) => setOutcome(event.target.value as 'completed' | 'refused')}
            >
              <option value="completed">Traitée</option>
              <option value="refused">Refusée</option>
            </Select>
          </Field>

          <Field
            label={outcome === 'refused' ? 'Motif du refus' : 'Ce qui a été fait'}
            required
            hint={
              outcome === 'refused'
                ? 'La personne doit être informée du motif et de son droit de saisir la CNIL.'
                : 'Données exportées, comptes effacés, corrections apportées…'
            }
          >
            <Textarea
              rows={4}
              value={note}
              minLength={10}
              maxLength={2000}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
