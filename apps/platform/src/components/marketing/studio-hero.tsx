'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { Art } from './studio-art';
import s from './studio-hero.module.css';

/**
 * Page de garde : la pile StaX.
 *
 * Des plaques de verre, de papier et d aluminium posees en profondeur autour
 * du panneau principal. Trois mouvements, tous par variables CSS :
 *  - chaque bande de profondeur suit le pointeur a sa propre vitesse, et la
 *    scene s incline legerement ;
 *  - une source de lumiere suit le pointeur et eclaire chaque plaque ;
 *  - au defilement, la pile s ecarte comme une vue eclatee.
 * Sans pointeur (telephone), la pile flotte doucement. Avec
 * `prefers-reduced-motion`, rien ne bouge et tout reste lisible.
 */

export interface HeroOffer {
  name: string;
  /** « 300 € », « Sur devis », ou `null` si le catalogue est injoignable. */
  price: string | null;
}

const ICON_PLAN =
  'M224,200h-8V40a8,8,0,0,0-8-8H152a8,8,0,0,0-8,8V80H96a8,8,0,0,0-8,8v40H48a8,8,0,0,0-8,8v64H32a8,8,0,0,0,0,16H224a8,8,0,0,0,0-16ZM160,48h40V200H160ZM104,96h40V200H104ZM56,144H88v56H56Z';
const ICON_CODE =
  'M93.31,70,28,128l65.27,58a8,8,0,1,1-10.62,12l-72-64a8,8,0,0,1,0-12l72-64A8,8,0,1,1,93.31,70Zm152,52-72-64a8,8,0,0,0-10.62,12L228,128l-65.27,58a8,8,0,1,0,10.62,12l72-64a8,8,0,0,0,0-12Z';
const ICON_TREND =
  'M240,56v64a8,8,0,0,1-16,0V75.31l-82.34,82.35a8,8,0,0,1-11.32,0L96,123.31,29.66,189.66a8,8,0,0,1-11.32-11.32l72-72a8,8,0,0,1,11.32,0L136,140.69,212.69,64H168a8,8,0,0,1,0-16h64A8,8,0,0,1,240,56Z';

const SERVICES = [
  {
    icon: ICON_PLAN,
    title: 'Conception',
    body: 'Structure et direction artistique, décidées avant le code.',
    layer: s.lSv1,
  },
  {
    icon: ICON_CODE,
    title: 'Développement',
    body: 'Un site codé à la main, rapide par défaut.',
    layer: s.lSv2,
  },
  {
    icon: ICON_TREND,
    title: 'Suivi',
    body: 'Hébergé, maintenu et amélioré après la livraison.',
    layer: s.lSv3,
  },
];

