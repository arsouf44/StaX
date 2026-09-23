'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  Field,
  Input,
  Select,
  Textarea,
  useToast,
} from '@stax/ui';
import type { ActionState } from '~/lib/form-state';
import {
  addDomainAction,
  attestCheckAction,
  connectHostingAction,
  connectRepositoryAction,
  deliverExternalSiteAction,
  disconnectHostingAction,
  disconnectRepositoryAction,
  importManifestAction,
  listRepositoriesAction,
  setPhaseAction,
} from './actions';

/**
 * Commandes de la page « Infrastructure & livraison ». Toutes appellent des
 * actions serveur qui reverifient le role et journalisent : rien ici ne
 * decide d'un droit, et aucun secret n'atteint le navigateur.
 */

function useAction() {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = <T extends ActionState>(action: () => Promise<T>, onDone?: (result: T) => void) => {
    setError(null);
    startTransition(() => {
      void action().then((result) => {
        if (result.status === 'error') setError(result.message ?? 'Opération refusée.');
        else if (result.message) toast.success(result.message);
        onDone?.(result);
        router.refresh();
      });
    });
  };
  return { pending, error, run, setError };
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <Alert tone="danger" live="alert" className="mt-3">
      {error}
    </Alert>
  ) : null;
}

/** Bouton d'action simple (relire, verifier, relancer). */
export function ActionButton({
  action,
  payload,
  children,
  variant = 'secondary',
  size = 'sm',
  disabled,
}: {
  action: (payload: unknown) => Promise<ActionState>;
  payload: Record<string, unknown>;
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'accent';
  size?: 'sm' | 'md';
  disabled?: boolean;
}) {
  const { pending, error, run } = useAction();
  return (
    <div>
      <Button
        type="button"
        variant={variant}
        size={size}
        loading={pending}
        disabled={disabled}
        onClick={() => run(() => action(payload))}
      >
        {children}
      </Button>
      <ErrorLine error={error} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  GitHub                                                                      */
/* -------------------------------------------------------------------------- */

interface RepositoryOption {
  id: number;
  fullName: string;
  defaultBranch: string;
  archived: boolean;
  private: boolean;
}

export function ConnectRepositoryForm({
  siteId,
  installations,
  currentBranch,
}: {
  siteId: string;
  installations: Array<{ id: number; account: string }>;
  currentBranch: string | null;
}) {
  const { pending, error, run, setError } = useAction();
  const [installationId, setInstallationId] = useState<number | null>(installations[0]?.id ?? null);
  const [repositories, setRepositories] = useState<RepositoryOption[] | null>(null);
  const [repositoryId, setRepositoryId] = useState<number | null>(null);
  const [branch, setBranch] = useState(currentBranch ?? 'main');
  const [manifestPath, setManifestPath] = useState('stax.manifest.json');
  const [loading, startLoading] = useTransition();

  const load = (id: number) => {
    setError(null);
    setRepositories(null);
    setRepositoryId(null);
    startLoading(() => {
      void listRepositoriesAction({ installationId: id }).then((result) => {
        if (result.status === 'error') setError(result.message ?? 'Dépôts illisibles.');
        else setRepositories(result.repositories ?? []);
      });
    });
  };

  if (installations.length === 0) {
    return (
      <p className="text-sm text-[var(--foreground-muted)]">
        Aucune installation de l’application GitHub StaX n’est connue. Installez-la sur le compte
        qui héberge les dépôts des sites, puis synchronisez.
      </p>
    );
  }

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!installationId || !repositoryId) {
          setError('Choisissez un dépôt.');
          return;
        }
        run(() =>
          connectRepositoryAction({
            siteId,
            installationId,
            repositoryId,
            productionBranch: branch.trim(),
            manifestPath: manifestPath.trim(),
          }),
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <Field label="Installation GitHub">
          <Select
            value={installationId ?? ''}
            onChange={(event) => setInstallationId(Number(event.target.value))}
          >
            {installations.map((installation) => (
              <option key={installation.id} value={installation.id}>
                {installation.account}
              </option>
            ))}
          </Select>
        </Field>
        <Button
          type="button"
          variant="secondary"
          loading={loading}
          onClick={() => installationId && load(installationId)}
        >
          Lister les dépôts
        </Button>
      </div>
      {repositories ? (
        <Field
          label="Dépôt du site"
          hint="Un dépôt ne sert qu’un seul site : un dépôt déjà rattaché ailleurs est refusé."
        >
          <Select
            value={repositoryId ?? ''}
            onChange={(event) => {
              const id = Number(event.target.value);
              setRepositoryId(id);
              const chosen = repositories.find((repository) => repository.id === id);
              if (chosen && !currentBranch) setBranch(chosen.defaultBranch);
            }}
          >
            <option value="">Choisir…</option>
            {repositories.map((repository) => (
              <option key={repository.id} value={repository.id} disabled={repository.archived}>
                {repository.fullName}
                {repository.private ? ' (privé)' : ''}
                {repository.archived ? ' — archivé' : ''}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Branche de production">
          <Input value={branch} onChange={(event) => setBranch(event.target.value)} />
        </Field>
        <Field label="Contrat d’édition" hint="Chemin du manifeste dans le dépôt.">
          <Input value={manifestPath} onChange={(event) => setManifestPath(event.target.value)} />
        </Field>
      </div>
      <div>
        <Button type="submit" loading={pending} disabled={!repositoryId}>
          Rattacher ce dépôt
        </Button>
      </div>
      <ErrorLine error={error} />
    </form>
  );
}

/** Detacher (depot ou projet) : motif obligatoire, journalise. */
export function DisconnectButton({
  siteId,
  target,
}: {
  siteId: string;
  target: 'repository' | 'hosting';
}) {
  const { pending, error, run } = useAction();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  return (
    <div>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Détacher
      </Button>
      <ErrorLine error={error} />
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={
          target === 'repository' ? 'Détacher le dépôt GitHub ?' : 'Détacher le projet Cloudflare ?'
        }
        description="Le site en ligne ne change pas, mais plus aucune publication n’est possible tant qu’un autre n’est pas rattaché. Le motif est journalisé."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button
              loading={pending}
              disabled={reason.trim().length < 5}
              onClick={() =>
                run(
                  () =>
                    (target === 'repository'
                      ? disconnectRepositoryAction
                      : disconnectHostingAction)({
                      siteId,
                      reason: reason.trim(),
                    }),
                  () => setOpen(false),
                )
              }
            >
              Détacher
            </Button>
          </div>
        }
      >
        <Field label="Motif">
          <Textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
      </Dialog>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Cloudflare                                                                  */
/* -------------------------------------------------------------------------- */

export function ConnectHostingForm({
  siteId,
  defaultAccountId,
  defaultBranch,
}: {
  siteId: string;
  defaultAccountId: string | null;
  defaultBranch: string | null;
}) {
  const { pending, error, run } = useAction();
  const [provider, setProvider] = useState<'cloudflare_pages' | 'cloudflare_workers'>(
    'cloudflare_pages',
  );
  const [accountId, setAccountId] = useState(defaultAccountId ?? '');
  const [projectName, setProjectName] = useState('');
  const [productionUrl, setProductionUrl] = useState('');
  const [productionBranch, setProductionBranch] = useState(defaultBranch ?? 'main');
  const [triggerId, setTriggerId] = useState('');

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        run(() =>
          connectHostingAction({
            siteId,
            provider,
            accountId: accountId.trim(),
            projectName: projectName.trim(),
            productionUrl: provider === 'cloudflare_workers' ? productionUrl.trim() : '',
            productionBranch: provider === 'cloudflare_workers' ? productionBranch.trim() : '',
            workersTriggerId: provider === 'cloudflare_workers' ? triggerId.trim() : '',
          }),
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type de projet">
          <Select
            value={provider}
            onChange={(event) => setProvider(event.target.value as typeof provider)}
          >
            <option value="cloudflare_pages">Cloudflare Pages</option>
            <option value="cloudflare_workers">Cloudflare Workers (Workers Builds)</option>
          </Select>
        </Field>
        <Field label="Compte Cloudflare" hint="Identifiant de compte (32 caractères, non secret).">
          <Input value={accountId} onChange={(event) => setAccountId(event.target.value)} />
        </Field>
      </div>
      <Field label={provider === 'cloudflare_pages' ? 'Nom du projet Pages' : 'Nom du Worker'}>
        <Input value={projectName} onChange={(event) => setProjectName(event.target.value)} />
      </Field>
      {provider === 'cloudflare_workers' ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Adresse de production" hint="https://….workers.dev">
            <Input
              value={productionUrl}
              onChange={(event) => setProductionUrl(event.target.value)}
            />
          </Field>
          <Field label="Branche de production">
            <Input
              value={productionBranch}
              onChange={(event) => setProductionBranch(event.target.value)}
            />
          </Field>
          <Field label="Déclencheur Workers Builds" hint="Pour relancer un build.">
            <Input value={triggerId} onChange={(event) => setTriggerId(event.target.value)} />
          </Field>
        </div>
      ) : (
        <p className="text-xs text-[var(--muted)]">
          StaX lit le projet chez Cloudflare : son adresse, sa branche de production et le dépôt
          qu’il déploie sont vérifiés, jamais saisis.
        </p>
      )}
      <div>
        <Button type="submit" loading={pending}>
          Rattacher ce projet
        </Button>
      </div>
      <ErrorLine error={error} />
    </form>
  );
}

export function AddDomainForm({ siteId, hasPrimary }: { siteId: string; hasPrimary: boolean }) {
  const { pending, error, run } = useAction();
  const [hostname, setHostname] = useState('');
  const [primary, setPrimary] = useState(!hasPrimary);
  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        run(
          () => addDomainAction({ siteId, hostname: hostname.trim().toLowerCase(), primary }),
          (result) => {
            if (result.status === 'success') setHostname('');
          },
        );
      }}
    >
      <div className="grid gap-2">
        <Field label="Ajouter un domaine au projet Cloudflare du site">
          <Input
            value={hostname}
            placeholder="www.entreprise.fr"
            autoComplete="off"
            onChange={(event) => setHostname(event.target.value)}
          />
        </Field>
        <Checkbox
          label="Domaine principal"
          checked={primary}
          onChange={(event) => setPrimary(event.target.checked)}
        />
      </div>
      <Button type="submit" loading={pending} disabled={!hostname.trim()}>
        Ajouter
      </Button>
      <div className="sm:col-span-2">
        <ErrorLine error={error} />
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/*  Contrat d'edition                                                           */
/* -------------------------------------------------------------------------- */

export function ImportManifestButton({ siteId, disabled }: { siteId: string; disabled?: boolean }) {
  const { pending, error, run } = useAction();
  const [report, setReport] =
    useState<Awaited<ReturnType<typeof importManifestAction>>['report']>();
  return (
    <div className="space-y-3">
      <Button
        type="button"
        loading={pending}
        disabled={disabled}
        onClick={() =>
          run(
            () => importManifestAction({ siteId }),
            (result) => setReport(result.report),
          )
        }
      >
        Importer le manifeste du dépôt
      </Button>
      <ErrorLine error={error} />
      {report ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] p-3 text-sm">
          <p className="font-medium">
            Commit {report.commit.slice(0, 7)} ·{' '}
            {report.valid ? 'manifeste valide, activé' : 'manifeste invalide, non activé'}
          </p>
          {report.errors.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--danger)]">
              {report.errors.slice(0, 12).map((issue) => (
                <li key={`${issue.path}-${issue.message}`}>
                  <span className="font-mono text-xs">{issue.path || '(racine)'}</span> —{' '}
                  {issue.message}
                </li>
              ))}
            </ul>
          ) : null}
          {report.planProblems.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--warning)]">
              {report.planProblems.map((problem) => (
                <li key={problem.key}>{problem.message}</li>
              ))}
            </ul>
          ) : null}
          {report.warnings.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--foreground-muted)]">
              {report.warnings.map((issue) => (
                <li key={issue.path}>{issue.message}</li>
              ))}
            </ul>
          ) : null}
          {report.content ? (
            <p
              className={
                report.content.initialized
                  ? 'mt-2 text-[var(--success)]'
                  : 'mt-2 text-[var(--warning)]'
              }
            >
              {report.content.message}
            </p>
          ) : null}
          {report.dropped.length > 0 ? (
            <p className="mt-2 text-[var(--warning)]">
              Zones retirées du contrat (leurs valeurs ne seront plus publiées) :{' '}
              {report.dropped.slice(0, 10).join(', ')}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Checklist et livraison                                                      */
/* -------------------------------------------------------------------------- */

export function AttestForm({
  siteId,
  checkKey,
  label,
}: {
  siteId: string;
  checkKey: 'forms' | 'responsive';
  label: string;
}) {
  const { pending, error, run } = useAction();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [passed, setPassed] = useState(true);
  return (
    <div>
      <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Attester
      </Button>
      <ErrorLine error={error} />
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`${label} — attestation`}
        description="Décrivez précisément ce qui a été vérifié. L’attestation est enregistrée à votre nom."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button
              loading={pending}
              disabled={note.trim().length < 10}
              onClick={() =>
                run(
                  () => attestCheckAction({ siteId, key: checkKey, passed, note: note.trim() }),
                  (result) => {
                    if (result.status === 'success') setOpen(false);
                  },
                )
              }
            >
              Enregistrer
            </Button>
          </div>
        }
      >
        <div className="grid gap-3">
          <Field label="Ce qui a été vérifié">
            <Textarea
              rows={4}
              value={note}
              placeholder={
                checkKey === 'forms'
                  ? 'Ex. : formulaire de contact envoyé depuis le site en ligne, reçu dans la messagerie StaX.'
                  : 'Ex. : vérifié sur iPhone 15, Pixel 8, iPad et écran 1440 px.'
              }
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
          <Checkbox
            label="Le contrôle est réussi"
            checked={passed}
            onChange={(event) => setPassed(event.target.checked)}
          />
        </div>
      </Dialog>
    </div>
  );
}

