'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@stax/ui';

/**
 * Apercu du brouillon, rendu par le moteur public.
 *
 * DOUBLE TAMPON : chaque modification recharge l apercu dans un second cadre
 * invisible ; on ne l affiche qu une fois charge. Le client ne voit ni page
 * blanche ni saut de defilement entre deux frappes.
 *
 * Le document de l apercu vit dans une origine opaque (bac a sable sans
 * `allow-same-origin`) : il ne peut rien lire de la plateforme. Il ne fait que
 * nous envoyer des messages — et on ne tient compte que de ceux qui viennent
 * reellement de ses cadres.
 */

export type Viewport = 'desktop' | 'tablet' | 'mobile';

/**
 * Largeur REELLE a laquelle la page est rendue. Sur un ecran plus etroit, le
 * rendu est reduit pour tenir, mais la mise en page reste celle de l appareil
 * choisi : en mode ordinateur, le client voit son menu d ordinateur, pas le
 * menu repliable d un telephone parce que la colonne centrale est etroite.
 */
const WIDTHS: Record<Viewport, number> = {
  desktop: 1280,
  tablet: 834,
  mobile: 390,
};

export interface PreviewSelection {
  blockId: string;
  field: string | null;
  index: number | null;
}

export function PreviewFrame({
  pageId,
  version,
  viewport,
  selectedId,
  onSelect,
  title,
}: {
  pageId: string;
  /** Change a chaque enregistrement : declenche un rechargement. */
  version: number;
  viewport: Viewport;
  selectedId: string | null;
  onSelect: (selection: PreviewSelection) => void;
  title: string;
}) {
  const frames = [useRef<HTMLIFrameElement>(null), useRef<HTMLIFrameElement>(null)];
  const [front, setFront] = useState(0);
  const [sources, setSources] = useState<[string | null, string | null]>([null, null]);
  const scrollRef = useRef(0);
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const stageRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState<number | null>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const style = getComputedStyle(stage);
      const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      setAvailable(Math.max(0, stage.clientWidth - padding));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const target = WIDTHS[viewport];
  const scale = available ? Math.min(1, available / target) : 1;

  // Nouvelle version : chargee dans le cadre cache, qui passera devant une
  // fois pret. La position de defilement et la selection sont conservees.
  useEffect(() => {
    const params = new URLSearchParams({
      page: pageId,
      mode: 'editor',
      y: String(scrollRef.current),
      v: String(version),
    });
    if (selectedRef.current) params.set('sel', selectedRef.current);
    const src = `/app/editeur/apercu?${params.toString()}`;
    setSources((current) => {
      const back = current[0] === null && current[1] === null ? 0 : front === 0 ? 1 : 0;
      const next: [string | null, string | null] = [...current];
      next[back] = src;
      return next;
    });
    // `front` est volontairement absent : il change EN REPONSE au chargement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId, version]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const fromFrame = frames.some((frame) => frame.current?.contentWindow === event.source);
      if (!fromFrame) return;
      const data = event.data as {
        source?: string;
        type?: string;
        blockId?: string;
        field?: string | null;
        index?: number | null;
        y?: number;
      };
      if (data?.source !== 'stax-preview') return;
      if (data.type === 'scroll' && typeof data.y === 'number') scrollRef.current = data.y;
      if (data.type === 'select' && typeof data.blockId === 'string') {
        onSelectRef.current({
          blockId: data.blockId,
          field: typeof data.field === 'string' ? data.field : null,
          index: typeof data.index === 'number' ? data.index : null,
        });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // Les refs sont stables.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Selection depuis la liste : la section est mise en evidence dans l apercu.
  useEffect(() => {
    const target = frames[front]?.current?.contentWindow;
    if (!target || !selectedId) return;
    // Origine opaque : `*` est la seule cible possible. Le message ne contient
    // qu un identifiant de section, rien de sensible.
    target.postMessage({ type: 'stax:select', blockId: selectedId, scroll: true }, '*');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, front]);

  return (
    <div
      ref={stageRef}
      className="relative flex h-full justify-center overflow-hidden bg-[var(--surface-2)] p-2 sm:p-4"
    >
      <div
        className="relative h-full overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-white shadow-sm"
        style={{ width: available ? `${Math.round(target * scale)}px` : '100%', maxWidth: '100%' }}
        data-testid="preview-viewport"
        data-viewport={viewport}
      >
        {sources.map((src, index) =>
          src ? (
            <iframe
              key={index}
              ref={frames[index]}
              src={src}
              title={index === front ? title : `${title} (chargement)`}
              data-testid={index === front ? 'preview-frame' : 'preview-frame-loading'}
              sandbox="allow-scripts"
              className={cn(
                'absolute top-0 left-0 border-0',
                index === front ? 'visible z-10' : 'invisible z-0',
              )}
              style={{
                width: `${target}px`,
                height: `${100 / scale}%`,
                transform: scale < 1 ? `scale(${scale})` : undefined,
                transformOrigin: '0 0',
              }}
              onLoad={() => {
                if (index !== front) setFront(index);
              }}
            />
          ) : null,
        )}
      </div>
    </div>
  );
}