export function StudioHero({ offers }: { offers: HeroOffer[] }) {
  const heroRef = useRef<HTMLElement>(null);
  const fitRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const offersRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const hero = heroRef.current;
    const fit = fitRef.current;
    const stage = stageRef.current;
    const scene = sceneRef.current;
    if (!hero || !fit || !stage || !scene) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const plates = Array.from(stage.querySelectorAll<HTMLElement>('[data-plate]'));
    const cur = { mx: -12, my: 7, u: 0, lx: 0.3, ly: 0.2 };
    const tgt = { ...cur };
    const keys = ['mx', 'my', 'u', 'lx', 'ly'] as const;
    const t0 = performance.now();
    let pointerAt = 0;
    let running = false;
    let visible = true;
    let frame = 0;

    const apply = () => {
      // Lectures d abord (positions des plaques), ecritures ensuite.
      const box = hero.getBoundingClientRect();
      const rects = plates.map((plate) => plate.getBoundingClientRect());
      const sx = box.left + cur.lx * box.width;
      const sy = box.top + cur.ly * box.height;
      stage.style.setProperty('--mx', cur.mx.toFixed(2));
      stage.style.setProperty('--my', cur.my.toFixed(2));
      stage.style.setProperty('--u', cur.u.toFixed(3));
      scene.style.setProperty('--sry', (-cur.mx * 0.19).toFixed(3));
      scene.style.setProperty('--srx', (cur.my * 0.2).toFixed(3));
      hero.style.setProperty('--lx', `${(cur.lx * 100).toFixed(1)}%`);
      hero.style.setProperty('--ly', `${(cur.ly * 100).toFixed(1)}%`);
      rects.forEach((rect, index) => {
        const plate = plates[index];
        if (!plate || !rect.width) return;
        const hx = Math.max(-60, Math.min(160, ((sx - rect.left) / rect.width) * 100));
        const hy = Math.max(-60, Math.min(160, ((sy - rect.top) / rect.height) * 100));
        plate.style.setProperty('--hx', `${hx.toFixed(1)}%`);
        plate.style.setProperty('--hy', `${hy.toFixed(1)}%`);
      });
    };

    const tick = (now: number) => {
      if (now - pointerAt > 2600) {
        const t = (now - t0) / 1000;
        tgt.mx = -10 + Math.sin(t * 0.32) * 9;
        tgt.my = 6 + Math.cos(t * 0.27) * 5;
        tgt.lx = 0.32 + Math.sin(t * 0.21) * 0.18;
        tgt.ly = 0.22 + Math.cos(t * 0.17) * 0.1;
      }
      for (const key of keys) {
        cur[key] += (tgt[key] - cur[key]) * (key === 'u' ? 0.16 : 0.075);
      }
      apply();
      if (visible && !document.hidden) frame = requestAnimationFrame(tick);
      else running = false;
    };
    const kick = () => {
      if (running) return;
      running = true;
      frame = requestAnimationFrame(tick);
    };

    const onPointer = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const r = fit.getBoundingClientRect();
      const h = hero.getBoundingClientRect();
      const nx = (event.clientX - r.left) / r.width;
      const ny = (event.clientY - r.top) / r.height;
      tgt.mx = Math.max(-1, Math.min(1, (nx - 0.5) * 2)) * 20;
      tgt.my = Math.max(-1, Math.min(1, (ny - 0.5) * 2)) * 12;
      tgt.lx = (event.clientX - h.left) / h.width;
      tgt.ly = (event.clientY - h.top) / h.height;
      pointerAt = performance.now();
      kick();
    };
    const onScroll = () => {
      tgt.u = Math.max(0, Math.min(1, window.scrollY / (hero.offsetHeight * 0.85)));
      kick();
    };
    const onVisibility = () => {
      if (!document.hidden && visible) kick();
    };

    // La carte « Les offres » : un repere parcourt la liste.
    const items = Array.from(offersRef.current?.children ?? []);
    let current = 0;
    const cycle = window.setInterval(() => {
      if (!visible || document.hidden || items.length === 0) return;
      items[current]?.setAttribute('data-on', 'false');
      current = (current + 1) % items.length;
      items[current]?.setAttribute('data-on', 'true');
    }, 2200);

    if (reduce) {
      apply();
      window.clearInterval(cycle);
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
      if (visible) kick();
    });
    observer.observe(hero);
    hero.addEventListener('pointermove', onPointer);
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    onScroll();
    kick();

    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(cycle);
      observer.disconnect();
      hero.removeEventListener('pointermove', onPointer);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <section ref={heroRef} className={s.hero} aria-labelledby="accueil-titre">
      <div className={s.light} aria-hidden="true" />
      <div className={s.stageWrap}>
        <div ref={fitRef} className={s.fit}>
          <div ref={stageRef} className={s.stage}>
            <div ref={sceneRef} className={s.scene}>
              {/* Plan du fond */}
              <div className={s.band} data-band="far">
                <div className={`${s.layer} ${s.lSlabL}`} aria-hidden="true">
                  <div className={`${s.layerIn} ${s.frost}`} data-plate>
                    <span
                      className={s.fill}
                      style={{
                        inset: '16% 12%',
                        background:
                          'linear-gradient(160deg, rgba(176,192,208,.32), rgba(255,255,255,.46))',
                      }}
                    />
                  </div>
                </div>
                <div className={`${s.layer} ${s.lSlabR}`} aria-hidden="true">
                  <div className={`${s.layerIn} ${s.frost}`} data-plate>
                    <span
                      className={s.fill}
                      style={{
                        inset: '20% 16%',
                        background:
                          'linear-gradient(200deg, rgba(255,255,255,.5), rgba(176,192,208,.28))',
                      }}
                    />
                  </div>
                </div>
                <div className={`${s.layer} ${s.lBase3}`} aria-hidden="true">
                  <div className={`${s.layerIn} ${s.frost}`} data-plate>
                    <div className={`${s.card} ${s.words}`}>
                      <span>Concevoir</span>
                      <span>Développer</span>
                      <span>Livrer</span>
                      <span>Gérer</span>
                    </div>
                  </div>
                </div>
                <div className={`${s.layer} ${s.lBase2}`} aria-hidden="true">
                  <div className={`${s.layerIn} ${s.alu}`} data-plate />
                </div>
                <div className={`${s.layer} ${s.lBase1}`} aria-hidden="true">
                  <div className={`${s.layerIn} ${s.glass}`} data-plate />
                </div>
              </div>

              {/* Plan intermediaire */}
              <div className={s.band} data-band="mid">
                <div className={`${s.layer} ${s.lBackC}`} aria-hidden="true">
                  <div className={`${s.layerIn} ${s.glass}`} data-plate />
                </div>
                <div className={`${s.layer} ${s.lOffers}`}>
                  <div className={`${s.layerIn} ${s.frost}`} data-plate>
                    <div className={`${s.card} ${s.offers}`}>
                      <p className={s.micro}>Les offres</p>
                      <ul ref={offersRef} className={s.offerList}>
                        {offers.map((offer, index) => (
                          <li key={offer.name} data-on={index === 0 ? 'true' : 'false'}>
                            <span>{offer.name}</span>
                            {offer.price ? <span>{offer.price}</span> : null}
                          </li>
                        ))}
                      </ul>
                      <div className={s.offerThumb} aria-hidden="true">
                        <Art name="stack" />
                      </div>
                    </div>
                  </div>
                </div>
                <div className={`${s.layer} ${s.lProc}`} aria-hidden="true">
                  <div className={`${s.layerIn} ${s.paper}`} data-plate>
                    <div className={`${s.card} ${s.proc}`}>
                      <div>
                        <p className={s.micro}>Le parcours</p>
                        <div className={s.procSteps}>
                          {['Conception', 'Développement', 'Mise en ligne', 'Livraison'].map(
                            (step) => (
                              <div key={step} className={s.procStep}>
                                <span className={s.procTick} />
                                {step}
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                      <div className={s.procRow}>
                        <span className={s.num}>01</span>
                        <span className={s.micro}>StaX</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Panneau principal */}
              <div className={s.band} data-band="core">
                <div className={`${s.layer} ${s.lMain}`}>
                  <div className={`${s.layerIn} ${s.paper} ${s.edgeRing}`} data-plate>
                    <div className={s.panel}>
                      <div className={s.panelArt} aria-hidden="true">
                        <Art name="stack" />
                      </div>
                      <div className={s.panelSheet} />
                      <div className={s.panelSheen} />
                      <div className={s.panelInner}>
                        <div className={s.panelHead}>
                          <span className={s.panelLogo} aria-hidden="true">
                            StaX
                          </span>
                          <span className={s.micro}>Studio de sites web</span>
                        </div>
                        <div className={s.panelCopy}>
                          <h1 id="accueil-titre" className={s.h1}>
                            Nous créons votre site. <i>Vous le gérez ensuite.</i>
                          </h1>
                          <p className={s.sub}>
                            Conception, développement, mise en ligne. Puis l’éditeur StaX, pour tout
                            modifier vous-même.
                          </p>
                          <Link className={s.cta} href="/commander">
                            Commander mon site
                            <svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
                              <path d="M221.66,133.66l-72,72a8,8,0,0,1-11.32-11.32L196.69,136H40a8,8,0,0,1,0-16H196.69L138.34,61.66a8,8,0,0,1,11.32-11.32l72,72A8,8,0,0,1,221.66,133.66Z" />
                            </svg>
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Premier plan */}
              <div className={s.band} data-band="front">
                <div className={`${s.layer} ${s.lDiv}`} aria-hidden="true">
                  <div className={`${s.layerIn} ${s.glass}`} data-plate />
                </div>
                <div className={`${s.layer} ${s.lSite}`} aria-hidden="true">
                  <div className={`${s.layerIn} ${s.paper}`} data-plate>
                    <div className={`${s.card} ${s.site}`}>
                      <p className={s.siteTitle}>Un site construit autour de votre entreprise</p>
                      <div className={s.siteThumb}>
                        <Art name="site" />
                      </div>
                    </div>
                  </div>
                </div>
                <div className={`${s.layer} ${s.lGrowth}`} aria-hidden="true">
                  <div className={`${s.layerIn} ${s.frost}`} data-plate>
                    <div className={`${s.card} ${s.growth}`}>
                      <div className={s.growthThumb}>
                        <Art name="growth" />
                      </div>
                      <p className={s.growthTitle}>
                        Plus qu’un site.
                        <br />
                        <i>Un avenir plus solide.</i>
                      </p>
                    </div>
                  </div>
                </div>
                {SERVICES.map((service, index) => (
                  <div
                    key={service.title}
                    className={`${s.layer} ${service.layer}`}
                    aria-hidden="true"
                  >
                    <div className={`${s.layerIn} ${s.paper}`} data-plate>
                      <div className={`${s.card} ${s.sv}`}>
                        <div className={s.svTop}>
                          <svg viewBox="0 0 256 256" fill="currentColor">
                            <path d={service.icon} />
                          </svg>
                          <span className={s.num}>{String(index + 1).padStart(2, '0')}</span>
                        </div>
                        <div>
                          <p className={s.svTitle}>{service.title}</p>
                          <div className={s.svLine} />
                          <p className={s.svBody}>{service.body}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Tout premier plan */}
              <div className={s.band} data-band="near">
                <div className={`${s.layer} ${s.lKnob}`} aria-hidden="true">
                  <div className={s.layerIn}>
                    <span className={s.knobRing} />
                    <div className={s.knob} />
                  </div>
                </div>
                <div className={`${s.layer} ${s.lEdge}`} aria-hidden="true">
                  <div className={s.layerIn}>
                    <div className={s.edge} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