const PHASES: Array<{ value: string; label: string }> = [
  { value: 'ordered', label: 'Commande validée' },
  { value: 'questionnaire_pending', label: 'Informations attendues' },
  { value: 'assets_pending', label: 'Éléments attendus' },
  { value: 'design', label: 'Conception' },
  { value: 'client_review', label: 'Validation du client attendue' },
  { value: 'changes_requested', label: 'Corrections en cours' },
  { value: 'development', label: 'Développement' },
  { value: 'verification', label: 'Vérifications' },
  { value: 'deploying', label: 'Mise en ligne' },
];

export function PhaseForm({ siteId, current }: { siteId: string; current: string | null }) {
  const { pending, error, run } = useAction();
  const [status, setStatus] = useState(
    current && PHASES.some((phase) => phase.value === current) ? current : 'design',
  );
  const [note, setNote] = useState('');
  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        run(
          () => setPhaseAction({ siteId, status, note: note.trim() || undefined }),
          () => setNote(''),
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
        <Field label="Étape visible par le client">
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            {PHASES.map((phase) => (
              <option key={phase.value} value={phase.value}>
                {phase.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Message au client (facultatif)">
          <Input value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} />
        </Field>
      </div>
      <div>
        <Button type="submit" variant="secondary" loading={pending}>
          Mettre à jour l’étape
        </Button>
      </div>
      <ErrorLine error={error} />
    </form>
  );
}

export function DeliverForm({
  siteId,
  ready,
  hasClient,
}: {
  siteId: string;
  ready: boolean;
  hasClient: boolean;
}) {
  const { pending, error, run } = useAction();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('owner');
  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        run(() => deliverExternalSiteAction({ siteId, email: email.trim(), role }));
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
        <Field
          label="Compte client"
          hint={
            hasClient
              ? 'Facultatif : le site est livré aux comptes clients déjà rattachés.'
              : 'Adresse du compte StaX du client.'
          }
        >
          <Input
            type="email"
            value={email}
            autoComplete="off"
            placeholder="client@entreprise.fr"
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <Field label="Rôle">
          <Select value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="owner">Propriétaire</option>
            <option value="admin">Administrateur</option>
            <option value="editor">Éditeur</option>
          </Select>
        </Field>
      </div>
      <div>
        <Button type="submit" variant="accent" size="md" loading={pending} disabled={!ready}>
          Livrer le site au client
        </Button>
        {!ready ? (
          <p className="mt-2 text-xs text-[var(--muted)]">
            Disponible quand tous les contrôles de la checklist sont réussis.
          </p>
        ) : null}
      </div>
      <ErrorLine error={error} />
    </form>
  );
}
