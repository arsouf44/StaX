import { z } from 'zod';

/**
 * Themes des sites clients.
 *
 * Un theme est un jeu de JETONS, jamais du CSS. Le client choisit un preset et
 * ajuste quelques variables ; le moteur produit des declarations de variables
 * CSS a partir de valeurs validees. Aucune chaine fournie par l utilisateur
 * n atteint la feuille de style sans passer par ce filtre.
 */

export const FONT_STACKS: Record<string, { family: string; stack: string; googleFont?: string }> = {
  geist: {
    family: 'Geist',
    stack: "'Geist', system-ui, -apple-system, 'Segoe UI', sans-serif",
  },
  inter: {
    family: 'Inter',
    stack: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
    googleFont: 'Inter:wght@400;500;600;700',
  },
  sora: {
    family: 'Sora',
    stack: "'Sora', system-ui, sans-serif",
    googleFont: 'Sora:wght@400;500;600;700',
  },
  fraunces: {
    family: 'Fraunces',
    stack: "'Fraunces', Georgia, 'Times New Roman', serif",
    googleFont: 'Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700',
  },
  'instrument-serif': {
    family: 'Instrument Serif',
    stack: "'Instrument Serif', Georgia, serif",
    googleFont: 'Instrument+Serif:ital@0;1',
  },
  'ibm-plex-sans': {
    family: 'IBM Plex Sans',
    stack: "'IBM Plex Sans', system-ui, sans-serif",
    googleFont: 'IBM+Plex+Sans:wght@400;500;600;700',
  },
};

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
    description: 'Sobre et technique. Convient a presque tous les metiers.',
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
    description: 'Serieux et institutionnel. Immobilier, conseil, sante.',
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
    description: 'Fond sombre, contraste eleve. Bars, evenementiel, studios.',
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
    description: 'Chaleureux et gourmand. Restauration et metiers de bouche.',
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
    description: 'Doux et lumineux. Beaute, bien-etre, hebergement.',
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
    label: 'Foret',
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
  accent: z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).optional(),
  background: z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).optional(),
  foreground: z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).optional(),
  surface: z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).optional(),
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
  /** URL Google Fonts a precharger, ou null si les polices sont auto-hebergees. */
  googleFontsHref: string | null;
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

  const fontHeadingKey = input.fontHeading && FONT_STACKS[input.fontHeading] ? input.fontHeading : 'geist';
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

  const googleFonts = [headingFont.googleFont, bodyFont.googleFont].filter(
    (value, index, array): value is string => Boolean(value) && array.indexOf(value) === index,
  );

  return {
    preset,
    fontHeading: fontHeadingKey,
    fontBody: fontBodyKey,
    tokens: { ...tokens, radius, density, buttonStyle, headingScale },
    cssVariables,
    googleFontsHref:
      googleFonts.length > 0
        ? `https://fonts.googleapis.com/css2?${googleFonts
            .map((f) => `family=${f}`)
            .join('&')}&display=swap`
        : null,
    scheme: preset.scheme,
  };
}
