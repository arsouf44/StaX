import type { Metadata } from 'next';
import Link from 'next/link';
import { unwrapList } from '@nemasus/database';
import { EmptyState, Icon, Panel, PermissionDenied, Stat, StatusPill } from '@nemasus/ui';
import { PageHeader } from '~/components/app/page-header';
import { getWorkspace } from '~/lib/workspace';
import { QualityCheckButton } from './check-button';
import { countOf } from '~/lib/plural';

export const metadata: Metadata = { title: 'Bilan de santé' };

const DATE = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });
const DATE_TIME = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
const PERCENT = new Intl.NumberFormat('fr-FR', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});

interface Availability {
  days: number;
  checks: number;
  up: number;
  uptimeBps: number | null;
  avgResponseMs: number | null;
  lastDownAt: string | null;
  series: Array<{ day: string; total: number; up: number }>;
}

interface Check {
  key: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
  advice: string | null;
}

interface Report {
  id: string;
  url: string;
  score: number;
  max_score: number;
  response_ms: number | null;
  checks: Check[];
  checked_at: string;
}

function percentScore(report: Pick<Report, 'score' | 'max_score'>): number {
  return report.max_score > 0 ? Math.round((report.score / report.max_score) * 100) : 0;
}

/** Les 30 derniers jours, sans trou : un jour sans vérification est « non mesuré ». */
function lastDays(series: Availability['series'], days: number) {
  const byDay = new Map(series.map((entry) => [entry.day, entry]));
  const today = new Date();
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (days - 1 - index));
    const day = date.toISOString().slice(0, 10);
    const entry = byDay.get(day);
    return { day, total: entry?.total ?? 0, up: entry?.up ?? 0 };
  });
}

/**
 * Bilan de santé d'un site livré : ce que la maintenance surveille, chiffres
 * réels à l'appui. La disponibilité vient des vérifications HTTPS (toutes les
 * dix minutes), le bilan qualité d'un contrôle hebdomadaire de la page
 * d'accueil. Rien n'est affiché qui n'ait été mesuré.
 */
