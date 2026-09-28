'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@nemasus/ui';
import { Art, type ArtName } from './studio-art';

/**
 * La methode en quatre temps : l illustration suit l etape.
 *
 * Toutes les etapes restent lisibles en permanence ; seule l image change.
 * A l ecran, les etapes defilent seules (une barre montre le temps restant)
 * jusqu a ce que le visiteur en choisisse une. Rien ne defile avec
 * `prefers-reduced-motion`.
 */

interface Step {
  title: string;
  text: string;
  art: ArtName;
  label: string;
}

const STEPS: readonly Step[] = [
  {
    title: 'Conception',
    text: 'Structure, contenus, identité visuelle et fonctionnalités. Vous suivez l’avancement et validez les choix importants depuis votre espace.',
    art: 'design',
    label: 'Maquette d’un site sur une grille de douze colonnes',
  },
  {
    title: 'Développement',
    text: 'Notre équipe code votre site dans un projet qui n’appartient qu’à lui. Aucun modèle, aucune génération automatique.',
    art: 'build',
    label: 'La même page construite, avec son code à côté',
  },
  {
    title: 'Mise en ligne',
    text: 'Déploiement sur Cloudflare, votre domaine en HTTPS, puis nos vérifications : mobile, formulaires, référencement.',
    art: 'launch',
    label: 'Le site en ligne sur son domaine, HTTPS, redirections et statistiques vérifiés',
  },
  {
    title: 'Suivi',
    text: 'À la livraison, l’éditeur s’ouvre et la maintenance commence : hébergement, sauvegardes, surveillance, statistiques.',
    art: 'grow',
    label: 'Demandes reçues et visibilité en hausse sur quatre trimestres',
  },
];

const DWELL_MS = 5000;

export function ProcessShowcase() {
  const [active, setActive] = useState(0);
  const [chosen, setChosen] = useState(false);
  const [inView, setInView] = useState(false);
  const [reduced, setReduced] = useState(false);
  const mediaRef = useRef<HTMLDivElement>(null);
  const playing = inView && !chosen && !reduced;

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    const raf = requestAnimationFrame(update);
    query.addEventListener('change', update);
    const element = mediaRef.current;
    const observer = element
      ? new IntersectionObserver(([entry]) => setInView(Boolean(entry?.isIntersecting)), {
          threshold: 0.35,
        })
      : null;
    if (element) observer?.observe(element);
    return () => {
      cancelAnimationFrame(raf);
      query.removeEventListener('change', update);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => setActive((n) => (n + 1) % STEPS.length), DWELL_MS);
    return () => window.clearTimeout(timer);
  }, [playing, active]);

  const choose = (index: number) => {
    setChosen(true);
    setActive(index);
  };

  const current = STEPS[active] ?? STEPS[0];

  return (
    <div className="mt-14 grid items-center gap-[clamp(28px,5vw,76px)] lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <figure
        ref={mediaRef}
        className="relative aspect-[4/3] max-w-full overflow-hidden rounded-[14px] bg-[#fafbfb] shadow-[0_30px_68px_-46px_rgb(24_36_50/0.55)]"
      >
        {STEPS.map((step, index) => (
          <div
            key={step.art}
            className={cn(
              'absolute inset-0 transition-[opacity,transform] duration-1000 ease-[cubic-bezier(0.19,0.85,0.22,1)]',
              index === active ? 'scale-100 opacity-100' : 'scale-[1.035] opacity-0',
            )}
          >
            <Art name={step.art} label={index === active ? step.label : undefined} />
          </div>
        ))}
        <figcaption
          aria-live="polite"
          className="absolute bottom-[18px] left-[18px] z-10 flex items-center gap-4 rounded-[12px] border border-white/80 bg-[linear-gradient(158deg,rgb(252_253_253/0.88),rgb(240_243_246/0.72))] py-3 pr-4 pl-3.5 shadow-[inset_0_1px_0_#fffffff2,0_30px_68px_-46px_rgb(24_36_50/0.55)] backdrop-blur-[14px]"
        >
          <span className="text-[13px] text-[var(--ink-3)] tabular-nums">
            {String(active + 1).padStart(2, '0')} / {String(STEPS.length).padStart(2, '0')}
          </span>
          <span className="min-w-[6.5em] font-serif text-[22px] leading-none text-[var(--ink)]">
            {current?.title}
          </span>
        </figcaption>
      </figure>

      <ol className="flex flex-col">
        {STEPS.map((step, index) => {
          const on = index === active;
          return (
            <li key={step.title} className="relative border-t border-[var(--border)] last:border-b">
              <span
                aria-hidden="true"
                key={on && playing ? `bar-${active}` : 'bar'}
                className={cn(
                  'absolute top-[-1px] left-0 h-px w-full origin-left bg-[var(--ink)]',
                  on
                    ? playing
                      ? 'animate-[nemasus-progress_5s_linear_both]'
                      : 'scale-x-100 transition-transform duration-700'
                    : 'scale-x-0',
                )}
              />
              <button
                type="button"
                aria-pressed={on}
                onClick={() => choose(index)}
                onMouseEnter={() => choose(index)}
                className="group grid w-full cursor-pointer grid-cols-[40px_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 py-[22px] text-left"
              >
                <span
                  className={cn(
                    'text-[13px] tabular-nums transition-colors duration-500',
                    on ? 'text-[var(--ink)]' : 'text-[var(--ink-3)]',
                  )}
                >
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span
                  className={cn(
                    'font-serif text-[clamp(21px,2vw,27px)] leading-tight transition-colors duration-500',
                    on ? 'text-[var(--ink)]' : 'text-[var(--ink-2)] group-hover:text-[var(--ink)]',
                  )}
                >
                  {step.title}
                </span>
                <span
                  className={cn(
                    'col-start-2 max-w-[44ch] text-[14.5px] leading-relaxed transition-colors duration-500',
                    on ? 'text-[var(--ink-2)]' : 'text-[var(--muted)]',
                  )}
                >
                  {step.text}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
