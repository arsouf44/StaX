'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  ConfirmDialog,
  Dialog,
  Field,
  Icon,
  Input,
  Panel,
  Select,
  useToast,
} from '@stax/ui';
import type { ActionState } from '~/lib/form-state';
import {
  changeSiteStatusAction,
  issueActivationCodeAction,
  restoreSiteVersionAction,
  revokeActivationCodeAction,
} from './actions';

/**
 * Actions du back-office sur un site client.
 *
 * Deux principes d'interface :
 *
 *  1. Seules les transitions REELLEMENT possibles sont proposees. La base les
 *     refuserait de toute facon, mais proposer un bouton qui echoue toujours
 *     est une forme de mensonge.
 *  2. Toute action sur le site de quelqu'un d'autre demande un motif et une
 *     confirmation. Ce n'est pas de la ceremonie : la trace nominative sert le
 *     jour ou il faut expliquer ce qui s'est passe.
 */

/** Transitions permises par `app.guard_site_status`, reprises a l'identique. */
const TRANSITIONS: Record<string, string[]> = {
  draft: ['building', 'archived'],
  building: ['draft', 'review', 'ready', 'archived'],
  review: ['building', 'ready', 'archived'],
  ready: ['building', 'review', 'live', 'archived'],
  live: ['ready', 'suspended', 'archived'],
  suspended: ['live', 'ready', 'archived'],
  archived: ['draft'],
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  building: 'En construction',
  review: 'En relecture client',
  ready: 'Prêt à publier',
  live: 'En ligne',
  suspended: 'Suspendu',
  archived: 'Archivé',
};

const STATUS_CONSEQUENCES: Record<string, string> = {
  live: 'Le site devient accessible au public. Il doit déjà avoir une version publiée.',
  suspended:
    'Le site cesse d’être accessible au public. Rien n’est supprimé : le contenu, les commandes ' +
    'et les messages restent intacts, et le client peut le retrouver en ligne dès la réactivation.',
  archived:
    'Le site sort de l’exploitation courante. Les données sont conservées, mais le site n’est ' +
    'plus servi et ne peut plus être publié sans être d’abord repassé en brouillon.',
  ready: 'Le site quitte la mise en ligne et redevient modifiable avant publication.',
  review: 'Le site passe en relecture : le client est invité à le valider.',
  building: 'Le site repasse en construction de notre côté.',
  draft: 'Le site redevient un brouillon.',
};

export interface ActivationCodeView {
  id: string;
  hint: string;
  email: string | null;
  role: string;
  expiresLabel: string;
  /**
   * Etat calcule COTE SERVEUR.
   *
   * L'expiration depend de l'heure qu'il est ; la calculer au rendu du
   * navigateur la rendrait dependante de l'horloge du poste, et un composant
   * qui lit l'heure pendant son rendu n'est pas reproductible.
   */
  state: 'used' | 'revoked' | 'expired' | 'active';
}

const CODE_STATES: Record<ActivationCodeView['state'], string> = {
  used: 'Utilisé',
  revoked: 'Révoqué',
  expired: 'Expiré',
  active: 'Actif',
};

export interface AdminVersionView {
  id: string;
  number: number;
  label: string | null;
  publishedLabel: string;
  isCurrent: boolean;
}

