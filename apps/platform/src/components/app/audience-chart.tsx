'use client';

import { useState } from 'react';
import { niceMax } from '~/lib/audience';

export interface AudiencePoint {
  day: string;
  visitors: number;
  pageviews: number;
  contacts: number;
}

const WIDTH = 720;
const HEIGHT = 220;
const PAD = { top: 12, right: 8, bottom: 26, left: 40 };
const PLOT_W = WIDTH - PAD.left - PAD.right;
const PLOT_H = HEIGHT - PAD.top - PAD.bottom;
const MAX_BAR = 24;
const GAP = 2;
const RADIUS = 4;

const SHORT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const LONG = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const NUMBER = new Intl.NumberFormat('fr-FR');

function asDate(day: string) {
  return new Date(`${day}T12:00:00Z`);
}

/** Colonne à extrémité arrondie, carrée sur la ligne de base. */
function columnPath(x: number, width: number, height: number) {
  const baseline = PAD.top + PLOT_H;
  const r = Math.min(RADIUS, width / 2, height);
  const top = baseline - height;
  return [
    `M${x},${baseline}`,
    `V${top + r}`,
    `Q${x},${top} ${x + r},${top}`,
    `H${x + width - r}`,
    `Q${x + width},${top} ${x + width},${top + r}`,
    `V${baseline}`,
    'Z',
  ].join(' ');
}

/**
 * Visiteurs par jour : une seule série, donc pas de légende (le titre la
 * nomme). Survol : la colonne s'accentue et une bulle donne le détail du jour.
 * Le tableau « Jour par jour », sous le graphique, en est la version texte.
 */
export function AudienceChart({ points, label }: { points: AudiencePoint[]; label: string }) {
  const [active, setActive] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...points.map((point) => point.visitors)));
  const slot = PLOT_W / Math.max(points.length, 1);
  const bar = Math.max(2, Math.min(MAX_BAR, slot - GAP));
  const ticks = [0, max / 2, max];
  const labelled = new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]);
  const focus = active === null ? null : points[active];

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full"
        role="img"
        aria-label={label}
        onPointerLeave={() => setActive(null)}
      >
        {ticks.map((tick) => {
          const y = PAD.top + PLOT_H - (tick / max) * PLOT_H;
          return (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={y}
                y2={y}
                stroke="var(--border)"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={y}
                dy="0.32em"
                textAnchor="end"
                fontSize={11}
                fill="var(--muted)"
              >
                {NUMBER.format(tick)}
              </text>
            </g>
          );
        })}

        {points.map((point, index) => {
          const x = PAD.left + index * slot + (slot - bar) / 2;
          const height = (point.visitors / max) * PLOT_H;
          return (
            <g key={point.day}>
              {height > 0 ? (
                <path
                  d={columnPath(x, bar, height)}
                  fill={active === index ? 'var(--accent-hover)' : 'var(--accent)'}
                  opacity={active === null || active === index ? 1 : 0.55}
                />
              ) : null}
              {/* Cible de survol : toute la hauteur de la colonne, plus large que la marque. */}
              <rect
                x={PAD.left + index * slot}
                y={PAD.top}
                width={slot}
                height={PLOT_H}
                fill="transparent"
                onPointerEnter={() => setActive(index)}
                onPointerDown={() => setActive(index)}
              >
                <title>
                  {`${LONG.format(asDate(point.day))} : ${NUMBER.format(point.visitors)} visiteur(s)`}
                </title>
              </rect>
              {labelled.has(index) ? (
                <text
                  x={PAD.left + index * slot + slot / 2}
                  y={HEIGHT - 8}
                  textAnchor={
                    index === 0 && points.length > 1
                      ? 'start'
                      : index === points.length - 1 && points.length > 1
                        ? 'end'
                        : 'middle'
                  }
                  fontSize={11}
                  fill="var(--muted)"
                >
                  {SHORT.format(asDate(point.day))}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>

      {focus && active !== null ? (
        <div
          role="status"
          className="pointer-events-none absolute top-0 z-10 w-max max-w-[16rem] -translate-x-1/2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2 text-xs shadow-md"
          style={{
            left: `${Math.min(88, Math.max(12, ((PAD.left + (active + 0.5) * slot) / WIDTH) * 100))}%`,
          }}
        >
          <p className="font-medium first-letter:uppercase">{LONG.format(asDate(focus.day))}</p>
          <dl className="mt-1 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-[var(--foreground-muted)]">
            <dt>Visiteurs</dt>
            <dd className="text-right text-[var(--foreground)] tabular-nums">
              {NUMBER.format(focus.visitors)}
            </dd>
            <dt>Pages vues</dt>
            <dd className="text-right text-[var(--foreground)] tabular-nums">
              {NUMBER.format(focus.pageviews)}
            </dd>
            <dt>Prises de contact</dt>
            <dd className="text-right text-[var(--foreground)] tabular-nums">
              {NUMBER.format(focus.contacts)}
            </dd>
          </dl>
        </div>
      ) : null}
    </div>
  );
}
