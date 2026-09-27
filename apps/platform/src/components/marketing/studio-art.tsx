import { cn } from '@stax/ui';

/**
 * Illustrations du site public, dessinees dans la palette : une pile de
 * dalles (blanc, aluminium, graphite), la maquette d un site, une courbe de
 * croissance, et une vue par etape de la methode.
 *
 * Aucune photographie : les symboles sont declares une seule fois par page
 * (`<StudioArtSprite />`), puis reutilises par `<Art name="..." />` a toutes
 * les tailles. Les textes des illustrations suivent les polices du site.
 */

export type ArtName = 'stack' | 'site' | 'growth' | 'design' | 'build' | 'launch' | 'grow';

export function StudioArtSprite() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className="pointer-events-none absolute size-0 overflow-hidden"
    >
      <defs>
        <linearGradient id="sx-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d3dde5" />
          <stop offset=".45" stopColor="#e9eef1" />
          <stop offset="1" stopColor="#f5f6f7" />
        </linearGradient>
        <radialGradient id="sx-sun" cx=".74" cy=".12" r=".55">
          <stop offset="0" stopColor="#fff" stopOpacity=".95" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="sx-slab" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#dde3e7" />
        </linearGradient>
        <linearGradient id="sx-glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity=".55" />
          <stop offset="1" stopColor="#2f5f86" stopOpacity=".22" />
        </linearGradient>
        <linearGradient id="sx-shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#182432" stopOpacity=".2" />
          <stop offset="1" stopColor="#182432" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="sx-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2f5f86" stopOpacity=".26" />
          <stop offset="1" stopColor="#2f5f86" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="sx-alu" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#f5f7f8" />
          <stop offset=".34" stopColor="#ccd2d8" />
          <stop offset=".51" stopColor="#eef1f4" />
          <stop offset=".76" stopColor="#b4bbc3" />
          <stop offset="1" stopColor="#eaeef1" />
        </linearGradient>
        <linearGradient id="sx-graphite" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a3138" />
          <stop offset="1" stopColor="#1d2328" />
        </linearGradient>
        <filter id="sx-lift" x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="10" stdDeviation="10" floodColor="#182432" floodOpacity=".22" />
        </filter>

        <symbol id="sx-stack" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">
          <rect width="400" height="300" fill="url(#sx-sky)" />
          <ellipse cx="210" cy="70" rx="230" ry="70" fill="#2f5f86" fillOpacity=".16" />
          <rect width="400" height="300" fill="url(#sx-sun)" />
          <line x1="0" y1="128" x2="400" y2="128" stroke="#8fa3b3" strokeWidth=".7" />
          <rect x="120" y="42" width="160" height="16" fill="url(#sx-glass)" />
          <rect x="130" y="74" width="160" height="16" fill="url(#sx-glass)" />
          <g stroke="#ffffff" strokeOpacity=".8" strokeWidth=".8">
            <line x1="140" y1="42" x2="140" y2="58" />
            <line x1="170" y1="42" x2="170" y2="58" />
            <line x1="200" y1="42" x2="200" y2="58" />
            <line x1="230" y1="42" x2="230" y2="58" />
            <line x1="260" y1="42" x2="260" y2="58" />
            <line x1="150" y1="74" x2="150" y2="90" />
            <line x1="180" y1="74" x2="180" y2="90" />
            <line x1="210" y1="74" x2="210" y2="90" />
            <line x1="240" y1="74" x2="240" y2="90" />
            <line x1="270" y1="74" x2="270" y2="90" />
          </g>
          <rect x="120" y="42" width="160" height="7" fill="url(#sx-shade)" />
          <rect x="130" y="74" width="160" height="7" fill="url(#sx-shade)" />
          <rect x="70" y="106" width="240" height="20" fill="url(#sx-shade)" />
          <rect x="40" y="26" width="240" height="16" fill="url(#sx-slab)" />
          <rect x="120" y="58" width="240" height="16" fill="url(#sx-alu)" />
          <rect x="70" y="90" width="240" height="16" fill="url(#sx-graphite)" />
          <g strokeWidth=".8">
            <line x1="40" y1="26.5" x2="280" y2="26.5" stroke="#ffffff" />
            <line x1="120" y1="58.5" x2="360" y2="58.5" stroke="#ffffff" strokeOpacity=".8" />
            <line x1="70" y1="90.5" x2="310" y2="90.5" stroke="#ffffff" strokeOpacity=".18" />
          </g>
        </symbol>

        <symbol id="sx-site" viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice">
          <rect width="320" height="200" fill="#fafbfb" />
          <rect width="320" height="22" fill="#f1f2f3" />
          <text x="12" y="14.5" className="font-serif" fontSize="9" fill="#14181c">
            Votre entreprise
          </text>
          <g fill="#b8c0c7">
            <rect x="206" y="9" width="22" height="4" rx="2" />
            <rect x="236" y="9" width="22" height="4" rx="2" />
            <rect x="266" y="9" width="22" height="4" rx="2" />
          </g>
          <use href="#sx-stack" x="12" y="34" width="150" height="82" />
          <text x="176" y="50" className="font-serif" fontSize="13" fill="#14181c">
            Construit autour
          </text>
          <text
            x="176"
            y="64"
            className="font-serif"
            fontSize="13"
            fontStyle="italic"
            fill="#14181c"
          >
            de votre activité.
          </text>
          <g fill="#c3cad0">
            <rect x="176" y="74" width="120" height="4" rx="2" />
            <rect x="176" y="82" width="100" height="4" rx="2" />
          </g>
          <rect x="176" y="96" width="54" height="14" rx="3.5" fill="#1d2328" />
          <g fill="#f1f2f3">
            <rect x="12" y="128" width="94" height="62" rx="5" />
            <rect x="113" y="128" width="94" height="62" rx="5" />
            <rect x="214" y="128" width="94" height="62" rx="5" />
          </g>
          <g fill="#c9d0d6">
            <rect x="20" y="138" width="46" height="5" rx="2" />
            <rect x="121" y="138" width="46" height="5" rx="2" />
            <rect x="222" y="138" width="46" height="5" rx="2" />
          </g>
          <g fill="#dde2e6">
            <rect x="20" y="150" width="76" height="3.5" rx="1.7" />
            <rect x="20" y="157" width="62" height="3.5" rx="1.7" />
            <rect x="121" y="150" width="76" height="3.5" rx="1.7" />
            <rect x="121" y="157" width="58" height="3.5" rx="1.7" />
            <rect x="222" y="150" width="76" height="3.5" rx="1.7" />
            <rect x="222" y="157" width="66" height="3.5" rx="1.7" />
          </g>
        </symbol>

        <symbol id="sx-growth" viewBox="0 0 200 150" preserveAspectRatio="xMidYMid slice">
          <rect width="200" height="150" fill="#f6f7f8" />
          <g stroke="#14181c" strokeOpacity=".07">
            <line x1="0" y1="35" x2="200" y2="35" />
            <line x1="0" y1="70" x2="200" y2="70" />
            <line x1="0" y1="105" x2="200" y2="105" />
          </g>
          <path
            d="M0 128 C40 122 62 112 92 98 S150 60 200 26 L200 150 L0 150 Z"
            fill="url(#sx-sea)"
          />
          <path
            d="M0 128 C40 122 62 112 92 98 S150 60 200 26"
            fill="none"
            stroke="#2f5f86"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="92" cy="98" r="3.2" fill="#fdfdfd" stroke="#2f5f86" strokeWidth="1.5" />
          <circle cx="150" cy="62" r="3.2" fill="#fdfdfd" stroke="#2f5f86" strokeWidth="1.5" />
        </symbol>

        <symbol id="sx-design" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">
          <rect width="400" height="300" fill="#fafbfb" />
          <g stroke="#2f5f86" strokeOpacity=".12" strokeWidth=".8">
            <line x1="28.0" y1="14" x2="28.0" y2="286" />
            <line x1="56.7" y1="14" x2="56.7" y2="286" />
            <line x1="85.3" y1="14" x2="85.3" y2="286" />
            <line x1="114.0" y1="14" x2="114.0" y2="286" />
            <line x1="142.7" y1="14" x2="142.7" y2="286" />
            <line x1="171.3" y1="14" x2="171.3" y2="286" />
            <line x1="200.0" y1="14" x2="200.0" y2="286" />
            <line x1="228.7" y1="14" x2="228.7" y2="286" />
            <line x1="257.3" y1="14" x2="257.3" y2="286" />
            <line x1="286.0" y1="14" x2="286.0" y2="286" />
            <line x1="314.7" y1="14" x2="314.7" y2="286" />
            <line x1="343.3" y1="14" x2="343.3" y2="286" />
            <line x1="372.0" y1="14" x2="372.0" y2="286" />
          </g>
          <g fill="none" stroke="#838c94" strokeWidth="1" strokeDasharray="3 3">
            <rect x="28" y="22" width="344" height="18" rx="3" />
            <rect x="28" y="58" width="186" height="96" rx="4" />
            <path d="M28 58 L214 154 M214 58 L28 154" />
            <rect x="228" y="64" width="144" height="14" />
            <rect x="228" y="84" width="110" height="14" />
            <rect x="228" y="108" width="144" height="6" />
            <rect x="228" y="120" width="120" height="6" />
            <rect x="228" y="136" width="58" height="18" rx="4" />
            <rect x="28" y="172" width="106" height="84" rx="4" />
            <rect x="147" y="172" width="106" height="84" rx="4" />
            <rect x="266" y="172" width="106" height="84" rx="4" />
          </g>
          <g stroke="#2f5f86" strokeWidth=".9">
            <path d="M228 52 H372 M228 49 V55 M372 49 V55" />
            <path d="M20 58 V154 M17 58 H23 M17 154 H23" />
          </g>
          <g className="font-sans" fontSize="7.5" fill="#2f5f86" letterSpacing=".3">
            <text x="300" y="47" textAnchor="middle">
              Titre · 2 lignes
            </text>
            <text x="28" y="276">
              Maquette, version 2
            </text>
            <text x="372" y="276" textAnchor="end">
              12 colonnes
            </text>
          </g>
        </symbol>

        <symbol id="sx-build" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">
          <rect width="400" height="300" fill="#fafbfb" />
          <rect x="28" y="22" width="344" height="18" rx="3" fill="#f1f2f3" />
          <text x="38" y="34.5" className="font-serif" fontSize="10" fill="#14181c">
            Votre entreprise
          </text>
          <g fill="#b8c0c7">
            <rect x="262" y="29" width="26" height="4" rx="2" />
            <rect x="298" y="29" width="26" height="4" rx="2" />
            <rect x="334" y="29" width="26" height="4" rx="2" />
          </g>
          <use href="#sx-stack" x="28" y="58" width="186" height="96" />
          <text x="228" y="80" className="font-serif" fontSize="17" fill="#14181c">
            Construit autour
          </text>
          <text
            x="228"
            y="99"
            className="font-serif"
            fontSize="17"
            fontStyle="italic"
            fill="#14181c"
          >
            de votre activité.
          </text>
          <g fill="#c3cad0">
            <rect x="228" y="108" width="144" height="5" rx="2.5" />
            <rect x="228" y="119" width="118" height="5" rx="2.5" />
          </g>
          <rect x="228" y="136" width="62" height="18" rx="4.5" fill="#1d2328" />
          <text
            x="259"
            y="147.5"
            textAnchor="middle"
            className="font-sans"
            fontSize="7"
            fill="#f4f6f8"
          >
            Réserver
          </text>
          <g fill="#f1f2f3">
            <rect x="28" y="172" width="106" height="84" rx="5" />
            <rect x="147" y="172" width="106" height="84" rx="5" />
          </g>
          <g fill="#c9d0d6">
            <rect x="38" y="184" width="54" height="6" rx="3" />
            <rect x="157" y="184" width="54" height="6" rx="3" />
          </g>
          <g fill="#dde2e6">
            <rect x="38" y="198" width="84" height="4" rx="2" />
            <rect x="38" y="207" width="70" height="4" rx="2" />
            <rect x="157" y="198" width="84" height="4" rx="2" />
            <rect x="157" y="207" width="64" height="4" rx="2" />
          </g>
          <rect
            x="266"
            y="172"
            width="106"
            height="84"
            rx="5"
            fill="none"
            stroke="#838c94"
            strokeDasharray="3 3"
          />
          <g filter="url(#sx-lift)">
            <rect x="238" y="188" width="146" height="94" rx="9" fill="#1d2328" />
          </g>
          <g className="font-mono" fontSize="7" fill="#9fb7cb">
            <text x="252" y="208">
              {'<section class="accueil">'}
            </text>
            <text x="260" y="222" fill="#eef1f4">
              {'<h1>Construit autour</h1>'}
            </text>
            <text x="260" y="236" fill="#7fa6c4">
              {'<Reservation />'}
            </text>
            <text x="260" y="250" fill="#eef1f4" fillOpacity=".55">
              {'<Modifiable champ="horaires" />'}
            </text>
            <text x="252" y="264">
              {'</section>'}
            </text>
          </g>
        </symbol>

        <symbol id="sx-launch" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">
          <rect width="400" height="300" fill="#eef1f3" />
          <rect width="400" height="300" fill="url(#sx-sun)" />
          <g filter="url(#sx-lift)">
            <rect x="44" y="34" width="312" height="226" rx="10" fill="#fdfdfd" />
          </g>
          <path d="M44 44 a10 10 0 0 1 10 -10 H346 a10 10 0 0 1 10 10 V60 H44 Z" fill="#f1f2f3" />
          <rect
            x="122"
            y="40"
            width="156"
            height="14"
            rx="7"
            fill="#fdfdfd"
            stroke="#14181c"
            strokeOpacity=".08"
          />
          <path
            d="M150 45.5 v-1.2 a2.4 2.4 0 0 1 4.8 0 v1.2 M149 45.5 h6.8 v4.6 h-6.8 Z"
            fill="none"
            stroke="#4b545c"
            strokeWidth=".9"
          />
          <text
            x="206"
            y="50"
            textAnchor="middle"
            className="font-sans"
            fontSize="7.5"
            fill="#4b545c"
          >
            votre-entreprise.fr
          </text>
          <use href="#sx-site" x="54" y="66" width="292" height="186" />
          <g filter="url(#sx-lift)">
            <rect x="286" y="14" width="86" height="24" rx="12" fill="#fdfdfd" />
          </g>
          <circle cx="302" cy="26" r="4" fill="#2f5f86" />
          <circle cx="302" cy="26" r="7.5" fill="#2f5f86" fillOpacity=".16" />
          <text x="314" y="29.5" className="font-sans" fontSize="9" fill="#14181c">
            En ligne
          </text>
          <g filter="url(#sx-lift)">
            <rect x="18" y="200" width="118" height="78" rx="9" fill="#fdfdfd" />
          </g>
          <g className="font-sans" fontSize="8" fill="#14181c">
            <text x="44" y="224">
              HTTPS
            </text>
            <text x="44" y="243">
              Redirections
            </text>
            <text x="44" y="262">
              Statistiques
            </text>
          </g>
          <g
            fill="none"
            stroke="#2f5f86"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M30 220.5 l3 3 l5.5 -6" />
            <path d="M30 239.5 l3 3 l5.5 -6" />
            <path d="M30 258.5 l3 3 l5.5 -6" />
          </g>
        </symbol>

        <symbol id="sx-grow" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">
          <rect width="400" height="300" fill="#fafbfb" />
          <g stroke="#14181c" strokeOpacity=".07">
            <line x1="40" y1="60" x2="372" y2="60" />
            <line x1="40" y1="120" x2="372" y2="120" />
            <line x1="40" y1="180" x2="372" y2="180" />
          </g>
          <line x1="40" y1="240" x2="372" y2="240" stroke="#14181c" strokeOpacity=".2" />
          <g fill="#dfe4e8">
            <rect x="48" y="206" width="16" height="34" rx="2" />
            <rect x="75" y="200" width="16" height="40" rx="2" />
            <rect x="102" y="202" width="16" height="38" rx="2" />
            <rect x="129" y="188" width="16" height="52" rx="2" />
            <rect x="156" y="182" width="16" height="58" rx="2" />
            <rect x="183" y="185" width="16" height="55" rx="2" />
            <rect x="210" y="170" width="16" height="70" rx="2" />
            <rect x="237" y="162" width="16" height="78" rx="2" />
            <rect x="264" y="166" width="16" height="74" rx="2" />
            <rect x="291" y="148" width="16" height="92" rx="2" />
            <rect x="318" y="136" width="16" height="104" rx="2" />
            <rect x="345" y="122" width="16" height="118" rx="2" />
          </g>
          <path
            d="M56,240 L56,200 L83,196 L110,188 L137,184 L164,172 L191,166 L218,150 L245,140 L272,128 L299,112 L326,96 L353,78 L353,240 Z"
            fill="url(#sx-sea)"
          />
          <polyline
            points="56,200 83,196 110,188 137,184 164,172 191,166 218,150 245,140 272,128 299,112 326,96 353,78"
            fill="none"
            stroke="#2f5f86"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <g fill="#fdfdfd" stroke="#2f5f86" strokeWidth="1.6">
            <circle cx="110" cy="188" r="3.5" />
            <circle cx="191" cy="166" r="3.5" />
            <circle cx="272" cy="128" r="3.5" />
            <circle cx="353" cy="78" r="3.5" />
          </g>
          <g className="font-sans" fontSize="8" fill="#838c94" textAnchor="middle">
            <text x="83" y="256">
              T1
            </text>
            <text x="164" y="256">
              T2
            </text>
            <text x="245" y="256">
              T3
            </text>
            <text x="326" y="256">
              T4
            </text>
          </g>
          <g className="font-sans" fontSize="7.5" fill="#4b545c">
            <rect x="40" y="26" width="8" height="8" rx="1.5" fill="#dfe4e8" />
            <text x="53" y="33">
              Demandes reçues
            </text>
            <line
              x1="128"
              y1="30"
              x2="142"
              y2="30"
              stroke="#2f5f86"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <text x="147" y="33">
              Visibilité
            </text>
          </g>
          <g filter="url(#sx-lift)">
            <rect x="244" y="18" width="128" height="30" rx="8" fill="#fdfdfd" />
          </g>
          <text x="256" y="37" className="font-serif" fontSize="11" fill="#14181c">
            Bilan trimestriel
          </text>
          <circle cx="358" cy="33" r="3.5" fill="#2f5f86" />
        </symbol>
      </defs>
    </svg>
  );
}

export function Art({
  name,
  label,
  className,
}: {
  name: ArtName;
  /** Texte alternatif ; sans lui, l illustration est decorative. */
  label?: string;
  className?: string;
}) {
  return (
    <svg
      className={cn('block size-full', className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <use href={`#sx-${name}`} width="100%" height="100%" />
    </svg>
  );
}
