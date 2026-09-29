import type { Metadata } from 'next';
import Link from 'next/link';
import { verifyCsrfToken } from '@nemasus/security';
import { Alert, ButtonLink, Panel } from '@nemasus/ui';
import { tryCreateServiceClient } from '@nemasus/database';
import { PageHeader } from '~/components/app/page-header';
import { requireAdminRole } from '~/lib/admin';
import { exchangeManifestCode, privateKeyForEnv } from '~/lib/github-manifest';

export const metadata: Metadata = { title: 'Application GitHub créée', robots: { index: false } };
export const dynamic = 'force-dynamic';

/**
 * Retour de GitHub après la création de l'application par manifeste.
 *
 * Le paramètre `state` a été signé pour CE propriétaire et expire en deux
 * heures : un lien de retour forgé ou rejoué par quelqu'un d'autre est refusé
 * avant tout échange. Les secrets reçus sont affichés une seule fois (le code
 * de GitHub est à usage unique) et ne sont écrits nulle part.
 */
export default async function GithubReturnPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { session } = await requireAdminRole('platform_owner');
  const params = await searchParams;
  const code = typeof params['code'] === 'string' ? params['code'] : null;
  const state = typeof params['state'] === 'string' ? params['state'] : null;

  const trusted =
    code !== null &&
    (await verifyCsrfToken(`github-manifest:${session.user.id}`, state).catch(() => false));

  if (!trusted || !code) {
    return (
      <Failure message="Ce retour de GitHub n’a pas pu être authentifié : il ne provient pas d’une création lancée depuis votre compte, ou il a expiré. Recommencez depuis la page Intégrations." />
    );
  }

  let app: Awaited<ReturnType<typeof exchangeManifestCode>>;
  try {
    app = await exchangeManifestCode(code);
  } catch (error) {
    return (
      <Failure
        message={error instanceof Error ? error.message : 'L’échange avec GitHub a échoué.'}
      />
    );
  }

  // Trace sans aucun secret : qui a créé quelle application, et quand.
  await tryCreateServiceClient()
    ?.from('audit_logs')
    .insert({
      actor_id: session.user.id,
      actor_email: session.profile.email,
      actor_type: 'user',
      action: 'integration.github_app_created',
      target_type: 'github_app',
      target_id: String(app.id),
      metadata_safe: { slug: app.slug, owner: app.owner },
    });

  const values: Array<[string, string]> = [
    ['GITHUB_APP_ID', String(app.id)],
    ['GITHUB_APP_SLUG', app.slug],
    ['GITHUB_APP_PRIVATE_KEY', privateKeyForEnv(app.pem)],
    ['GITHUB_APP_WEBHOOK_SECRET', app.webhookSecret],
  ];

  return (
    <>
      <PageHeader
        title={`Application « ${app.name} » créée`}
        description="Copiez ces quatre valeurs maintenant : elles ne seront plus affichées. Elles ne sont enregistrées nulle part dans Nemasus."
      />
      <div className="space-y-6">
        <Alert tone="warning" title="À faire tout de suite">
          <ol className="mt-1 list-decimal space-y-1 pl-5">
            <li>
              Dans <strong>Vercel → Settings → Environment Variables</strong> (Production), ajoutez
              les quatre variables ci-dessous ; cochez « Sensitive » pour la clé et le secret.
            </li>
            <li>Redéployez la plateforme (Deployments → ⋯ → Redeploy).</li>
            <li>
              Installez l’application sur le compte qui héberge les dépôts des sites (bouton
              ci-dessous), en sélectionnant ces dépôts.
            </li>
          </ol>
        </Alert>

        <Panel level={1} padding="lg">
          <dl className="space-y-4">
            {values.map(([key, value]) => (
              <div key={key}>
                <dt className="text-xs font-medium tracking-wide text-[var(--muted)]">{key}</dt>
                <dd className="mt-1">
                  <textarea
                    readOnly
                    value={value}
                    rows={key === 'GITHUB_APP_PRIVATE_KEY' ? 4 : 1}
                    className="w-full resize-none rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--background-inset)] p-2 font-mono text-xs break-all"
                    aria-label={key}
                    spellCheck={false}
                  />
                </dd>
              </div>
            ))}
          </dl>
        </Panel>

        <div className="flex flex-wrap gap-3">
          <ButtonLink
            href={`https://github.com/apps/${encodeURIComponent(app.slug)}/installations/new`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Installer l’application sur GitHub
          </ButtonLink>
          <ButtonLink href="/admin/integrations" variant="secondary">
            Retour aux intégrations
          </ButtonLink>
        </div>
      </div>
    </>
  );
}

function Failure({ message }: { message: string }) {
  return (
    <>
      <PageHeader title="Création de l’application GitHub" />
      <Alert tone="danger" live="alert" title="Rien n’a été enregistré">
        {message}{' '}
        <Link href="/admin/integrations" className="underline underline-offset-4">
          Revenir aux intégrations
        </Link>
      </Alert>
    </>
  );
}
