import type { CSSProperties } from 'react';
import { PointerTilt } from './pointer-tilt';
import styles from './hero-atelier.module.css';

/**
 * L'atelier StaX, en direct — le panneau de droite de l'accueil.
 *
 * Il montre ce que la page promet, dans l'ordre reel : notre equipe dessine le
 * site, le developpe, le met en ligne sur le domaine du client (commit,
 * deploiement, HTTPS), puis le client modifie un contenu et publie. Le cycle
 * boucle en 16 secondes, en CSS seulement : aucune image, aucune video, rien
 * a telecharger.
 *
 * Tout ce qui bouge est decoratif (`aria-hidden`) ; une phrase masquee dit la
 * meme chose aux lecteurs d'ecran. C'est une illustration, pas un site client.
 */

const PHASES = ['Conception', 'Développement', 'Mise en ligne', 'Publication'] as const;

const STAGES = [
  { number: '01', label: 'Conception' },
  { number: '02', label: 'Développement' },
  { number: '03', label: 'Mise en ligne' },
  { number: '04', label: 'Vous publiez' },
] as const;

const DEPLOY_ROWS = [
  { label: 'Commit sur votre dépôt', meta: 'a3f9c2e' },
  { label: 'Déploiement Cloudflare', meta: '38 s' },
  { label: 'En ligne, en HTTPS', meta: '200' },
] as const;

/** Rang d'apparition d'un bloc : le plan se trace de haut en bas. */
const order = (index: number) => ({ '--i': index }) as CSSProperties;

export function HeroAtelier({ className }: { className?: string }) {
  return (
    <PointerTilt className={className}>
      <aside
        className={styles.panel}
        aria-label="Illustration : le parcours d’un site StaX, de la conception à la publication"
      >
        <p className="sr-only">
          Notre équipe dessine votre site, le développe, puis le met en ligne sur votre domaine : le
          code est versionné, déployé sur Cloudflare et servi en HTTPS. Une fois le site livré, vous
          modifiez un contenu, par exemple vos horaires, et vous publiez.
        </p>

        <div className={styles.top} aria-hidden="true">
          <span>StaX / atelier en direct</span>
          <span className={styles.status}>
            <span className={styles.phases}>
              {PHASES.map((phase, index) => (
                <span key={phase} style={order(index)}>
                  {phase}
                </span>
              ))}
            </span>
            <span className={styles.pulse} />
          </span>
        </div>

        <div className={styles.body} aria-hidden="true">
          <div className={styles.frame} />
          <div className={styles.rings} />

          <div className={styles.scene}>
            <div className={styles.canvas}>
              {/* Le site, dans son navigateur */}
              <div className={styles.browser}>
                <div className={styles.bar}>
                  <span className={styles.dot} />
                  <span className={styles.dot} />
                  <span className={styles.dot} />
                  <span className={styles.url}>
                    <svg
                      className={styles.lock}
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    >
                      <rect x="3.5" y="7" width="9" height="7" />
                      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
                    </svg>
                    <span className={styles.urlText}>
                      <span>https://</span>atelier-camille.fr
                    </span>
                  </span>
                </div>

                <div className={styles.page}>
                  <div className={styles.nav}>
                    <span className={`${styles.blk} ${styles.brand}`} style={order(0)} />
                    <span className={styles.spacer} />
                    <span className={`${styles.blk} ${styles.navItem}`} style={order(1)} />
                    <span className={`${styles.blk} ${styles.navItem}`} style={order(2)} />
                    <span className={`${styles.blk} ${styles.navItem}`} style={order(3)} />
                  </div>

                  <div className={styles.hero}>
                    <div className={styles.copy}>
                      <span
                        className={`${styles.blk} ${styles.title}`}
                        style={{ ...order(4), width: '94%' }}
                      />
                      <span
                        className={`${styles.blk} ${styles.title}`}
                        style={{ ...order(5), width: '66%' }}
                      />
                      <span
                        className={`${styles.blk} ${styles.text}`}
                        style={{ ...order(6), width: '100%', marginTop: '1.4cqw' }}
                      />
                      <span
                        className={`${styles.blk} ${styles.text}`}
                        style={{ ...order(7), width: '90%' }}
                      />
                      <span
                        className={`${styles.blk} ${styles.text}`}
                        style={{ ...order(8), width: '72%' }}
                      />
                      <span className={`${styles.blk} ${styles.cta}`} style={order(9)} />
                    </div>
                    <div className={`${styles.blk} ${styles.art}`} style={order(5)}>
                      <span className={styles.sun} />
                      <span className={styles.hill} />
                    </div>
                  </div>

                  <div className={styles.cards}>
                    <span className={`${styles.blk} ${styles.card}`} style={order(10)} />
                    <span className={`${styles.blk} ${styles.card}`} style={order(11)} />
                    <span className={`${styles.blk} ${styles.card}`} style={order(12)} />
                  </div>
                </div>
              </div>

              {/* Mise en ligne : commit, deploiement, HTTPS */}
              <div className={styles.deploy}>
                <p className={styles.cardKicker}>
                  <span>Mise en ligne</span>
                  <span>GitHub · Cloudflare</span>
                </p>
                {DEPLOY_ROWS.map((row, index) => (
                  <div key={row.label} className={styles.row} style={order(index)}>
                    <span className={styles.check} style={order(index)}>
                      <CheckIcon />
                    </span>
                    {row.label}
                    <small>{row.meta}</small>
                  </div>
                ))}
              </div>

              {/* Apres la livraison : le client modifie, puis publie */}
              <div className={styles.editor}>
                <p className={styles.cardKicker}>
                  <span>Éditeur StaX</span>
                  <span className={styles.draft}>Brouillon</span>
                </p>
                <div className={styles.field}>
                  <p className={styles.fieldLabel}>Horaires</p>
                  <p className={styles.values}>
                    <span className={styles.before}>Mar – Sam · 12 h – 22 h</span>
                    <span className={styles.after}>
                      Mar – <b>Dim</b> · 12 h – 22 h
                    </span>
                  </p>
                </div>
                <div className={styles.publishRow}>
                  <span>Aperçu du vrai site</span>
                  <span className={styles.publish}>Publier</span>
                </div>
              </div>

              <svg className={styles.cursor} viewBox="0 0 24 24">
                <path
                  d="M4 2.5 19.5 12l-6.8 1.6 3.9 7.1-2.7 1.4-3.8-7.1L5 19.8Z"
                  fill="#183442"
                  stroke="#fff"
                  strokeWidth="1.3"
                  strokeLinejoin="round"
                />
              </svg>

              <div className={styles.toast}>
                <span className={styles.check}>
                  <CheckIcon />
                </span>
                Publié — votre site est à jour
              </div>
            </div>
          </div>

          <p className={styles.caption}>Votre site, du premier trait à la mise en ligne.</p>

          <div className={styles.track}>
            <span className={styles.progress} />
            {STAGES.map((stage, index) => (
              <span key={stage.label} className={styles.stage} style={order(index)}>
                <b>{stage.number}</b>
                {stage.label}
              </span>
            ))}
          </div>
        </div>
      </aside>
    </PointerTilt>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d="m3.5 8.5 3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