export function SiteAdminActions({
  siteId,
  siteName,
  status,
  canAct,
  versions,
  codes,
}: {
  siteId: string;
  siteName: string;
  status: string;
  canAct: boolean;
  versions: AdminVersionView[];
  codes: ActivationCodeView[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [restoring, setRestoring] = useState<AdminVersionView | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const [issuedCode, setIssuedCode] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('owner');
  const [validForDays, setValidForDays] = useState('14');
  const [formError, setFormError] = useState<string | null>(null);

  const announce = (result: ActionState) => {
    if (result.status === 'error') toast.error(result.message ?? 'Opération refusée.');
    else if (result.message) toast.success(result.message);
  };

  const available = TRANSITIONS[status] ?? [];

  if (!canAct) {
    return (
      <Panel level={1} padding="lg">
        <h2 className="text-sm font-medium">Actions</h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
          Votre rôle permet de consulter ce site, pas d’agir dessus. Les changements d’état, les
          remises en ligne et les codes d’activation sont réservés aux administrateurs de la
          plateforme.
        </p>
      </Panel>
    );
  }

  return (
    <div className="space-y-6">
      <Panel level={1} padding="lg">
        <h2 className="text-sm font-medium">Changer l’état du site</h2>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-[var(--foreground-muted)]">
          Seules les transitions possibles depuis « {STATUS_LABELS[status] ?? status} » sont
          proposées. Chaque changement est enregistré à votre nom, avec son motif.
        </p>

        {available.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--muted)]">
            Aucune transition n’est possible depuis cet état.
          </p>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            {available.map((next) => (
              <Button
                key={next}
                variant={next === 'suspended' || next === 'archived' ? 'outline' : 'secondary'}
                size="sm"
                disabled={pending}
                onClick={() => {
                  setReason('');
                  setTarget(next);
                }}
              >
                {STATUS_LABELS[next] ?? next}
              </Button>
            ))}
          </div>
        )}
      </Panel>

      <Panel level={1} padding="lg">
        <h2 className="text-sm font-medium">Versions publiées</h2>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-[var(--foreground-muted)]">
          Remettre une version en ligne la republie immédiatement sous un nouveau numéro. Le
          brouillon du client n’est pas modifié.
        </p>

        {versions.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--muted)]">Ce site n’a jamais été publié.</p>
        ) : (
          <ul className="mt-4 divide-y divide-[var(--border)] border-t border-[var(--border)]">
            {versions.map((version) => (
              <li
                key={version.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm">
                    <span className="font-medium">Version {version.number}</span>
                    {version.isCurrent ? (
                      <span className="ml-2 text-xs text-[var(--success)]">en ligne</span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {version.publishedLabel}
                    {version.label ? ` · ${version.label}` : ''}
                  </p>
                </div>
                {version.isCurrent ? null : (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => setRestoring(version)}
                  >
                    <Icon name="history" size={14} aria-hidden="true" />
                    Remettre en ligne
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel level={1} padding="lg">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium">Codes d’activation</h2>
            <p className="mt-2 max-w-prose text-sm leading-relaxed text-[var(--foreground-muted)]">
              Un code remet l’accès de l’espace client à une personne précise. Il est lié à son
              adresse e-mail : même intercepté, il ne sert à personne d’autre.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => {
              setIssuedCode(null);
              setFormError(null);
              setCodeOpen(true);
            }}
          >
            Créer un code
          </Button>
        </div>

        {codes.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--muted)]">Aucun code émis pour ce site.</p>
        ) : (
          <ul className="mt-4 divide-y divide-[var(--border)] border-t border-[var(--border)]">
            {codes.map((code) => {
              const state = CODE_STATES[code.state];
              return (
                <li
                  key={code.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-sm">…{code.hint}</p>
                    <p className="mt-0.5 text-xs text-[var(--muted)]">
                      {code.email ?? 'toute adresse'} · {code.role} · {state} · expire le{' '}
                      {code.expiresLabel}
                    </p>
                  </div>
                  {code.state === 'active' ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => {
                        startTransition(() => {
                          void revokeActivationCodeAction({ codeId: code.id, siteId }).then(
                            (result) => {
                              announce(result);
                              router.refresh();
                            },
                          );
                        });
                      }}
                    >
                      Révoquer
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Dialog
        open={target !== null}
        onClose={() => setTarget(null)}
        dismissible={!pending}
        size="sm"
        title={`Passer « ${siteName} » en « ${STATUS_LABELS[target ?? ''] ?? target ?? ''} » ?`}
        description={STATUS_CONSEQUENCES[target ?? ''] ?? 'Cette action sera enregistrée.'}
        footer={
          <>
            <Button variant="ghost" disabled={pending} onClick={() => setTarget(null)}>
              Annuler
            </Button>
            <Button
              variant={target === 'suspended' || target === 'archived' ? 'danger' : 'primary'}
              loading={pending}
              onClick={() => {
                if (!target) return;
                startTransition(() => {
                  void changeSiteStatusAction({
                    siteId,
                    status: target,
                    reason: reason.trim() === '' ? undefined : reason.trim(),
                  }).then((result) => {
                    announce(result);
                    setTarget(null);
                    router.refresh();
                  });
                });
              }}
            >
              Confirmer
            </Button>
          </>
        }
      >
        <Field
          label="Motif"
          hint="Conservé dans le journal. Il sera lu le jour où il faudra expliquer cette décision."
        >
          <Input
            value={reason}
            maxLength={500}
            placeholder="Impayé depuis 60 jours, demande du client…"
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
      </Dialog>

      <ConfirmDialog
        open={restoring !== null}
        onClose={() => setRestoring(null)}
        title={`Remettre la version ${restoring?.number ?? ''} en ligne ?`}
        description="Les visiteurs verront cette version immédiatement. Le brouillon du client n’est pas modifié, et l’opération est elle-même enregistrée dans l’historique."
        confirmLabel="Remettre en ligne"
        loading={pending}
        onConfirm={() => {
          if (!restoring) return;
          startTransition(() => {
            void restoreSiteVersionAction({ siteId, versionId: restoring.id }).then((result) => {
              announce(result);
              setRestoring(null);
              router.refresh();
            });
          });
        }}
      />

      <Dialog
        open={codeOpen}
        onClose={() => setCodeOpen(false)}
        title="Créer un code d’activation"
        description="Le code n’est affiché qu’une seule fois : seule son empreinte est conservée."
      >
        {issuedCode ? (
          <div className="space-y-4">
            <Alert tone="success" live="status" title="Code créé">
              Transmettez-le à {email} par un canal qu’il ou elle utilise déjà. Il ne sera plus
              affiché après fermeture de cette fenêtre.
            </Alert>
            <p className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3 text-center font-mono text-lg tracking-[0.25em]">
              {issuedCode}
            </p>
            <Button variant="secondary" block onClick={() => setCodeOpen(false)}>
              J’ai noté le code
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {formError ? (
              <Alert tone="danger" live="alert">
                {formError}
              </Alert>
            ) : null}
            <Field label="Adresse e-mail de la personne" required>
              <Input
                type="email"
                value={email}
                maxLength={200}
                autoComplete="off"
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
            <Field label="Rôle accordé">
              <Select value={role} onChange={(event) => setRole(event.target.value)}>
                <option value="owner">Propriétaire</option>
                <option value="admin">Administrateur</option>
                <option value="editor">Éditeur</option>
              </Select>
            </Field>
            <Field label="Valable (jours)">
              <Input
                type="number"
                min={1}
                max={60}
                value={validForDays}
                onChange={(event) => setValidForDays(event.target.value)}
              />
            </Field>
            <Button
              block
              loading={pending}
              onClick={() => {
                setFormError(null);
                startTransition(() => {
                  void issueActivationCodeAction({
                    siteId,
                    email,
                    role,
                    validForDays: Number(validForDays),
                  }).then((result) => {
                    if (result.status === 'error') {
                      setFormError(result.message ?? 'Ce code n’a pas pu être créé.');
                      return;
                    }
                    setIssuedCode(result.code ?? null);
                    router.refresh();
                  });
                });
              }}
            >
              Créer le code
            </Button>
          </div>
        )}
      </Dialog>
    </div>
  );
}
