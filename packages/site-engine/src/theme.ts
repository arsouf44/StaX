import { z } from 'zod';

/**
 * Themes des sites clients.
 *
 * Un theme est un jeu de JETONS, jamais du CSS. Le client choisit un preset et
 * ajuste quelques variables ; le moteur produit des declarations de variables
 * CSS a partir de valeurs validees. Aucune chaine fournie par l utilisateur
 * n atteint la feuille de style sans passer par ce filtre.
 */

/**
 * Polices des sites clients, AUTO-HEBERGEES.
 *
 * Elles sont servies par le site lui-meme (`/_stax/fonts/…`), jamais par un
 * service tiers : charger Google Fonts transmettrait l adresse IP de chaque
 * visiteur a Google, aux Etats-Unis, sans son consentement — ce que la
 * jurisprudence europeenne sanctionne. Sous-ensemble latin uniquement : il
 * couvre le francais (accents, œ, €) pour une fraction du poids.
 */
export const FONT_BASE_PATH = '/_stax/fonts';

interface FontFace {
  file: string;
  weight: string;
  style?: 'normal' | 'italic';
}

export const FONT_STACKS: Record<string, { family: string; stack: string; faces?: FontFace[] }> = {
  geist: {
    family: 'Geist',
    stack: "'Geist', system-ui, -apple-system, 'Segoe UI', sans-serif",
  },
  inter: {
    family: 'Inter',
    stack: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
    faces: [{ file: 'inter.woff2', weight: '100 900' }],
  },
  sora: {
    family: 'Sora',
    stack: "'Sora', system-ui, sans-serif",
    faces: [{ file: 'sora.woff2', weight: '100 800' }],
  },
  fraunces: {
    family: 'Fraunces',
    stack: "'Fraunces', Georgia, 'Times New Roman', serif",
    faces: [{ file: 'fraunces.woff2', weight: '100 900' }],
  },
  'instrument-serif': {
    family: 'Instrument Serif',
    stack: "'Instrument Serif', Georgia, serif",
    faces: [
      { file: 'instrument-serif.woff2', weight: '400' },
      { file: 'instrument-serif-italic.woff2', weight: '400', style: 'italic' },
    ],
  },
  'ibm-plex-sans': {
    family: 'IBM Plex Sans',
    stack: "'IBM Plex Sans', system-ui, sans-serif",
    faces: ['400', '500', '600', '700'].map((weight) => ({
      file: `ibm-plex-sans-${weight}.woff2`,
      weight,
    })),
  },
};

/** Plage latine : celle des fichiers fournis. */
const LATIN_RANGE =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,' +
  'U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';

/** Declarations @font-face des polices utilisees par un theme. */
export function fontFaceCss(keys: readonly string[]): string {
  const seen = new Set<string>();
  const rules: string[] = [];
  for (const key of keys) {
    const font = FONT_STACKS[key];
    if (!font?.faces || seen.has(key)) continue;
    seen.add(key);
    for (const face of font.faces) {
      rules.push(
        `@font-face{font-family:'${font.family}';font-style:${face.style ?? 'normal'};` +
          `font-weight:${face.weight};font-display:swap;` +
          `src:url(${FONT_BASE_PATH}/${face.file}) format('woff2');unicode-range:${LATIN_RANGE}}`,
      );
    }
  }
  return rules.join('');
}

export interface ThemePreset {
  id: string;
  label: string;
  description: string;
  colors: {
    background: string;
    foreground: string;
    surface: string;
    surfaceElevated: string;
    muted: string;
    border: string;
    accent: string;
    accentForeground: string;
  };
  scheme: 'light' | 'dark';
}

