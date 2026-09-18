import type { Metadata } from 'next';
import Link from 'next/link';
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@stax/business';
import { Badge, Panel } from '@stax/ui';
import { PageHeader } from '~/components/app/page-header';
import { getWorkspace } from '~/lib/workspace';
import { ProfileForm } from './profile-form';

export const metadata: Metadata = { title: 'Mon compte' };

export default async function AccountPage() {
  const { workspace } = await getWorkspace();
  const profile = workspace.profile;

  return (
    <>
      <PageHeader
        title="Mon compte"
        description="Vos informations personnelles et votre rôle dans cette organisation."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
        <Panel level={2} padding="lg">
          <h2 className="text-sm font-medium">Vos informations</h2>
          <div className="mt-5 max-w-md">
            <ProfileForm
              firstName={profile.first_name ?? ''}
              lastName={profile.last_name ?? ''}
              phone={profile.phone ?? ''}
              email={profile.email}
              marketingOptIn={profile.marketing_opt_in}
            />
          </div>
        </Panel>

        <aside className="space-y-4">
          <Panel level={1} padding="md">
            <h2 className="text-sm font-medium">Votre rôle</h2>
            <Badge tone="neutral" className="mt-2">
              {ROLE_LABELS[workspace.role]}
            </Badge>
            <p className="mt-2 text-xs leading-relaxed text-[var(--foreground-muted)]">
              {ROLE_DESCRIPTIONS[workspace.role]}
            </p>
            <p className="mt-3 text-xs text-[var(--muted)]">
              Seul un propriétaire de {workspace.organization.name} peut modifier votre rôle.
            </p>
          </Panel>

          <Panel level={1} padding="md">
            <h2 className="text-sm font-medium">Adresse e-mail</h2>
            <p className="mt-2 text-sm break-all text-[var(--foreground-muted)]">{profile.email}</p>
            <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
              Changer d’adresse de connexion nécessite de vérifier la nouvelle : écrivez-nous depuis{' '}
              <Link href="/app/support" className="underline underline-offset-4">
                l’assistance
              </Link>
              .
            </p>
          </Panel>

          <Panel level={1} padding="md">
            <h2 className="text-sm font-medium">Sécurité</h2>
            <p className="mt-2 text-xs leading-relaxed text-[var(--foreground-muted)]">
              Mot de passe, double authentification et sessions ouvertes se gèrent depuis{' '}
              <Link href="/app/securite" className="underline underline-offset-4">
                la page sécurité
              </Link>
              .
            </p>
          </Panel>
        </aside>
      </div>
    </>
  );
}
