'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  ConfirmDialog,
  Field,
  Input,
  Panel,
  Select,
  StatusPill,
  useToast,
} from '@stax/ui';
import type { ActionState } from '~/lib/form-state';
import { deliverSiteAction, openSiteEditorAction, withdrawSiteAction } from './actions';

export interface SiteClientView {
  email: string;
  name: string | null;
  role: string;
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'Propriétaire',
  admin: 'Administrateur',
  editor: 'Éditeur',
  billing: 'Facturation',
  viewer: 'Lecture seule',
};

/**
 * Construction du site, puis attribution au client.
 *
 * Tant que le site n'est pas confie, seule l'equipe StaX le modifie (verifie
 * en base par `app.site_can`). Le confier ouvre l'acces au client — et
 * uniquement a ce moment-la. L'equipe garde la main dans tous les cas.
 */
export function SiteDelivery({
  siteId,
  siteName,
  deliveredLabel,
  clients,
  isMember,
  canDeliver,
}: {
  siteId: string;
  siteName: string;
  /** Date d'attribution lisible, ou `null` si le site est en construction. */
  deliveredLabel: string | null;
  clients: SiteClientView[];
  /** La personne connectee est membre de l'organisation du site. */
  isMember: boolean;
  /** Role suffisant pour confier ou reprendre le site. */
  canDeliver: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('owner');
  const [error, setError] = useState<string | null>(null);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);

  const delivered = deliveredLabel !== null;

  const announce = (result: ActionState) => {
    if (result.status === 'error') {
      setError(result.message ?? 'L’opération a été refusée.');
      return;
    }
    setError(null);
    if (result.message) toast.success(result.message);
    router.refresh();
  };

  return (
    <Panel level={2} padding="lg" data-testid="site-delivery">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-medium">Construction et attribution</h2>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            {delivered ? (
              <>
                <StatusPill tone="success">Confié au client</StatusPill>
                <span className="text-[var(--foreground-muted)]">depuis le {deliveredLabel}</span>
              </>
            ) : (
              <>
                <StatusPill tone="accent">En construction chez StaX</StatusPill>
                <span className="text-[var(--foreground-muted)]">
                  le client ne le voit pas encore
                </span>
              </>
            )}
          </p>
        </div>
        <Button
          variant={delivered ? 'secondary' : 'primary'}
          loading={pending}
          onClick={() => {
            setError(null);
            startTransition(() => {
              void openSiteEditorAction({ siteId }).then((result) => {
                if (result?.status === 'error') setError(result.message ?? null);
              });
            });
          }}
          disabled={delivered && !isMember}
        >
          {delivered ? 'Ouvrir l’éditeur' : 'Construire le site'}
        </Button>
      </div>

      {delivered && !isMember ? (
        <p className="mt-2 text-xs text-[var(--muted)]">
          Site confié : pour le modifier, utilisez « Intervenir sur ce site » ci-dessous, motif à
          l’appui. Le client le verra dans son historique.
        </p>
      ) : null}

      {error ? (
        <Alert tone="danger" live="alert" className="mt-4">
          {error}
        </Alert>
      ) : null}

      <div className="mt-5 border-t border-[var(--border)] pt-4">
        <h3 className="text-xs font-medium tracking-[0.08em] text-[var(--muted)] uppercase">
          Client
        </h3>
        {clients.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--foreground-muted)]">
            Aucun compte client n’est encore rattaché à ce site.
          </p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {clients.map((client) => (
              <li key={client.email} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{client.name ?? client.email}</span>
                {client.name ? (
                  <span className="text-[var(--foreground-muted)]">{client.email}</span>
                ) : null}
                <span className="text-xs text-[var(--muted)]">
                  {ROLE_LABELS[client.role] ?? client.role}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {canDeliver ? (
        delivered ? (
          <div className="mt-5">
            <Button variant="ghost" size="sm" onClick={() => setConfirmWithdraw(true)}>
              Reprendre le site
            </Button>
          </div>
        ) : (
          <form
            className="mt-5 grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              setError(null);
              startTransition(() => {
                void deliverSiteAction({ siteId, email: email.trim(), role }).then(announce);
              });
            }}
          >
            <Field
              label="Confier à (adresse e-mail du compte client)"
              hint={
                clients.length > 0
                  ? 'Facultatif : le site est confié aux clients déjà rattachés ci-dessus.'
                  : 'Le client doit avoir un compte StaX avec cette adresse.'
              }
            >
              <Input
                type="email"
                value={email}
                autoComplete="off"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="client@exemple.fr"
              />
            </Field>
            <Field label="Rôle du client">
              <Select value={role} onChange={(event) => setRole(event.target.value)}>
                <option value="owner">Propriétaire</option>
                <option value="admin">Administrateur</option>
                <option value="editor">Éditeur</option>
              </Select>
            </Field>
            <Button type="submit" loading={pending}>
              Confier le site
            </Button>
          </form>
        )
      ) : null}

      <ConfirmDialog
        open={confirmWithdraw}
        onClose={() => setConfirmWithdraw(false)}
        title={`Reprendre « ${siteName} » ?`}
        description="Le site redevient « en construction » : le client ne peut plus le modifier, jusqu’à ce que vous le lui confiiez à nouveau. Rien n’est effacé, et le site en ligne ne change pas."
        confirmLabel="Reprendre le site"
        loading={pending}
        onConfirm={() => {
          startTransition(() => {
            void withdrawSiteAction({ siteId }).then((result) => {
              setConfirmWithdraw(false);
              announce(result);
            });
          });
        }}
      />
    </Panel>
  );
}
