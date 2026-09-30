import type { Metadata } from 'next';
import Link from 'next/link';
import { unwrapList, unwrapMaybe } from '@nemasus/database';
import { formatMoney } from '@nemasus/payments';
import {
  Alert,
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
} from '@nemasus/ui';
import { AudienceChart } from '~/components/app/audience-chart';
import { FilterTabs } from '~/components/app/filter-tabs';
import { PageHeader } from '~/components/app/page-header';
import {
  dayOffset,
  daySeries,
  deltaBps,
  deviceSplit,
  parsePeriod,
  PERIODS,
  topCountries,
  topPages,
  topSources,
  totalsOf,
  type MetricsRow,
} from '~/lib/audience';
import { getWorkspace } from '~/lib/workspace';

export const metadata: Metadata = { title: 'Statistiques' };

const DATE = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' });
const NUMBER = new Intl.NumberFormat('fr-FR');
const PERCENT = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 0 });

/** Jour courant AAAA-MM-JJ dans le fuseau du site (celui des relevés). */
function todayIn(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
  }
}

export default async function StatisticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { workspace, db } = await getWorkspace();
  const site = workspace.currentSite;

  if (!workspace.capabilities.includes('analytics.view')) {
    return <PermissionDenied message="Votre rôle ne donne pas accès aux statistiques du site." />;
  }

  const period = parsePeriod((await searchParams).periode);

  const [siteRow, settingsRow] = site
    ? await Promise.all([
        db.from('sites').select('timezone').eq('id', site.id).maybeSingle(),
        db
          .from('site_settings')
          .select('analytics_enabled, integration_settings')
          .eq('site_id', site.id)
          .maybeSingle(),
      ])
    : [null, null];
  const timezone =
    unwrapMaybe<{ timezone: string | null }>((siteRow ?? { data: null, error: null }) as never)
      ?.timezone ?? 'Europe/Paris';
  const settings = unwrapMaybe<{
    analytics_enabled: boolean | null;
    integration_settings: Record<string, unknown> | null;
  }>((settingsRow ?? { data: null, error: null }) as never);
  const measurementOff = settings?.analytics_enabled === false;
  // Un site développé hors de Nemasus ne mesure son audience que si son
  // développeur a branché le script de mesure (`integrations.analytics`).
  const notWired =
    site?.architecture === 'external_repository' &&
    settings?.integration_settings?.['analytics'] !== true;

  const today = todayIn(timezone);
  const since = dayOffset(today, period * 2 - 1);
  const currentStart = dayOffset(today, period - 1);

  const rows = site
    ? unwrapList<MetricsRow>(
        (await db
          .from('daily_site_metrics')
          .select(
            'day, pageviews, visitors, form_submissions, bookings, orders, revenue_cents, breakdown',
          )
          .eq('site_id', site.id)
          .gte('day', since)
          .lte('day', today)
          .order('day', { ascending: false })
          .limit(period * 2 + 1)) as never,
      )
    : [];

  const current = rows.filter((row) => row.day >= currentStart);
  const previous = rows.filter((row) => row.day < currentStart);
  const totals = totalsOf(current);
  const before = totalsOf(previous);
  const previousMeasured = previous.length > 0;

  const byDay = new Map(current.map((row) => [row.day, row]));
  const points = daySeries(today, period).map((day) => {
    const row = byDay.get(day);
    return {
      day,
      visitors: row?.visitors ?? 0,
      pageviews: row?.pageviews ?? 0,
      contacts: row ? row.form_submissions + row.bookings + row.orders : 0,
    };
  });

  const pages = topPages(current);
  const sources = topSources(current);
  const devices = deviceSplit(current);
  const countries = topCountries(current);
  const referred = sources.reduce((sum, source) => sum + source.visits, 0);
  const direct = Math.max(0, totals.pageviews - referred);
  const sourceMax = Math.max(direct, ...sources.map((source) => source.visits), 1);

  return (
    <>
      <PageHeader
        title="Statistiques"
        description="Mesure sans cookie, sans identifiant publicitaire et sans revente : nous comptons les visites, nous ne suivons personne."
      />

      <div className="mb-6">
        <FilterTabs
          ariaLabel="Période"
          active={String(period)}
          tabs={PERIODS.map((value) => ({ value: String(value), label: `${value} jours` }))}
          buildHref={(value) => `/app/statistiques?periode=${value}`}
        />
      </div>

      {measurementOff ? (
        <Alert tone="info" title="Mesure d’audience désactivée" className="mb-6">
          Vous avez désactivé la mesure : aucune visite n’est comptée. Les prises de contact restent
          comptées. Vous pouvez la réactiver depuis{' '}
          <Link href="/app/entreprise" className="underline underline-offset-4">
            les réglages de votre entreprise
          </Link>
          .
        </Alert>
      ) : notWired ? (
        <Alert tone="info" title="Mesure d’audience pas encore branchée" className="mb-6">
          Votre site n’envoie pas encore ses visites à Nemasus : seules les prises de contact sont
          comptées.{' '}
          <Link href="/app/support" className="underline underline-offset-4">
            Demandez-nous de l’activer
          </Link>{' '}
          : c’est inclus dans votre offre.
        </Alert>
      ) : null}

      {current.length === 0 ? (
        <EmptyState
          icon={<Icon name="bar-chart-3" size={24} />}
          title="Pas encore de données"
          description="Les chiffres apparaissent dès que votre site est en ligne et reçoit ses premières visites. Ils sont recalculés chaque heure."
        />
      ) : (
        <div className="space-y-8">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Visiteurs"
              value={NUMBER.format(totals.visitors)}
              deltaBps={deltaBps(totals.visitors, before.visitors, previousMeasured) ?? undefined}
              hint={`${period} derniers jours`}
            />
            <Stat
              label="Pages vues"
              value={NUMBER.format(totals.pageviews)}
              deltaBps={deltaBps(totals.pageviews, before.pageviews, previousMeasured) ?? undefined}
            />
            <Stat
              label="Prises de contact"
              value={NUMBER.format(totals.contacts)}
              deltaBps={deltaBps(totals.contacts, before.contacts, previousMeasured) ?? undefined}
              hint="Messages, réservations et commandes"
            />
            <Stat
              label="Encaissé sur le site"
              value={formatMoney(totals.revenueCents, 'EUR', { hideDecimalsWhenRound: true })}
              hint={`${NUMBER.format(totals.orders)} commande(s) payée(s)`}
            />
          </div>
          {previousMeasured ? (
            <p className="-mt-5 text-xs text-[var(--muted)]">
              Variations comparées aux {period} jours précédents.
            </p>
          ) : null}

          <Panel level={1} padding="lg">
            <h2 className="text-base font-medium">Visiteurs par jour</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Survolez une colonne pour le détail du jour.
            </p>
            <div className="mt-4">
              <AudienceChart
                points={points}
                label={`Visiteurs par jour sur ${period} jours : ${NUMBER.format(totals.visitors)} au total. Détail dans le tableau « Jour par jour ».`}
              />
            </div>
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel level={1} padding="lg">
              <h2 className="text-base font-medium">D’où viennent vos visiteurs</h2>
              {totals.pageviews === 0 ? (
                <p className="mt-3 text-sm text-[var(--foreground-muted)]">
                  Aucune visite mesurée sur la période.
                </p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {[{ key: 'direct', label: 'Accès direct ou favori', visits: direct }]
                    .concat(
                      sources.map((source) => ({
                        key: source.host,
                        label:
                          source.label === source.host
                            ? source.host
                            : `${source.label} · ${source.host}`,
                        visits: source.visits,
                      })),
                    )
                    .filter((entry) => entry.visits > 0)
                    .map((entry) => (
                      <li key={entry.key}>
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="min-w-0 truncate">{entry.label}</span>
                          <span className="shrink-0 text-[var(--foreground-muted)] tabular-nums">
                            {NUMBER.format(entry.visits)}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-[var(--surface-hover)]">
                          <div
                            className="h-1.5 rounded-full bg-[var(--accent)]"
                            style={{ width: `${Math.max(2, (entry.visits / sourceMax) * 100)}%` }}
                          />
                        </div>
                      </li>
                    ))}
                </ul>
              )}
              <p className="mt-4 text-xs text-[var(--muted)]">
                Pages vues arrivées depuis chaque site. Seule l’adresse du site d’origine est
                connue, jamais la page ni la recherche.
              </p>
            </Panel>

            <Panel level={1} padding="lg">
              <h2 className="text-base font-medium">Sur quel appareil</h2>
              {devices.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--foreground-muted)]">
                  Pas encore mesuré sur la période.
                </p>
              ) : (
                <ul className="mt-4 grid gap-3 sm:grid-cols-3">
                  {devices.map((device) => (
                    <li
                      key={device.key}
                      className="rounded-[var(--radius-md)] border border-[var(--border)] p-3"
                    >
                      <p className="flex items-center gap-2 text-sm text-[var(--foreground-muted)]">
                        <Icon
                          name={
                            device.key === 'desktop'
                              ? 'monitor'
                              : device.key === 'tablet'
                                ? 'tablet'
                                : 'smartphone'
                          }
                          size={14}
                          aria-hidden="true"
                        />
                        {device.label}
                      </p>
                      <p className="mt-1 text-2xl font-medium tabular-nums">
                        {PERCENT.format(device.share)}
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        {NUMBER.format(device.visitors)} visiteur(s)
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              {countries.length > 0 ? (
                <>
                  <h3 className="mt-6 text-sm font-medium">Pays</h3>
                  <ul className="mt-2 space-y-1 text-sm">
                    {countries.map((country) => (
                      <li key={country.code} className="flex justify-between gap-3">
                        <span>{country.label}</span>
                        <span className="text-[var(--foreground-muted)] tabular-nums">
                          {NUMBER.format(country.visitors)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </Panel>
          </div>

          {pages.length > 0 ? (
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
                    {pages.map((page) => (
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
                  {current.map((row) => (
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
          privée. Les robots des moteurs de recherche ne sont pas comptés. Ne comparez pas ces
          chiffres à ceux d’un outil publicitaire : ils ne mesurent pas la même chose.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-[var(--foreground-muted)]">
          Le nombre qui compte vraiment pour votre activité, c’est celui des prises de contact. Cent
          visiteurs qui appellent valent mieux que dix mille qui passent.
        </p>
        <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
          Chiffres recalculés chaque heure. Le 1er de chaque mois, le bilan du mois écoulé vous est
          envoyé par e-mail (réglable dans{' '}
          <Link href="/app/compte" className="underline underline-offset-4">
            Mon compte
          </Link>
          ). Vous pouvez désactiver entièrement la mesure depuis{' '}
          <Link href="/app/entreprise" className="underline underline-offset-4">
            les réglages de votre entreprise
          </Link>
          .
        </p>
      </Panel>
    </>
  );
}
