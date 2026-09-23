import type { CSSProperties, SVGProps } from 'react';

/**
 * Identite StaX.
 *
 * La marque est un X construit en quatre dalles isometriques, separees par un
 * vide central. Deux lectures se superposent :
 *  - le X du nom ;
 *  - une pile de couches, qui evoque l infrastructure sur laquelle reposent
 *    les sites des clients.
 *
 * Le degre de luminosite decroit du haut vers le bas : la profondeur nait de
 * la lumiere, pas d une ombre portee. Le vide central reste lisible jusqu a
 * 16 px, ce qui permet d utiliser la meme forme en favicon.
 */

export interface LogoProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  size?: number;
  /** `duotone` suit le theme, `mono` herite de currentColor. */
  tone?: 'duotone' | 'mono' | 'accent';
  title?: string;
}

const SLABS = [
  // Diagonale descendante : la plus lumineuse en haut a gauche.
  { d: 'M6 6 L13.4 13.4', opacity: 1 },
  { d: 'M18.6 18.6 L26 26', opacity: 0.55 },
  // Diagonale montante.
  { d: 'M26 6 L18.6 13.4', opacity: 0.8 },
  { d: 'M13.4 18.6 L6 26', opacity: 0.35 },
] as const;

export function LogoMark({ size = 32, tone = 'duotone', title, ...props }: LogoProps) {
  const gradientId = `stax-mark-${tone}`;
  const stroke =
    tone === 'mono' ? 'currentColor' : tone === 'accent' ? 'var(--accent)' : `url(#${gradientId})`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {tone === 'duotone' ? (
        <defs>
          <linearGradient
            id={gradientId}
            x1="6"
            y1="6"
            x2="26"
            y2="26"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="var(--foreground)" />
            <stop offset="0.55" stopColor="var(--foreground)" stopOpacity="0.92" />
            <stop offset="1" stopColor="var(--accent)" />
          </linearGradient>
        </defs>
      ) : null}
      {SLABS.map((slab) => (
        <path
          key={slab.d}
          d={slab.d}
          stroke={stroke}
          strokeOpacity={tone === 'duotone' ? slab.opacity : slab.opacity}
          strokeWidth="5"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

export interface WordmarkProps {
  size?: number;
  className?: string;
  /** Met le X final en accent : reserve aux usages ou la marque est le sujet. */
  highlightX?: boolean;
}

export function Wordmark({ size = 20, className, highlightX = true }: WordmarkProps) {
  const style: CSSProperties = {
    fontSize: size,
    lineHeight: 1,
    fontWeight: 600,
    letterSpacing: '-0.035em',
  };
  return (
    <span className={className} style={style}>
      Sta
      <span style={highlightX ? { color: 'var(--accent)' } : undefined}>X</span>
    </span>
  );
}

export interface LogoProps2 {
  size?: number;
  className?: string;
  showWordmark?: boolean;
  tone?: LogoProps['tone'];
  /** Texte alternatif. Une seule occurrence par page doit le porter. */
  label?: string;
}

/** Verrou logo complet : marque + mot. Utilise dans les en-tetes et pieds de page. */
export function Logo({
  size = 28,
  className,
  showWordmark = true,
  tone = 'duotone',
  label = 'StaX',
}: LogoProps2) {
  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.32 }}
    >
      <LogoMark size={size} tone={tone} title={showWordmark ? undefined : label} />
      {showWordmark ? <Wordmark size={size * 0.72} /> : null}
    </span>
  );
}

/**
 * Favicon : la marque sur une pastille sombre, exportee en SVG inline.
 * Chaine autonome, sans dependance a une variable CSS, pour rester correcte
 * dans un onglet de navigateur.
 */
export const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
<rect width="32" height="32" rx="7" fill="#05070B"/>
<g stroke-width="5" stroke-linecap="round">
<path d="M8 9 L14 15" stroke="#F8FAFC"/>
<path d="M18 17 L24 23" stroke="#F8FAFC" stroke-opacity="0.55"/>
<path d="M24 9 L18 15" stroke="#F8FAFC" stroke-opacity="0.8"/>
<path d="M14 17 L8 23" stroke="#147CFF"/>
</g>
</svg>`;

export function faviconDataUri(): string {
  return `data:image/svg+xml,${encodeURIComponent(FAVICON_SVG)}`;
}

/**
 * Jetons de marque exposes pour les usages hors application : e-mails,
 * documents, exports. Une seule source, jamais de valeur recopiee.
 */
export const BRAND = {
  name: 'StaX',
  /** Positionnement, utilise dans les metadonnees et les partages. */
  tagline: 'Votre site professionnel. Construit pour votre métier.',
  colors: {
    ink: '#05070B',
    paper: '#F8FAFC',
    accent: '#147CFF',
    accentLight: '#0B66DA',
    glacier: '#52B5FF',
    ice: '#9DDBFF',
  },
  radius: 7,
} as const;