export default async function SiteHealthPage() {
  const { workspace, db } = await getWorkspace();
  const site = workspace.currentSite;

  if (!workspace.capabilities.includes('content.view')) {
    return <PermissionDenied message="Votre rôle ne donne pas accès au bilan du site." />;
  }
  if (!site || site.architecture !== 'external_repository' || !site.deliveredAt) {
    return (
      <>
        <PageHeader title="Bilan de santé" />
        <EmptyState
          icon={<Icon name="activity" size={24} />}
          title="Disponible à la livraison"
          description="Dès que votre site vous est livré, nous vérifions qu’il répond toutes les dix minutes et nous contrôlons sa qualité chaque semaine. Les résultats s’affichent ici."
        />
      </>
    );
  }

  const [availabilityResult, reports] = await Promise.all([
    db.rpc('site_availability', { p_site: site.id, p_days: 30 }),
    db
      .from('site_quality_reports')
      .select('id, url, score, max_score, response_ms, checks, checked_at')
      .eq('site_id', site.id)
      .order('checked_at', { ascending: false })
      .limit(8),
  ]);
  const availability = (
    availabilityResult.error ? null : availabilityResult.data
  ) as Availability | null;
  // Table absente (migration 0063 pas encore appliquée) : pas de bilan, pas d'erreur.
  const history = reports.error ? [] : unwrapList<Report>(reports as never);
  const latest = history[0] ?? null;
  const checks = Array.isArray(latest?.checks) ? latest.checks : [];
  const failing = checks.filter((item) => item.status === 'fail');
  const warnings = checks.filter((item) => item.status === 'warn');
  const passing = checks.filter((item) => item.status === 'pass');
  const days = availability ? lastDays(availability.series, 30) : [];

  return (
    <>
      <PageHeader
        title="Bilan de santé"
        description={`Ce que la maintenance surveille pour ${site.name} : sa disponibilité, vérifiée toutes les dix minutes, et sa qualité, contrôlée chaque semaine.`}
      />

      <div className="space-y-8">
        <section aria-labelledby="disponibilite" className="space-y-4">
          <h2 id="disponibilite" className="text-base font-medium">
            Disponibilité sur 30 jours
          </h2>
          {!availability || availability.checks === 0 ? (
            <Panel level={1} padding="lg">
              <p className="text-sm text-[var(--foreground-muted)]">
                Première vérification à venir : les chiffres apparaissent après quelques heures de
                surveillance.
              </p>
            </Panel>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <Stat
                  label="Disponibilité"
                  value={
                    availability.uptimeBps === null
                      ? '—'
                      : PERCENT.format(availability.uptimeBps / 10_000)
                  }
                  hint={`${availability.up.toLocaleString('fr-FR')} vérifications réussies sur ${availability.checks.toLocaleString('fr-FR')}`}
                />
                <Stat
                  label="Temps de réponse moyen"
                  value={
                    availability.avgResponseMs === null
                      ? '—'
                      : `${availability.avgResponseMs.toLocaleString('fr-FR')} ms`
                  }
                />
                <Stat
                  label="Dernière indisponibilité"
                  value={
                    availability.lastDownAt
                      ? DATE.format(new Date(availability.lastDownAt))
                      : 'Aucune'
                  }
                  hint={
                    availability.lastDownAt
                      ? 'Nous sommes prévenus à chaque incident.'
                      : 'Aucune vérification en échec sur la période.'
                  }
                />
              </div>
              <Panel level={1} padding="lg">
                <ol
                  className="flex h-10 items-stretch gap-[2px]"
                  aria-label="Disponibilité jour par jour sur les 30 derniers jours"
                >
                  {days.map((day) => {
                    const state =
                      day.total === 0
                        ? { tone: 'bg-[var(--surface-hover)]', label: 'non mesuré' }
                        : day.up === day.total
                          ? { tone: 'bg-[var(--success)]', label: 'aucun incident' }
                          : day.up / day.total >= 0.95
                            ? { tone: 'bg-[var(--warning)]', label: 'incident bref' }
                            : { tone: 'bg-[var(--danger)]', label: 'indisponibilité' };
                    const text = `${DATE.format(new Date(`${day.day}T12:00:00Z`))} : ${state.label}${
                      day.total > 0 ? ` (${day.up}/${day.total} vérifications réussies)` : ''
                    }`;
                    return (
                      <li
                        key={day.day}
                        className={`flex-1 rounded-[3px] ${state.tone}`}
                        title={text}
                        aria-label={text}
                      />
                    );
                  })}
                </ol>
                <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2.5 rounded-[2px] bg-[var(--success)]" /> aucun incident
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2.5 rounded-[2px] bg-[var(--warning)]" /> incident bref
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2.5 rounded-[2px] bg-[var(--danger)]" /> indisponibilité
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2.5 rounded-[2px] bg-[var(--surface-hover)]" /> non mesuré
                  </span>
                </p>
              </Panel>
            </>
          )}
        </section>

        <section aria-labelledby="qualite" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="qualite" className="text-base font-medium">
                Bilan qualité de la page d’accueil
              </h2>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {latest
                  ? `Contrôlé le ${DATE_TIME.format(new Date(latest.checked_at))} sur ${latest.url}`
                  : 'Premier contrôle à venir (chaque semaine, automatiquement).'}
              </p>
            </div>
            <QualityCheckButton />
          </div>

          {latest ? (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <Stat label="Score" value={`${percentScore(latest)} / 100`} />
                <Stat label="À corriger" value={String(failing.length)} />
                <Stat label="À améliorer" value={String(warnings.length)} />
              </div>

              {failing.length + warnings.length > 0 ? (
                <Panel level={1} padding="lg">
                  <ul className="divide-y divide-[var(--border)]">
                    {[...failing, ...warnings].map((item) => (
                      <li key={item.key} className="py-3 first:pt-0 last:pb-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusPill tone={item.status === 'fail' ? 'danger' : 'warning'}>
                            {item.status === 'fail' ? 'À corriger' : 'À améliorer'}
                          </StatusPill>
                          <p className="text-sm font-medium">{item.label}</p>
                        </div>
                        <p className="mt-1 text-sm text-[var(--foreground-muted)]">{item.detail}</p>
                        {item.advice ? (
                          <p className="mt-1 text-xs text-[var(--muted)]">{item.advice}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4 text-xs text-[var(--muted)]">
                    Ce qui relève de vos contenus (titre, description, textes des photos) se corrige
                    dans{' '}
                    <Link href="/app/editeur" className="underline underline-offset-4">
                      l’éditeur
                    </Link>
                    . Le reste relève du code du site :{' '}
                    <Link href="/app/support" className="underline underline-offset-4">
                      demandez-le à l’équipe
                    </Link>
                    , c’est compris dans la maintenance.
                  </p>
                </Panel>
              ) : (
                <Panel level={1} padding="lg">
                  <p className="text-sm text-[var(--foreground-muted)]">
                    Tous les contrôles sont au vert.
                  </p>
                </Panel>
              )}

              {passing.length > 0 ? (
                <details className="rounded-[var(--radius-md)] border border-[var(--border)] p-4">
                  <summary className="cursor-pointer text-sm font-medium">
                    {countOf(passing.length, 'contrôle')} au vert
                  </summary>
                  <ul className="mt-3 space-y-2">
                    {passing.map((item) => (
                      <li key={item.key} className="flex items-start gap-2 text-sm">
                        <Icon
                          name="check"
                          size={14}
                          className="mt-0.5 text-[var(--success)]"
                          aria-hidden="true"
                        />
                        <span>
                          {item.label}
                          <span className="text-[var(--muted)]"> — {item.detail}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}

              {history.length > 1 ? (
                <div>
                  <h3 className="text-sm font-medium">Évolution</h3>
                  <ul className="mt-2 flex flex-wrap gap-2 text-xs">
                    {history
                      .slice()
                      .reverse()
                      .map((report) => (
                        <li
                          key={report.id}
                          className="rounded-[var(--radius-sm)] border border-[var(--border)] px-2 py-1"
                        >
                          <span className="text-[var(--muted)]">
                            {DATE.format(new Date(report.checked_at))}
                          </span>{' '}
                          <span className="font-medium tabular-nums">{percentScore(report)}</span>
                        </li>
                      ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}
        </section>
      </div>
    </>
  );
}