export const THEME_PRESETS: readonly ThemePreset[] = [
  {
    id: 'graphite',
    label: 'Graphite',
    description: 'Sobre et technique. Convient a presque tous les métiers.',
    scheme: 'light',
    colors: {
      background: '#FFFFFF',
      foreground: '#0B0B0D',
      surface: '#F6F6F7',
      surfaceElevated: '#FFFFFF',
      muted: '#6B6B73',
      border: '#E4E4E7',
      accent: '#7C5CFF',
      accentForeground: '#FFFFFF',
    },
  },
  {
    id: 'slate',
    label: 'Ardoise',
    description: 'Serieux et institutionnel. Immobilier, conseil, santé.',
    scheme: 'light',
    colors: {
      background: '#FBFCFD',
      foreground: '#0F172A',
      surface: '#F1F5F9',
      surfaceElevated: '#FFFFFF',
      muted: '#64748B',
      border: '#E2E8F0',
      accent: '#0EA5E9',
      accentForeground: '#FFFFFF',
    },
  },
  {
    id: 'nocturne',
    label: 'Nocturne',
    description: 'Fond sombre, contraste élevé. Bars, événementiel, studios.',
    scheme: 'dark',
    colors: {
      background: '#08080A',
      foreground: '#FAFAFA',
      surface: '#121215',
      surfaceElevated: '#1A1A1F',
      muted: '#A1A1AA',
      border: '#26262C',
      accent: '#A855F7',
      accentForeground: '#0B0B0D',
    },
  },
  {
    id: 'ember',
    label: 'Braise',
    description: 'Chaleureux et gourmand. Restauration et métiers de bouche.',
    scheme: 'light',
    colors: {
      background: '#FFFCF8',
      foreground: '#1C1410',
      surface: '#F7EFE7',
      surfaceElevated: '#FFFFFF',
      muted: '#7A6A5E',
      border: '#EADFD3',
      accent: '#C2703A',
      accentForeground: '#FFFFFF',
    },
  },
  {
    id: 'lumen',
    label: 'Lumen',
    description: 'Doux et lumineux. Beauté, bien-être, hébergement.',
    scheme: 'light',
    colors: {
      background: '#FDFCFB',
      foreground: '#1A1715',
      surface: '#F5F1EC',
      surfaceElevated: '#FFFFFF',
      muted: '#79706A',
      border: '#E9E2DA',
      accent: '#B08D6A',
      accentForeground: '#FFFFFF',
    },
  },
  {
    id: 'forest',
    label: 'Forêt',
    description: 'Naturel et rassurant. Paysagistes, bio, associations.',
    scheme: 'light',
    colors: {
      background: '#FCFDFC',
      foreground: '#10201A',
      surface: '#EEF4F0',
      surfaceElevated: '#FFFFFF',
      muted: '#5F7068',
      border: '#DCE7E1',
      accent: '#0F766E',
      accentForeground: '#FFFFFF',
    },
  },
];

const PRESET_INDEX = new Map(THEME_PRESETS.map((p) => [p.id, p]));

export function getPreset(id: string): ThemePreset {
  return PRESET_INDEX.get(id) ?? (THEME_PRESETS[0] as ThemePreset);
}

const RADIUS_SCALE: Record<string, { sm: string; md: string; lg: string }> = {
  none: { sm: '0px', md: '0px', lg: '0px' },
  sm: { sm: '2px', md: '4px', lg: '6px' },
  md: { sm: '6px', md: '10px', lg: '16px' },
  lg: { sm: '10px', md: '16px', lg: '24px' },
  full: { sm: '9999px', md: '9999px', lg: '9999px' },
};

const DENSITY_SCALE: Record<string, { section: string; gap: string }> = {
  compact: { section: '3.5rem', gap: '1rem' },
  comfortable: { section: '5.5rem', gap: '1.5rem' },
  spacious: { section: '8rem', gap: '2rem' },
};

const HEADING_SCALE: Record<string, { h1: string; h2: string; h3: string }> = {
  subtle: { h1: 'clamp(2rem, 4vw, 2.75rem)', h2: 'clamp(1.5rem, 3vw, 2rem)', h3: '1.25rem' },
  balanced: { h1: 'clamp(2.5rem, 6vw, 4rem)', h2: 'clamp(1.75rem, 3.5vw, 2.5rem)', h3: '1.5rem' },
  dramatic: { h1: 'clamp(3rem, 8vw, 5.5rem)', h2: 'clamp(2rem, 5vw, 3.25rem)', h3: '1.75rem' },
};

export const themeTokensSchema = z.object({
  accent: z
    .string()
    .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
    .optional(),
  background: z
    .string()
    .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
    .optional(),
  foreground: z
    .string()
    .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
    .optional(),
  surface: z
    .string()
    .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
    .optional(),
  radius: z.enum(['none', 'sm', 'md', 'lg', 'full']).optional(),
  density: z.enum(['compact', 'comfortable', 'spacious']).optional(),
  buttonStyle: z.enum(['solid', 'outline', 'soft', 'pill']).optional(),
  headingScale: z.enum(['subtle', 'balanced', 'dramatic']).optional(),
});

