import type { Metadata } from 'next';
import Link from 'next/link';
import { unwrapList } from '@stax/database';
import { formatMoney } from '@stax/payments';
import {
  EmptyState,
  Icon,
  Panel,
  PermissionDenied,
  Stat,
  Table,
  TableWrapper,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@stax/ui';
import { PageHeader } from '~/components/app/page-header';
import { getWorkspace } from '~/lib/workspace';

export const metadata: Metadata = { title: 'Statistiques' };

const DATE = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' });
const NUMBER = new Intl.NumberFormat('fr-FR');

interface TopPage {
  path?: unknown;
  views?: unknown;
}

/** Pages les plus vues, agregees sur la periode, sans faire confiance au JSON. */
function mergeTopPages(
  rows: Array<{ breakdown: unknown }>,
): Array<{ path: string; views: number }> {
  const totals = new Map<string, number>();

  for (const row of rows) {
    const breakdown = row.breakdown;
    if (typeof breakdown !== 'object' || breakdown === null) continue;
    const pages = (breakdown as { top_pages?: unknown }).top_pages;
    if (!Array.isArray(pages)) continue;

    for (const entry of pages) {
      if (typeof entry !== 'object' || entry === null) continue;
      const page = entry as TopPage;
      if (typeof page.path !== 'string') continue;
      const views = typeof page.views === 'number' && Number.isFinite(page.views) ? page.views : 0;
      totals.set(page.path, (totals.get(page.path) ?? 0) + views);
    }
  }

  return [...totals.entries()]
    .map(([path, views]) => ({ path, views }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 10);
}

export default async function StatisticsPage() {
  const { workspace, db } = await getWorkspace();
  const site = workspace.currentSite;

  if (!workspace.capabilities.includes('analytics.view')) {
    return <PermissionDenied message="Votre rôle ne donne pas accès aux statistiques du site." />;
  }

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 30);
  const sinceDay = since.toISOString().slice(0, 10);

  const rows = site
    ? unwrapList<{
        day: string;
        pageviews: number;
        visitors: number;
        form_submissions: number;
        bookings: number;
        orders: number;
        revenue_cents: number;
        breakdown: unknown;
      }>(
        (await db
          .from('daily_site_metrics')
          .select(
            'day, pageviews, visitors, form_submissions, bookings, orders, revenue_cents, breakdown',
          )
          .eq('site_id', site.id)
          .gte('day', sinceDay)
          .order('day', { ascending: false })
          .limit(31)) as never,
      )
    : [];

  const totals = rows.reduce(
    (sum, row) => ({
      pageviews: sum.pageviews + row.pageviews,
      visitors: sum.visitors + row.visitors,
      submissions: sum.submissions + row.form_submissions,
      bookings: sum.bookings + row.bookings,
      orders: sum.orders + row.orders,
      revenueCents: sum.revenueCents + row.revenue_cents,
    }),
    { pageviews: 0, visitors: 0, submissions: 0, bookings: 0, orders: 0, revenueCents: 0 },
  );

  const contacts = totals.submissions + totals.bookings + totals.orders;
  const topPages = mergeTopPages(rows);

  return (
    <>
      <PageHeader
        title="Statistiques"
        description="Les trente derniers jours. Mesure sans cookie, sans identifiant publicitaire et sans revente : nous comptons les visites, nous ne suivons personne."
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={<Icon name="bar-chart-3" size={24} />}
          title="Pas encore de données"
          description="Les chiffres apparaissent dès que votre site est en ligne et reçoit ses premières visites. Comptez un jour avant les premiers relevés."
        />
      ) : (
        <div className="space-y-8">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Visiteurs"
              value={NUMBER.format(totals.visitors)}
              hint="30 derniers jours"
            />
            <Stat label="Pages vues" value={NUMBER.format(totals.pageviews)} />
            <Stat
              label="Prises de contact"
              value={NUMBER.format(contacts)}
              hint="Messages, réservations et commandes"
            />
            <Stat
              label="Encaissé sur le site"
              value={formatMoney(totals.revenueCents, 'EUR', { hideDecimalsWhenRound: true })}
            />
          </div>

          {topPages.length > 0 ? (
            <section aria-labelledby="pages" className="space-y-3">
              <h2 id="pages" className="text-base font-medium">
                Vos pages les plus consultées
              </h2>
              <TableWrapper label="Pages les plus consultées">
                <Table>
                  <THead>
                    <TR>
                      <TH scope="col">Page</TH>
                      <TH scope="col">Vues</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {topPages.map((page) => (
                      <TR key={page.path}>
                        <TD className="font-mono text-xs">{page.path}</TD>
                        <TD className="tabular-nums">{NUMBER.format(page.views)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrapper>
            </section>
          ) : null}

          <section aria-labelledby="jours" className="space-y-3">
            <h2 id="jours" className="text-base font-medium">
              Jour par jour
            </h2>
            <TableWrapper label="Fréquentation quotidienne">
              <Table>
                <THead>
                  <TR>
                    <TH scope="col">Jour</TH>
                    <TH scope="col">Visiteurs</TH>
                    <TH scope="col">Pages vues</TH>
                    <TH scope="col">Contacts</TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.map((row) => (
                    <TR key={row.day}>
                      <TD className="text-[var(--foreground-muted)]">
                        <time dateTime={row.day}>
                          {DATE.format(new Date(`${row.day}T12:00:00Z`))}
                        </time>
                      </TD>
                      <TD className="tabular-nums">{NUMBER.format(row.visitors)}</TD>
                      <TD className="tabular-nums">{NUMBER.format(row.pageviews)}</TD>
                      <TD className="tabular-nums">
                        {NUMBER.format(row.form_submissions + row.bookings + row.orders)}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
          </section>
        </div>
      )}

      <Panel level={1} padding="lg" className="mt-8">
        <h2 className="text-sm font-medium">Comment lire ces chiffres</h2>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-[var(--foreground-muted)]">
          Un « visiteur » est une personne distincte sur une journée, estimée sans cookie ni
          empreinte de navigateur. Ce comptage est volontairement approximatif : il ne permet pas de
          reconnaître quelqu’un d’un jour sur l’autre, et c’est ce qui le rend respectueux de la vie
          privée. Ne comparez pas ces chiffres à ceux d’un outil publicitaire : ils ne mesurent pas
          la même chose.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-[var(--foreground-muted)]">
          Le nombre qui compte vraiment pour votre activité, c’est celui des prises de contact. Cent
          visiteurs qui appellent valent mieux que dix mille qui passent.
        </p>
        <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
          Vous pouvez désactiver entièrement la mesure depuis{' '}
          <Link href="/app/entreprise" className="underline underline-offset-4">
            les réglages de votre entreprise
          </Link>
          .
        </p>
      </Panel>
    </>
  );
}
