'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../lib';
import { useHasFinePointer, usePrefersReducedMotion } from '../hooks';

/**
 * Mouvement.
 *
 * Trois regles, appliquees sans exception :
 *  1. `prefers-reduced-motion` desactive tout mouvement, et le contenu reste
 *     immediatement visible — jamais bloque dans un etat d entree ;
 *  2. aucun detournement du defilement ;
 *  3. tout se fait par `transform` et `opacity`, jamais par des proprietes qui
 *     declenchent un recalcul de mise en page.
 */

export interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Retard d apparition en millisecondes, pour un effet de cascade. */
  delay?: number;
  as?: 'div' | 'section' | 'li' | 'article' | 'header';
}

/** Apparition au defilement. Ne se declenche qu une fois par element. */
export function Reveal({ children, className, delay = 0, as: Tag = 'div' }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const [intersected, setIntersected] = useState(false);
  // Valeur derivee : quand l'utilisateur demande moins d'animations, le
  // contenu est visible immediatement, sans passer par un etat intermediaire.
  const revealed = reduced || intersected;

  useEffect(() => {
    if (reduced) return;
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setIntersected(true);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [reduced]);

  return (
    <Tag
      ref={ref as never}
      data-revealed={revealed ? 'true' : 'false'}
      style={delay > 0 && !reduced ? { transitionDelay: `${delay}ms` } : undefined}
      className={cn('reveal-on-scroll', className)}
    >
      {children}
    </Tag>
  );
}

/**
 * Parallaxe tres legere.
 * Amplitude volontairement faible (24 px maximum) : au-dela, l effet devient
 * une gene plutot qu une profondeur.
 */
export function Parallax({
  children,
  speed = 0.08,
  className,
}: {
  children: ReactNode;
  speed?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const element = ref.current;
    if (!element) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = element.getBoundingClientRect();
      const progress = (rect.top + rect.height / 2 - window.innerHeight / 2) / window.innerHeight;
      const offset = Math.max(Math.min(progress * speed * 200, 24), -24);
      element.style.transform = `translate3d(0, ${offset.toFixed(2)}px, 0)`;
    };
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [speed, reduced]);

  return (
    <div ref={ref} className={cn('will-change-transform', className)}>
      {children}
    </div>
  );
}

/**
 * Surface qui reagit doucement au curseur.
 * Le suivi est desactive sur les appareils tactiles : il n y a pas de curseur,
 * et l ecoute couterait des cycles pour rien.
 */
export function PointerGlow({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const finePointer = useHasFinePointer();

  useEffect(() => {
    if (reduced || !finePointer) return;
    const element = ref.current;
    if (!element) return;

    const onMove = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      element.style.setProperty('--pointer-x', `${event.clientX - rect.left}px`);
      element.style.setProperty('--pointer-y', `${event.clientY - rect.top}px`);
    };
    element.addEventListener('pointermove', onMove);
    return () => element.removeEventListener('pointermove', onMove);
  }, [reduced, finePointer]);

  return (
    <div ref={ref} className={cn('cursor-glow', className)}>
      {children}
    </div>
  );
}

/**
 * Compteur anime.
 * Ne fabrique aucune donnee : il anime une valeur REELLE deja chargee.
 */
export function AnimatedNumber({
  value,
  format,
  className,
  durationMs = 900,
}: {
  value: number;
  format?: (value: number) => string;
  className?: string;
  durationMs?: number;
}) {
  const [animated, setAnimated] = useState<number | null>(null);
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);
  // Sans animation, ou avant l'entree dans le champ de vision, on affiche
  // directement la valeur reelle : aucune donnee n'est jamais inventee.
  const display = reduced || animated === null ? value : animated;

  useEffect(() => {
    if (reduced) return;
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (!entry?.isIntersecting || started.current) return;
      started.current = true;
      observer.disconnect();

      const from = 0;
      const startedAt = performance.now();
      const step = (now: number) => {
        const progress = Math.min((now - startedAt) / durationMs, 1);
        // Courbe d attenuation : demarrage rapide, arret net sur la valeur exacte.
        const eased = 1 - Math.pow(1 - progress, 3);
        setAnimated(Math.round(from + (value - from) * eased));
        if (progress < 1) requestAnimationFrame(step);
        else setAnimated(value);
      };
      requestAnimationFrame(step);
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [value, durationMs, reduced]);

  return (
    <span ref={ref} className={cn('tabular-nums', className)}>
      {format ? format(display) : display.toLocaleString('fr-FR')}
    </span>
  );
}

/** Cascade d apparitions : chaque enfant entre a son tour. */
export function Stagger({
  children,
  className,
  step = 70,
}: {
  children: ReactNode[];
  className?: string;
  step?: number;
}) {
  return (
    <div className={className}>
      {children.map((child, index) => (
        <Reveal key={index} delay={index * step}>
          {child}
        </Reveal>
      ))}
    </div>
  );
}