export type ThemeTokens = z.infer<typeof themeTokensSchema>;

export interface ResolvedTheme {
  preset: ThemePreset;
  fontHeading: string;
  fontBody: string;
  tokens: Required<Pick<ThemeTokens, 'radius' | 'density' | 'buttonStyle' | 'headingScale'>> &
    ThemeTokens;
  /** Feuille de variables CSS, prete a etre injectee dans une balise style. */
  cssVariables: string;
  /** Declarations @font-face des polices auto-hebergees du theme. */
  fontFaces: string;
  scheme: 'light' | 'dark';
}

/** Convertit un hexadecimal en triplet RGB, pour les couleurs semi-transparentes. */
function hexToRgb(hex: string): string {
  const value = hex.replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value;
  const int = Number.parseInt(full, 16);
  return `${(int >> 16) & 255} ${(int >> 8) & 255} ${int & 255}`;
}

export function resolveTheme(input: {
  preset?: string;
  fontHeading?: string;
  fontBody?: string;
  tokens?: unknown;
}): ResolvedTheme {
  const preset = getPreset(input.preset ?? 'graphite');
  const parsed = themeTokensSchema.safeParse(input.tokens ?? {});
  const tokens = parsed.success ? parsed.data : {};

  const radius = tokens.radius ?? 'md';
  const density = tokens.density ?? 'comfortable';
  const buttonStyle = tokens.buttonStyle ?? 'solid';
  const headingScale = tokens.headingScale ?? 'balanced';

  const fontHeadingKey =
    input.fontHeading && FONT_STACKS[input.fontHeading] ? input.fontHeading : 'geist';
  const fontBodyKey = input.fontBody && FONT_STACKS[input.fontBody] ? input.fontBody : 'geist';
  const headingFont = FONT_STACKS[fontHeadingKey] as (typeof FONT_STACKS)[string];
  const bodyFont = FONT_STACKS[fontBodyKey] as (typeof FONT_STACKS)[string];

  const colors = {
    background: tokens.background ?? preset.colors.background,
    foreground: tokens.foreground ?? preset.colors.foreground,
    surface: tokens.surface ?? preset.colors.surface,
    surfaceElevated: preset.colors.surfaceElevated,
    muted: preset.colors.muted,
    border: preset.colors.border,
    accent: tokens.accent ?? preset.colors.accent,
    accentForeground: preset.colors.accentForeground,
  };

  const radii = RADIUS_SCALE[radius] as (typeof RADIUS_SCALE)[string];
  const spacing = DENSITY_SCALE[density] as (typeof DENSITY_SCALE)[string];
  const headings = HEADING_SCALE[headingScale] as (typeof HEADING_SCALE)[string];

  const cssVariables = [
    `--site-bg:${colors.background}`,
    `--site-fg:${colors.foreground}`,
    `--site-surface:${colors.surface}`,
    `--site-surface-elevated:${colors.surfaceElevated}`,
    `--site-muted:${colors.muted}`,
    `--site-border:${colors.border}`,
    `--site-accent:${colors.accent}`,
    `--site-accent-rgb:${hexToRgb(colors.accent)}`,
    `--site-accent-fg:${colors.accentForeground}`,
    `--site-fg-rgb:${hexToRgb(colors.foreground)}`,
    `--site-radius-sm:${radii.sm}`,
    `--site-radius-md:${radii.md}`,
    `--site-radius-lg:${radii.lg}`,
    `--site-section-y:${spacing.section}`,
    `--site-gap:${spacing.gap}`,
    `--site-h1:${headings.h1}`,
    `--site-h2:${headings.h2}`,
    `--site-h3:${headings.h3}`,
    `--site-font-heading:${headingFont.stack}`,
    `--site-font-body:${bodyFont.stack}`,
    `--site-button-radius:${buttonStyle === 'pill' ? '9999px' : radii.md}`,
  ].join(';');

  return {
    preset,
    fontHeading: fontHeadingKey,
    fontBody: fontBodyKey,
    tokens: { ...tokens, radius, density, buttonStyle, headingScale },
    cssVariables,
    fontFaces: fontFaceCss([fontHeadingKey, fontBodyKey]),
    scheme: preset.scheme,
  };
}
