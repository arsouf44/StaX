'use client';

import { useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, Button, ConfirmDialog, Field, Icon, Input, Panel, StatusPill } from '@stax/ui';
import type { StatusTone } from '@stax/ui';
import { IDLE_STATE, type ActionState } from '~/lib/form-state';
import {
  attachDomainAction,
  detachDomainAction,
  setPrimaryDomainAction,
  verifyDomainAction,
} from './actions';

export interface DnsRecordView {
  type: string;
  name: string;
  value: string;
  purpose: string;
}

export interface DomainView {
  id: string;
  hostname: string;
  statusLabel: string;
  statusTone: StatusTone;
  statusHelp: string;
  isPrimary: boolean;
  isPlatform: boolean;
  isActive: boolean;
  httpsLabel: string;
  lastError: string | null;
  lastCheckedLabel: string | null;
  records: DnsRecordView[];
}

function SubmitButton({
  label,
  variant = 'secondary',
  size = 'sm',
}: {
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md';
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} loading={pending} loadingLabel="Un instant">
      {label}
    </Button>
  );
}

function CopyableRecord({ record }: { record: DnsRecordView }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] p-4">
      <p className="text-xs font-medium tracking-wide text-[var(--muted)] uppercase">
        Enregistrement {record.type}
      </p>
      <dl className="mt-2 space-y-1.5 text-sm">
        <div className="flex flex-wrap gap-2">
          <dt className="w-16 shrink-0 text-[var(--muted)]">Nom</dt>
          <dd className="min-w-0 font-mono text-xs break-all">{record.name}</dd>
        </div>
        <div className="flex flex-wrap gap-2">
          <dt className="w-16 shrink-0 text-[var(--muted)]">Valeur</dt>
          <dd className="min-w-0 font-mono text-xs break-all">{record.value}</dd>
        </div>
      </dl>
      <p className="mt-2 text-xs leading-relaxed text-[var(--foreground-muted)]">
        {record.purpose}
      </p>
    </div>
  );
}

