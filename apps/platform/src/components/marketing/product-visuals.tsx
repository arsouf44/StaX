import { cn } from '@stax/ui';

/**
 * Representations du produit.
 *
 * Entierement en HTML et SVG : aucune capture d ecran a maintenir, aucune
 * image a charger, un rendu net sur tous les ecrans et un poids negligeable.
 * Ces compositions montrent l interface reelle — memes jetons de design,
 * memes composants, meme vocabulaire que dans l application.
 */

/* -------------------------------------------------------------------------- */
/*  Chrome de navigateur                                                       */
/* -------------------------------------------------------------------------- */

export function BrowserFrame({
  url,
  children,
  className,
  tone = 'dark',
  secure = true,
}: {
  url: string;
  children: React.ReactNode;
  className?: string;
  tone?: 'dark' | 'light';
  secure?: boolean;
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-[var(--radius-lg)] border shadow-[0_32px_80px_-32px_rgb(0_0_0/0.8)]',
        tone === 'dark'
          ? 'border-[var(--glass-border-strong)] bg-[#0b0b0f]'
          : 'border-black/10 bg-white',
        className,
      )}
    >
      <div
        className={cn(
          'flex items-center gap-3 border-b px-3 py-2.5',
          tone === 'dark' ? 'border-white/8 bg-white/[0.02]' : 'border-black/6 bg-black/[0.015]',
        )}
      >
        <div aria-hidden="true" className="flex gap-1.5">
          {['#FF5F57', '#FEBC2E', '#28C840'].map((color) => (
            <span
              key={color}
              className="size-2.5 rounded-full opacity-70"
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
        <div
          className={cn(
            'flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2.5 py-1 text-2xs',
            tone === 'dark' ? 'bg-white/[0.04] text-white/55' : 'bg-black/[0.04] text-black/50',
          )}
        >
          {secure ? (
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              fill="currentColor"
              className="size-2.5 shrink-0 text-[var(--success)]"
            >
              <path d="M8 1a3.2 3.2 0 0 0-3.2 3.2V6H4.5A1.5 1.5 0 0 0 3 7.5v5A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 11.5 6h-.3V4.2A3.2 3.2 0 0 0 8 1Zm1.8 5H6.2V4.2a1.8 1.8 0 1 1 3.6 0V6Z" />
            </svg>
          ) : null}
          <span className="truncate font-mono">{url}</span>
        </div>
        <div aria-hidden="true" className="hidden gap-1 sm:flex">
          <span
            className={cn('h-3 w-3 rounded-sm', tone === 'dark' ? 'bg-white/8' : 'bg-black/8')}
          />
          <span
            className={cn('h-3 w-3 rounded-sm', tone === 'dark' ? 'bg-white/8' : 'bg-black/8')}
          />
        </div>
      </div>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Tableau de bord client                                                     */
/* -------------------------------------------------------------------------- */

const DASHBOARD_NAV = [
  { label: 'Tableau de bord', icon: 'grid', active: true },
  { label: 'Mon projet', icon: 'route' },
  { label: 'Modifier mon site', icon: 'pencil' },
  { label: 'Messages', icon: 'inbox', badge: 3 },
  { label: 'Réservations', icon: 'calendar', badge: 7 },
  { label: 'Carte', icon: 'utensils' },
  { label: 'Statistiques', icon: 'chart' },
  { label: 'Paiements', icon: 'card' },
];

const NAV_ICONS: Record<string, React.ReactNode> = {
  grid: <path d="M2 2h5v5H2V2Zm7 0h5v5H9V2ZM2 9h5v5H2V9Zm7 0h5v5H9V9Z" />,
  route: (
    <path d="M4 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm8 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM4 6v2a2 2 0 0 0 2 2h4a2 2 0 0 1 2 2" />
  ),
  pencil: <path d="M11.5 1.5 14 4l-8 8-3 1 1-3 7.5-8.5Z" />,
  inbox: (
    <path d="M1.5 9.5h3l1 2h5l1-2h3M1.5 9.5 3 3h10l1.5 6.5v3a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-3Z" />
  ),
  calendar: <path d="M2 4h12v10H2V4Zm3-2v3m6-3v3M2 7h12" />,
  utensils: <path d="M4 1v6m0 0v8m0-8H2.5V1M4 7h1.5V1M11 1c-1 0-2 2-2 4.5S10 9 11 9m0-8v14" />,
  chart: <path d="M2 14V8m4 6V3m4 11V6m4 8V9" />,
  card: <path d="M1.5 4.5h13v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-7Zm0 2.5h13" />,
};

function NavIcon({ name }: { name: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3.5 shrink-0"
    >
      {NAV_ICONS[name]}
    </svg>
  );
}

export function DashboardMock({ className }: { className?: string }) {
  return (
    <div className={cn('flex h-full min-h-[26rem] bg-[#0b0b0f] text-white/90', className)}>
      {/* Barre laterale */}
      <aside className="hidden w-52 shrink-0 flex-col border-r border-white/8 p-3 sm:flex">
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.03] p-2">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-[#6E6BFF]/15 text-[10px] font-semibold text-[#8B89FF]">
            RD
          </span>
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium">Restaurant Dupont</p>
            <p className="truncate text-[9px] text-white/40">Offre Premium</p>
          </div>
        </div>
        <nav className="space-y-0.5">
          {DASHBOARD_NAV.map((item) => (
            <div
              key={item.label}
              className={cn(
                'flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px]',
                item.active ? 'bg-white/[0.07] text-white' : 'text-white/50',
              )}
            >
              <NavIcon name={item.icon} />
              <span className="truncate">{item.label}</span>
              {item.badge ? (
                <span className="ml-auto rounded-full bg-[#6E6BFF] px-1.5 text-[9px] font-medium text-white">
                  {item.badge}
                </span>
              ) : null}
            </div>
          ))}
        </nav>
        <div className="mt-auto rounded-lg border border-white/8 bg-white/[0.02] p-2.5">
          <p className="text-[10px] text-white/50">Site en ligne</p>
          <p className="mt-1 flex items-center gap-1.5 text-[10px] text-[#00C896]">
            <span className="size-1.5 rounded-full bg-[#00C896]" />
            restaurant-dupont.fr
          </p>
        </div>
      </aside>

      {/* Contenu */}
      <div className="min-w-0 flex-1 p-4 sm:p-5">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-[13px] font-medium">Bonjour Marc.</p>
            <p className="mt-0.5 text-[11px] text-white/45">
              Votre site est en ligne depuis 42 jours.
            </p>
          </div>
          <span className="hidden rounded-md border border-white/10 px-2 py-1 text-[10px] text-white/50 sm:block">
            30 derniers jours
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {[
            { label: 'Visiteurs', value: '1 284', delta: '+12,4 %', good: true },
            { label: 'Messages', value: '23', delta: '+4', good: true },
            { label: 'Réservations', value: '61', delta: '+9,1 %', good: true },
            { label: 'Couverts', value: '184', delta: null, good: true },
          ].map((stat) => (
            <div key={stat.label} className="rounded-lg border border-white/8 bg-white/[0.02] p-3">
              <p className="text-[10px] text-white/45">{stat.label}</p>
              <p className="mt-1 text-lg font-medium tabular-nums">{stat.value}</p>
              {stat.delta ? (
                <p className="mt-0.5 text-[10px] text-[#00C896] tabular-nums">{stat.delta}</p>
              ) : (
                <p className="mt-0.5 text-[10px] text-white/30">—</p>
              )}
            </div>
          ))}
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-[1.6fr_1fr]">
          <div className="rounded-lg border border-white/8 bg-white/[0.02] p-3">
            <p className="text-[11px] font-medium">Fréquentation</p>
            <SparkChart className="mt-3" />
          </div>
          <div className="rounded-lg border border-white/8 bg-white/[0.02] p-3">
            <p className="text-[11px] font-medium">Prochaines réservations</p>
            <ul className="mt-2.5 space-y-2">
              {[
                { time: '19:30', name: 'Famille Léger', size: 4 },
                { time: '20:00', name: 'C. Moreau', size: 2 },
                { time: '20:45', name: 'Table 12', size: 6 },
              ].map((booking) => (
                <li key={booking.time} className="flex items-center gap-2.5 text-[10px]">
                  <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-white/70">
                    {booking.time}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-white/70">{booking.name}</span>
                  <span className="text-white/40">{booking.size} pers.</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Courbe de frequentation. Forme fixe et deterministe : aucune donnee inventee. */
function SparkChart({ className }: { className?: string }) {
  const points = [18, 24, 21, 32, 28, 41, 38, 46, 44, 52, 49, 58, 54, 63];
  const max = Math.max(...points);
  const width = 260;
  const height = 64;
  const step = width / (points.length - 1);
  const path = points
    .map((value, index) => {
      const x = index * step;
      const y = height - (value / max) * height;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn('h-16 w-full', className)}
    >
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#6E6BFF" stopOpacity="0.28" />
          <stop offset="1" stopColor="#6E6BFF" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path} L${width} ${height} L0 ${height} Z`} fill="url(#spark-fill)" />
      <path
        d={path}
        fill="none"
        stroke="#8B89FF"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Editeur de site                                                            */
/* -------------------------------------------------------------------------- */

export function EditorMock({ className }: { className?: string }) {
  return (
    <div className={cn('flex h-full min-h-[24rem] bg-[#0b0b0f] text-white/90', className)}>
      <aside className="hidden w-48 shrink-0 flex-col border-r border-white/8 p-3 md:flex">
        <p className="mb-2 text-[9px] font-medium tracking-[0.12em] text-white/35 uppercase">
          Sections de la page
        </p>
        <ul className="space-y-1">
          {[
            { label: 'Bannière', active: true },
            { label: 'Présentation' },
            { label: 'Notre carte' },
            { label: 'Galerie photos' },
            { label: 'Horaires' },
            { label: 'Avis clients' },
            { label: 'Contact' },
          ].map((block) => (
            <li
              key={block.label}
              className={cn(
                'flex items-center gap-2 rounded-md border px-2 py-1.5 text-[10px]',
                block.active
                  ? 'border-[#6E6BFF]/45 bg-[#6E6BFF]/10 text-white'
                  : 'border-white/8 bg-white/[0.02] text-white/55',
              )}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                className="size-3 text-white/25"
                fill="currentColor"
              >
                <circle cx="6" cy="4" r="1" />
                <circle cx="10" cy="4" r="1" />
                <circle cx="6" cy="8" r="1" />
                <circle cx="10" cy="8" r="1" />
                <circle cx="6" cy="12" r="1" />
                <circle cx="10" cy="12" r="1" />
              </svg>
              <span className="truncate">{block.label}</span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          className="mt-2 w-full rounded-md border border-dashed border-white/12 py-1.5 text-[10px] text-white/40"
        >
          + Ajouter une section
        </button>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 border-b border-white/8 px-3 py-2">
          <div className="flex min-w-0 gap-0.5 overflow-hidden rounded-md border border-white/8 p-0.5">
            {['Ordinateur', 'Tablette', 'Mobile'].map((device, index) => (
              <span
                key={device}
                className={cn(
                  'rounded px-2 py-0.5 text-[9px] whitespace-nowrap',
                  index === 0 ? 'bg-white/[0.08] text-white' : 'text-white/40',
                )}
              >
                {device}
              </span>
            ))}
          </div>
          {/* Sous 400 px, l etat du brouillon s efface : l action de publier
              doit rester visible, l information peut attendre. */}
          <span className="ml-auto hidden items-center gap-1.5 text-[9px] whitespace-nowrap text-white/40 min-[400px]:flex">
            <span className="size-1.5 rounded-full bg-[#F5A524]" />
            Brouillon — 3 modifications
          </span>
          <span className="ml-auto rounded-md bg-white px-2.5 py-1 text-[9px] font-medium whitespace-nowrap text-black min-[400px]:ml-0">
            Publier
          </span>
        </div>

        <div className="p-4">
          <div className="rounded-lg border border-[#6E6BFF]/45 bg-[#6E6BFF]/[0.06] p-4">
            <p className="text-[9px] text-[#8B89FF]">Bannière · sélectionnée</p>
            <div className="mt-2.5 space-y-2">
              <div className="h-2.5 w-2/3 rounded bg-white/18" />
              <div className="h-2 w-1/2 rounded bg-white/10" />
              <div className="mt-3 flex gap-2">
                <span className="rounded bg-white/85 px-3 py-1 text-[9px] text-black">
                  Réserver
                </span>
                <span className="rounded border border-white/20 px-3 py-1 text-[9px] text-white/70">
                  Voir la carte
                </span>
              </div>
            </div>
          </div>
          <div className="mt-2 space-y-2 opacity-45">
            <div className="rounded-lg border border-white/8 p-4">
              <div className="h-2 w-1/3 rounded bg-white/12" />
              <div className="mt-2 grid grid-cols-3 gap-2">
                {[0, 1, 2].map((index) => (
                  <div key={index} className="h-10 rounded bg-white/[0.05]" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <aside className="hidden w-48 shrink-0 border-l border-white/8 p-3 lg:block">
        <p className="mb-2 text-[9px] font-medium tracking-[0.12em] text-white/35 uppercase">
          Contenu
        </p>
        <div className="space-y-2.5">
          <div>
            <p className="text-[9px] text-white/40">Titre</p>
            <div className="mt-1 rounded border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[10px] text-white/75">
              Une cuisine qui vous ressemble
            </div>
          </div>
          <div>
            <p className="text-[9px] text-white/40">Sous-titre</p>
            <div className="mt-1 h-10 rounded border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[9px] leading-relaxed text-white/55">
              Découvrez notre carte et réservez votre table.
            </div>
          </div>
          <div>
            <p className="text-[9px] text-white/40">Fond</p>
            <div className="mt-1 flex gap-1">
              {['#0b0b0f', '#1a1a20', '#C2703A', '#F7EFE7'].map((color, index) => (
                <span
                  key={color}
                  className={cn(
                    'size-5 rounded border',
                    index === 2 ? 'border-white/60' : 'border-white/12',
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Site client rendu                                                          */
/* -------------------------------------------------------------------------- */

export type SitePreviewVariant = 'restaurant' | 'coiffeur' | 'artisan';

const SITE_PREVIEWS: Record<
  SitePreviewVariant,
  {
    name: string;
    nav: string[];
    title: string;
    subtitle: string;
    cta: string;
    accent: string;
    bg: string;
    fg: string;
    surface: string;
    cards: Array<{ title: string; meta: string }>;
    sectionLabel: string;
  }
> = {
  restaurant: {
    name: 'Restaurant Dupont',
    nav: ['La carte', 'Le restaurant', 'Réserver', 'Contact'],
    title: 'Une cuisine de saison,\nau cœur de Lyon.',
    subtitle: 'Produits frais, carte renouvelée chaque mois, réservation en ligne.',
    cta: 'Réserver une table',
    accent: '#C2703A',
    bg: '#14100D',
    fg: '#FAF6F1',
    surface: 'rgba(255,255,255,0.05)',
    sectionLabel: 'Suggestions du moment',
    cards: [
      { title: 'Velouté de courge', meta: '9 €' },
      { title: 'Filet de bar, beurre blanc', meta: '24 €' },
      { title: 'Tarte fine aux pommes', meta: '8 €' },
    ],
  },
  coiffeur: {
    name: 'Atelier Camille',
    nav: ['Prestations', 'L’équipe', 'Rendez-vous', 'Contact'],
    title: 'Votre coupe,\npensée pour vous.',
    subtitle: 'Diagnostic personnalise, produits soignes, rendez-vous en ligne 7j/7.',
    cta: 'Prendre rendez-vous',
    accent: '#B08D6A',
    bg: '#FDFCFB',
    fg: '#1A1715',
    surface: 'rgba(0,0,0,0.035)',
    sectionLabel: 'Prestations',
    cards: [
      { title: 'Coupe & brushing', meta: '45 min · 42 €' },
      { title: 'Couleur végétale', meta: '1 h 30 · 78 €' },
      { title: 'Soin profond', meta: '30 min · 28 €' },
    ],
  },
  artisan: {
    name: 'Martin Plomberie',
    nav: ['Prestations', 'Zones', 'Réalisations', 'Devis'],
    title: 'Depannage plomberie,\n7j/7 en Haute-Savoie.',
    subtitle: 'Intervention rapide, devis gratuit, travail garanti et assuré.',
    cta: 'Demander un devis',
    accent: '#3B82F6',
    bg: '#0B0D12',
    fg: '#F5F7FA',
    surface: 'rgba(255,255,255,0.05)',
    sectionLabel: 'Nos interventions',
    cards: [
      { title: 'Fuite & dépannage', meta: 'Urgence 7j/7' },
      { title: 'Chauffe-eau', meta: 'Devis gratuit' },
      { title: 'Salle de bain', meta: 'Sur devis' },
    ],
  },
};

export function SitePreview({
  variant,
  className,
}: {
  variant: SitePreviewVariant;
  className?: string;
}) {
  const site = SITE_PREVIEWS[variant];
  const isLight = variant === 'coiffeur';

  return (
    <div
      className={cn('h-full min-h-[22rem] overflow-hidden', className)}
      style={{ background: site.bg, color: site.fg }}
    >
      <div
        className="flex items-center justify-between px-5 py-3 text-[10px]"
        style={{
          borderBottom: `1px solid ${isLight ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.08)'}`,
        }}
      >
        <span className="font-medium tracking-tight">{site.name}</span>
        <nav aria-hidden="true" className="hidden gap-4 opacity-60 sm:flex">
          {site.nav.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </nav>
        <span
          className="rounded-full px-2.5 py-1 text-[9px] font-medium"
          style={{ background: site.accent, color: isLight ? '#fff' : '#fff' }}
        >
          {site.cta}
        </span>
      </div>

      <div className="px-5 py-8 sm:px-8 sm:py-10">
        <h3 className="text-xl leading-[1.15] font-medium tracking-[-0.03em] whitespace-pre-line sm:text-2xl">
          {site.title}
        </h3>
        <p className="mt-3 max-w-md text-[11px] leading-relaxed opacity-60">{site.subtitle}</p>
        <div className="mt-5 flex gap-2">
          <span
            className="rounded-md px-3.5 py-1.5 text-[10px] font-medium"
            style={{ background: site.accent, color: '#fff' }}
          >
            {site.cta}
          </span>
          <span
            className="rounded-md px-3.5 py-1.5 text-[10px]"
            style={{
              border: `1px solid ${isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.16)'}`,
            }}
          >
            En savoir plus
          </span>
        </div>

        <p className="mt-8 text-[9px] font-medium tracking-[0.14em] uppercase opacity-40">
          {site.sectionLabel}
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {site.cards.map((card) => (
            <div
              key={card.title}
              className="rounded-lg p-3"
              style={{
                background: site.surface,
                border: `1px solid ${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.07)'}`,
              }}
            >
              <div
                className="mb-2.5 h-12 rounded"
                style={{ background: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)' }}
              />
              <p className="text-[10px] font-medium">{card.title}</p>
              <p className="mt-0.5 text-[9px] opacity-55">{card.meta}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Panneaux flottants                                                         */
/* -------------------------------------------------------------------------- */

export function InboxPanel({ className }: { className?: string }) {
  return (
    <div className={cn('glass-edge rounded-[var(--radius-md)] p-3.5 glass-3', className)}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium">Messages</p>
        <span className="rounded-full bg-[var(--accent)] px-1.5 text-[9px] font-medium text-white">
          3
        </span>
      </div>
      <ul className="mt-2.5 space-y-2">
        {[
          {
            name: 'Claire Besson',
            text: 'Bonjour, avez-vous une table pour 6…',
            time: 'il y a 4 min',
          },
          { name: 'Julien M.', text: 'Proposez-vous un menu sans gluten ?', time: 'il y a 1 h' },
        ].map((message) => (
          <li key={message.name} className="flex gap-2.5">
            <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
            <div className="min-w-0">
              <p className="text-[10px] font-medium text-[var(--foreground)]">{message.name}</p>
              <p className="truncate text-[10px] text-[var(--muted)]">{message.text}</p>
              <p className="text-[9px] text-[var(--muted)] opacity-70">{message.time}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PaymentPanel({ className }: { className?: string }) {
  return (
    <div className={cn('glass-edge rounded-[var(--radius-md)] p-3.5 glass-3', className)}>
      <p className="text-[11px] font-medium">Paiement reçu</p>
      <p className="mt-2 text-2xl font-medium tracking-[-0.03em] tabular-nums">48,00 €</p>
      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-[var(--success)]">
        <svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor" className="size-3">
          <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm3.2 4.55-4 4.25-2.4-2.3 1.04-1.08 1.33 1.28 2.96-3.15 1.07 1Z" />
        </svg>
        Versé sur votre compte
      </div>
      <p className="mt-2.5 border-t border-[var(--border)] pt-2.5 text-[9px] leading-relaxed text-[var(--muted)]">
        Encaissé sur votre propre compte Stripe. StaX ne prélève aucune commission.
      </p>
    </div>
  );
}

export function BookingPanel({ className }: { className?: string }) {
  return (
    <div className={cn('glass-edge rounded-[var(--radius-md)] p-3.5 glass-3', className)}>
      <p className="text-[11px] font-medium">Nouvelle réservation</p>
      <div className="mt-2.5 space-y-1.5 text-[10px]">
        <div className="flex justify-between">
          <span className="text-[var(--muted)]">Samedi 14 mars</span>
          <span className="font-mono">20:00</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--muted)]">Personnes</span>
          <span>4</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--muted)]">Nom</span>
          <span>C. Besson</span>
        </div>
      </div>
      <div className="mt-3 flex gap-1.5">
        <span className="flex-1 rounded-md bg-[var(--primary)] py-1 text-center text-[9px] font-medium text-[var(--primary-foreground)]">
          Confirmer
        </span>
        <span className="rounded-md border border-[var(--border)] px-2.5 py-1 text-[9px] text-[var(--muted)]">
          Refuser
        </span>
      </div>
    </div>
  );
}

export function DeployPanel({ className }: { className?: string }) {
  return (
    <div className={cn('glass-edge rounded-[var(--radius-md)] p-3.5 font-mono glass-3', className)}>
      <p className="text-[10px] text-[var(--muted)]">Publication</p>
      <ul className="mt-2 space-y-1.5 text-[10px]">
        {[
          { label: 'Contenu validé', done: true },
          { label: 'Version figée', done: true },
          { label: 'Cache invalidé', done: true },
          { label: 'En ligne', done: true },
        ].map((step) => (
          <li key={step.label} className="flex items-center gap-2">
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              fill="currentColor"
              className="size-3 text-[var(--success)]"
            >
              <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm3.2 4.55-4 4.25-2.4-2.3 1.04-1.08 1.33 1.28 2.96-3.15 1.07 1Z" />
            </svg>
            <span className="text-[var(--foreground-muted)]">{step.label}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2.5 border-t border-[var(--border)] pt-2 text-[9px] text-[var(--muted)]">
        version 14 · 1,2 s
      </p>
    </div>
  );
}
