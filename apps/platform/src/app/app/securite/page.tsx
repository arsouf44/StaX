import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { createSessionClient } from '@stax/auth';
import { Alert, ButtonLink, Panel, StatusPill } from '@stax/ui';
import { PageHeader } from '~/components/app/page-header';
import { getWorkspace } from '~/lib/workspace';
import { PasswordChangeForm } from './password-change-form';
import { SessionControls } from './session-controls';

export const metadata: Metadata = { title: 'Sécurité' };

/**
 * Securite du compte.
 *
 * Elle montre l etat REEL : un facteur enrole mais non verifie apparait comme
 * non actif, parce qu il ne protege effectivement rien.
 */
export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { workspace } = await getWorkspace();

  const store = await cookies();
  const client = createSessionClient({
    getAll: () => store.getAll().map(({ name, value }) => ({ name, value })),
    setAll: () => {
      // Page en lecture seule.
    },
  });

  const { data: factors } = await client.auth.mfa.listFactors();
  const verified = (factors?.totp ?? []).filter((factor) => factor.status === 'verified');
  const mfaActive = verified.length > 0;

  return (
    <>
      <PageHeader
        title="Sécurité"
        description="Votre mot de passe, votre double authentification et vos sessions ouvertes."
      />

      {params.mfa === 'active' ? (
        <Alert
          tone="success"
          className="mb-6"
          live="status"
          title="Double authentification activée"
        >
          Votre compte est désormais protégé par une seconde vérification.
        </Alert>
      ) : null}

      <div className="space-y-6">
        <Panel level={2} padding="lg">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-medium">Double authentification</h2>
              <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-[var(--foreground-muted)]">
                Un mot de passe volé ne suffit plus à entrer dans votre compte. C’est la protection
                la plus efficace que vous puissiez activer, et elle prend deux minutes.
              </p>
            </div>
            <StatusPill tone={mfaActive ? 'success' : 'warning'}>
              {mfaActive ? 'Active' : 'Non activée'}
            </StatusPill>
          </div>

          {workspace.profile.mfa_enforced ? (
            <Alert tone="info" className="mt-4" live="status">
              Ce compte dispose d’un accès d’administration : la double authentification y est
              obligatoire et ne peut pas être désactivée.
            </Alert>
          ) : null}

          <div className="mt-5">
            {mfaActive ? (
              <SessionControls
                factorId={verified[0]?.id ?? ''}
                canDisable={!workspace.profile.mfa_enforced}
              />
            ) : (
              <ButtonLink href="/mfa/configuration">Activer la double authentification</ButtonLink>
            )}
          </div>
        </Panel>

        <Panel level={2} padding="lg">
          <h2 className="text-sm font-medium">Mot de passe</h2>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-[var(--foreground-muted)]">
            Choisissez un mot de passe que vous n’utilisez nulle part ailleurs. Une phrase longue
            vaut mieux qu’un mot compliqué.
          </p>
          <div className="mt-5 max-w-md">
            <PasswordChangeForm />
          </div>
        </Panel>

        <Panel level={1} padding="lg">
          <h2 className="text-sm font-medium">Ce que nous faisons de notre côté</h2>
          <ul className="mt-3 space-y-2 text-sm text-[var(--foreground-muted)]">
            <li>
              Votre mot de passe n’est jamais stocké en clair, ni lisible par nous, ni récupérable.
            </li>
            <li>
              Chaque accès de notre équipe à votre espace laisse une trace horodatée, consultable
              dans votre journal d’activité.
            </li>
            <li>
              L’isolation entre clients est imposée par la base de données, pas par un filtre dans
              l’interface — et elle est vérifiée automatiquement à chaque modification du code.
            </li>
            <li>
              Aucune donnée de carte bancaire ne transite par nos serveurs ni n’y est conservée.
            </li>
          </ul>
          <p className="mt-4 text-xs text-[var(--muted)]">
            Le détail est public :{' '}
            <Link href="/securite" className="underline underline-offset-4">
              notre page sécurité
            </Link>
            .
          </p>
        </Panel>
      </div>
    </>
  );
}
