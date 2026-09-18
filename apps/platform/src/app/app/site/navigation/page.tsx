import type { Metadata } from 'next';
import { unwrapList, unwrapMaybe } from '@stax/database';
import { Panel } from '@stax/ui';
import { PageHeader } from '~/components/app/page-header';
import { SettingsForm, type SettingsGroup } from '~/components/app/settings-form';
import { getWorkspace } from '~/lib/workspace';
import { saveNavigationAction } from '../actions';

export const metadata: Metadata = { title: 'Navigation' };

interface MenuEntry {
  label?: unknown;
  path?: unknown;
}

/** Menu stocke en JSON : on le relit sans faire confiance a sa forme. */
function toLines(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value
    .map((entry) => {
      if (typeof entry !== 'object' || entry === null) return '';
      const item = entry as MenuEntry;
      const label = typeof item.label === 'string' ? item.label : '';
      const path = typeof item.path === 'string' ? item.path : '';
      return label && path ? `${label} | ${path}` : '';
    })
    .filter((line) => line.length > 0)
    .join('\n');
}

const GROUPS: SettingsGroup[] = [
  {
    id: 'menus',
    title: 'Vos menus',
    description:
      'Une ligne par entrée, sous la forme « Libellé | /chemin ». Seuls les liens internes à votre site sont acceptés dans les menus.',
    fields: [
      {
        name: 'primary',
        label: 'Menu principal',
        kind: 'textarea',
        rows: 7,
        wide: true,
        hint: 'Dix entrées au maximum. Au-delà, plus personne ne trouve rien.',
      },
      {
        name: 'footer',
        label: 'Menu du pied de page',
        kind: 'textarea',
        rows: 7,
        wide: true,
        hint: 'Vingt entrées au maximum. Les pages légales y sont ajoutées automatiquement.',
      },
    ],
  },
];

export default async function NavigationPage() {
  const { workspace, db } = await getWorkspace();
  const site = workspace.currentSite;
  const canEdit = workspace.capabilities.includes('content.edit');

  const settings = site
    ? unwrapMaybe<{ navigation: { primary?: unknown; footer?: unknown } | null }>(
        (await db
          .from('site_settings')
          .select('navigation')
          .eq('site_id', site.id)
          .maybeSingle()) as never,
      )
    : null;

  const pages = site
    ? unwrapList<{ path: string; title: string; is_published: boolean }>(
        (await db
          .from('site_pages')
          .select('path, title, is_published')
          .eq('site_id', site.id)
          .order('sort_order', { ascending: true })
          .limit(100)) as never,
      )
    : [];

  return (
    <>
      <PageHeader
        title="Navigation"
        description="L’ordre dans lequel vos visiteurs découvrent votre site. Mettez en premier ce qui fait venir les gens chez vous."
      />

      {site ? (
        <SettingsForm
          action={saveNavigationAction}
          groups={GROUPS}
          values={{
            primary: toLines(settings?.navigation?.primary),
            footer: toLines(settings?.navigation?.footer),
          }}
          readOnly={!canEdit}
          footnote="Publiez votre site pour appliquer les changements en ligne."
        />
      ) : (
        <Panel level={1} padding="lg">
          <p className="text-sm leading-relaxed text-[var(--foreground-muted)]">
            Votre site n’est pas encore créé.
          </p>
        </Panel>
      )}

      {pages.length > 0 ? (
        <Panel level={1} padding="lg" className="mt-8">
          <h2 className="text-sm font-medium">Les adresses de vos pages</h2>
          <p className="mt-2 text-sm text-[var(--foreground-muted)]">
            À recopier dans les menus ci-dessus.
          </p>
          <ul className="mt-4 space-y-1.5 text-sm">
            {pages.map((page) => (
              <li key={page.path} className="flex flex-wrap gap-2">
                <code className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-xs">
                  {page.title} | {page.path}
                </code>
                {!page.is_published ? (
                  <span className="text-xs text-[var(--muted)]">(brouillon)</span>
                ) : null}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </>
  );
}
