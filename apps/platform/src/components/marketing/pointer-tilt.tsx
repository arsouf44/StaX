'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { cn, useHasFinePointer, usePrefersReducedMotion } from '@stax/ui';

/**
 * Inclinaison au curseur.
 *
 * Le panneau se penche de quelques degres vers le pointeur, et un reflet suit
 * la main — comme une vitre que l on tient. Amplitude faible (4 deg), aucun
 * effet au toucher ni quand l utilisateur demande moins de mouvement : le
 * panneau reste alors simplement pose.
 */
export function PointerTilt({
  children,
  className,
  maxDeg = 4,
}: {
  children: ReactNode;
  className?: string;
  maxDeg?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const finePointer = useHasFinePointer();

  useEffect(() => {
    if (reduced || !finePointer) return;
    const element = ref.current;
    if (!element) return;

    let frame = 0;
    let target = { x: 0, y: 0 };
    const apply = () => {
      frame = 0;
      element.style.setProperty('--tilt-x', `${(-target.y * maxDeg).toFixed(2)}deg`);
      element.style.setProperty('--tilt-y', `${(target.x * maxDeg).toFixed(2)}deg`);
      element.style.setProperty('--glare-x', `${((target.x + 1) * 50).toFixed(1)}%`);
      element.style.setProperty('--glare-y', `${((target.y + 1) * 50).toFixed(1)}%`);
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(apply);
    };
    const onMove = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      target = {
        x: Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1)),
        y: Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1)),
      };
      element.dataset.tilting = 'true';
      schedule();
    };
    const onLeave = () => {
      target = { x: 0, y: 0 };
      delete element.dataset.tilting;
      schedule();
    };

    element.addEventListener('pointermove', onMove);
    element.addEventListener('pointerleave', onLeave);
    return () => {
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerleave', onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [reduced, finePointer, maxDeg]);

  return (
    <div
      ref={ref}
      className={cn(
        '[transform:perspective(1600px)_rotateX(var(--tilt-x,0deg))_rotateY(var(--tilt-y,0deg))] transition-transform duration-500 ease-out data-[tilting=true]:duration-150',
        className,
      )}
    >
      {children}
    </div>
  );
}
