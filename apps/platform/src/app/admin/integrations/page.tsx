import type { Metadata } from 'next';
import Link from 'next/link';
import { hasCapability, platformUrl, readEnv } from '@nemasus/config';
import { issueCsrfToken } from '@nemasus/security';
import { Alert, Panel, StatusPill } from '@nemasus/ui';
import { PageHeader } from '~/components/app/page-header';
import { requireAdminRole } from '~/lib/admin';
import { githubAppCreationUrl } from '~/lib/github-manifest';
import { GithubAppForm } from './github-app-form';

export const metadata: Metadata = { title: 'Intégrations' };
export const dynamic = 'force-dynamic';

/**
 * Brancher la plateforme sur GitHub (dépôts des sites) et sur Cloudflare
 * (hébergement des sites). Réservé au propriétaire : ces intégrations écrivent
 * dans le code et pilotent l'hébergement de tous les clients.
 */
export default async function IntegrationsPage() {
  const { session } = await requireAdminRole('platform_owner');

  const github = hasCapability('github_app');
  const cloudflare = hasCapability('cloudflare_sites');
  const base = platformUrl();
  const httpsPlatform = base.startsWith('https://');

  let state: string | null = null;
  try {
    state = (await issueCsrfToken(`github-manifest:${session.user.id}`)).value;
  } catch {
    state = null;
  }

  return (
    <>
      <PageHeader
        title="Intégrations"
        description="GitHub conserve le code de chaque site client ; Cloudflare les héberge. Sans ces deux accès, rien n’est simulé : les rattachements, vérifications et publications sont refusés."
      />

      <div className="space-y-8">
        <Panel level={1} padding="lg" className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-medium">Application GitHub</h2>
            <StatusPill tone={github ? 'success' : 'warning'}>
              {github
                ? `Configurée (${readEnv('GITHUB_APP_SLUG') ?? 'sans nom court'})`
                : 'Absente'}
            </StatusPill>
          </div>
          <p className="text-sm leading-relaxed text-[var(--foreground-muted)]">
            Un clic crée l’application sur GitHub avec exactement ce qu’il faut : lecture et
            écriture du contenu des dépôts, lecture de leurs métadonnées, webhook vers{' '}
            <code>{base}/api/webhooks/github</code>. GitHub vous demande de confirmer, puis vous
            revenez ici avec les quatre valeurs à copier dans les variables de Vercel.
          </p>
          {github ? (
            <Alert tone="success" title="Déjà configurée">
              Pour la remplacer, créez-en une nouvelle ci-dessous, copiez ses valeurs dans Vercel,
              puis supprimez l’ancienne sur GitHub.
            </Alert>
          ) : null}
          {!httpsPlatform ? (
            <Alert tone="warning" title="Adresse de la plateforme en HTTP">
              GitHub exige une adresse HTTPS joignable pour le webhook. Définissez{' '}
              <code>PLATFORM_URL</code> (adresse de production) avant de créer l’application.
            </Alert>
          ) : null}
          {state ? (
            <GithubAppForm
              platformUrl={base}
              personalUrl={githubAppCreationUrl(null, state)}
              organizationUrlTemplate={githubAppCreationUrl('__ORG__', state)}
            />
          ) : (
            <Alert tone="danger" title="Clé de signature absente">
              <code>NEMASUS_SECRET_KEY</code> n’est pas configurée : le retour depuis GitHub ne
              pourrait pas être authentifié.
            </Alert>
          )}
        </Panel>

        <Panel level={1} padding="lg" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-medium">Jeton Cloudflare des sites</h2>
            <StatusPill tone={cloudflare ? 'success' : 'warning'}>
              {cloudflare ? 'Configuré' : 'Absent'}
            </StatusPill>
          </div>
          <p className="text-sm leading-relaxed text-[var(--foreground-muted)]">
            Cloudflare ne permet pas de créer un jeton depuis une autre application : il se crée
            dans votre tableau de bord, en deux minutes.
          </p>
          <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-[var(--foreground-muted)]">
            <li>
              Ouvrez{' '}
              <a
                href="https://dash.cloudflare.com/profile/api-tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4"
              >
                Cloudflare → My Profile → API Tokens
              </a>{' '}
              → <strong>Create Token</strong> → <strong>Create Custom Token</strong>.
            </li>
            <li>
              Nom : <code>Nemasus — sites</code>. Permissions, toutes au niveau{' '}
              <strong>Account</strong> :
              <ul className="mt-1 list-disc pl-5">
                <li>
                  <strong>Cloudflare Pages</strong> — Edit
                </li>
                <li>
                  <strong>Workers Scripts</strong> — Read
                </li>
                <li>
                  <strong>Workers Builds Configuration</strong> — Edit
                </li>
              </ul>
            </li>
            <li>
              Account Resources : <strong>Include</strong> → le compte qui héberge les sites. Aucune
              permission de zone, de facturation ni de membres.
            </li>
            <li>
              Créez le jeton, puis dans <strong>Vercel → Settings → Environment Variables</strong>{' '}
              (Production) : <code>CLOUDFLARE_SITES_API_TOKEN</code> (le jeton, en « Sensitive ») et{' '}
              <code>CLOUDFLARE_SITES_ACCOUNT_ID</code> (l’identifiant du compte, visible sur la page
              d’accueil de Cloudflare, colonne de droite). Redéployez.
            </li>
            <li>
              Facultatif, pour un suivi immédiat des déploiements :{' '}
              <em>Notifications → Destinations → Webhooks</em>, URL{' '}
              <code>{base}/api/webhooks/cloudflare</code> et un secret de 32 caractères, copié dans{' '}
              <code>CLOUDFLARE_WEBHOOK_SECRET</code>.
            </li>
          </ol>
          <p className="text-xs leading-relaxed text-[var(--muted)]">
            Le détail et les raisons de chaque permission :{' '}
            <Link href="/admin/sante" className="underline underline-offset-4">
              état des services
            </Link>{' '}
            et <code>docs/integrations.md</code>.
          </p>
        </Panel>
      </div>
    </>
  );
}