export function DomainManager({
  domains,
  canManage,
  providerAvailable,
}: {
  domains: DomainView[];
  canManage: boolean;
  providerAvailable: boolean;
}) {
  const [expanded, setExpanded] = useState<string | null>(
    domains.find((domain) => !domain.isActive && !domain.isPlatform)?.id ?? null,
  );
  const [pendingDetach, setPendingDetach] = useState<DomainView | null>(null);
  const [attachState, setAttachState] = useState<ActionState>(IDLE_STATE);
  const [rowState, setRowState] = useState<ActionState>(IDLE_STATE);
  const [, startTransition] = useTransition();

  const attach = (formData: FormData) =>
    attachDomainAction(IDLE_STATE, formData).then(setAttachState);
  const verify = (formData: FormData) => verifyDomainAction(IDLE_STATE, formData).then(setRowState);
  const makePrimary = (formData: FormData) =>
    setPrimaryDomainAction(IDLE_STATE, formData).then(setRowState);
  const detach = (formData: FormData) =>
    detachDomainAction(IDLE_STATE, formData).then((result) => {
      setRowState(result);
      if (result.status === 'success') setPendingDetach(null);
    });

  return (
    <div className="space-y-8">
      {rowState.status === 'error' && rowState.message ? (
        <Alert tone="danger" live="alert">
          {rowState.message}
        </Alert>
      ) : null}
      {rowState.status === 'success' && rowState.message ? (
        <Alert tone="success" live="status">
          {rowState.message}
        </Alert>
      ) : null}

      <ul className="space-y-4">
        {domains.map((domain) => (
          <li key={domain.id}>
            <Panel level={domain.isPrimary ? 2 : 1} padding="lg">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    <span className="break-all">{domain.hostname}</span>
                    {domain.isPrimary ? (
                      <span className="text-xs font-normal text-[var(--accent)]">
                        adresse principale
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--foreground-muted)]">
                    {domain.statusHelp}
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    HTTPS : {domain.httpsLabel}
                    {domain.lastCheckedLabel
                      ? ` · Dernière vérification ${domain.lastCheckedLabel}`
                      : ''}
                  </p>
                </div>
                <StatusPill tone={domain.statusTone}>{domain.statusLabel}</StatusPill>
              </div>

              {domain.lastError ? (
                <Alert tone="warning" className="mt-4" live="status">
                  {domain.lastError}
                </Alert>
              ) : null}

              {canManage && !domain.isPlatform ? (
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-4">
                  {!domain.isActive ? (
                    <form
                      action={verify}
                      onSubmit={() => setExpanded(domain.id)}
                      className="inline"
                    >
                      <input type="hidden" name="domainId" value={domain.id} />
                      <SubmitButton label="Vérifier maintenant" variant="primary" />
                    </form>
                  ) : null}

                  {domain.isActive && !domain.isPrimary ? (
                    <form action={makePrimary} className="inline">
                      <input type="hidden" name="domainId" value={domain.id} />
                      <SubmitButton label="En faire l’adresse principale" />
                    </form>
                  ) : null}

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setExpanded(expanded === domain.id ? null : domain.id)}
                  >
                    {expanded === domain.id
                      ? 'Masquer la configuration DNS'
                      : 'Voir la configuration DNS'}
                  </Button>

                  <Button variant="ghost" size="sm" onClick={() => setPendingDetach(domain)}>
                    Retirer
                  </Button>
                </div>
              ) : null}

              {expanded === domain.id && domain.records.length > 0 ? (
                <div className="mt-4 space-y-3">
                  <p className="text-sm leading-relaxed text-[var(--foreground-muted)]">
                    Ajoutez ces deux enregistrements chez l’hébergeur où vous avez acheté votre
                    domaine (OVH, Gandi, IONOS, Google Domains…), puis revenez lancer la
                    vérification.
                  </p>
                  {domain.records.map((record) => (
                    <CopyableRecord key={`${record.type}-${record.name}`} record={record} />
                  ))}
                  <p className="text-xs leading-relaxed text-[var(--muted)]">
                    Une modification DNS met en général quelques minutes à se propager, parfois
                    jusqu’à 48 heures. Tant qu’elle n’est pas visible, votre site reste joignable à
                    son adresse StaX.
                  </p>
                </div>
              ) : null}
            </Panel>
          </li>
        ))}
      </ul>

      {canManage ? (
        <Panel level={1} padding="lg">
          <h2 className="text-sm font-medium">Rattacher un nom de domaine</h2>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-[var(--foreground-muted)]">
            Vous avez déjà acheté un domaine ? Saisissez-le ici. Vous n’en avez pas encore ? Nous
            pouvons l’acheter pour vous : écrivez-nous.
          </p>

          <form action={attach} className="mt-5 space-y-4" noValidate>
            {attachState.status === 'error' && attachState.message ? (
              <Alert tone="danger" live="alert">
                {attachState.message}
              </Alert>
            ) : null}
            {attachState.status === 'success' && attachState.message ? (
              <Alert tone="success" live="status">
                {attachState.message}
              </Alert>
            ) : null}

            <Field
              label="Votre nom de domaine"
              hint="Sans « https:// » ni barre oblique. Exemple : mon-entreprise.fr"
              error={attachState.errors?.hostname}
              required
            >
              <Input
                name="hostname"
                required
                maxLength={253}
                placeholder="mon-entreprise.fr"
                autoComplete="off"
                spellCheck={false}
              />
            </Field>

            <SubmitButton label="Rattacher ce domaine" variant="primary" size="md" />
          </form>

          {!providerAvailable ? (
            <p className="mt-4 text-xs leading-relaxed text-[var(--muted)]">
              La mise en service technique est actuellement réalisée par notre équipe. Votre demande
              est enregistrée immédiatement et traitée sous un jour ouvré.
            </p>
          ) : null}
        </Panel>
      ) : (
        <Panel level={1} padding="lg">
          <p className="text-sm leading-relaxed text-[var(--foreground-muted)]">
            Seul un propriétaire de votre organisation peut rattacher ou retirer un nom de domaine.
          </p>
        </Panel>
      )}

      <Panel level={1} padding="lg">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 shrink-0 text-[var(--accent)]" aria-hidden="true">
            <Icon name="shield-check" size={18} />
          </span>
          <div>
            <h2 className="text-sm font-medium">Votre domaine reste le vôtre</h2>
            <p className="mt-2 max-w-prose text-sm leading-relaxed text-[var(--foreground-muted)]">
              Il est enregistré à votre nom. Si vous quittez StaX, vous le récupérez : il suffit de
              modifier l’enregistrement DNS pour le diriger ailleurs. Nous ne le retenons pas.
            </p>
          </div>
        </div>
      </Panel>

      <ConfirmDialog
        open={pendingDetach !== null}
        onClose={() => setPendingDetach(null)}
        onConfirm={() => {
          if (!pendingDetach) return;
          const payload = new FormData();
          payload.set('domainId', pendingDetach.id);
          startTransition(() => {
            void detach(payload);
          });
        }}
        tone="danger"
        confirmLabel="Retirer ce domaine"
        confirmationText={pendingDetach?.hostname}
        title="Retirer ce nom de domaine ?"
        description="Votre site ne répondra plus à cette adresse. Il restera joignable à son adresse StaX. Le domaine reste votre propriété et pourra être rattaché à nouveau. Recopiez-le pour confirmer."
      />
    </div>
  );
}
