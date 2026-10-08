import { ImageResponse } from 'next/og';

/**
 * Image de partage (Open Graph, X/Twitter) : la marque et sa promesse, sans
 * prix ni chiffre. Générée à la compilation, servie comme un fichier statique.
 */
export const alt = 'Nemasus — Nous créons votre site. Vous le gérez ensuite.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '72px 80px',
        background: 'linear-gradient(160deg, #F7F8F9 0%, #E3E7EA 55%, #C9D6E0 100%)',
        color: '#14181C',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
        <svg width="64" height="64" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="7" fill="#1D2328" />
          <g strokeWidth="4.5" strokeLinecap="round">
            <path d="M9.5 23.5 L9.5 8.5" stroke="#F4F6F8" />
            <path d="M13.4 13 L18.6 19" stroke="#F4F6F8" strokeOpacity="0.8" />
            <path d="M22.5 23.5 L22.5 8.5" stroke="#9FB7CB" />
          </g>
        </svg>
        <div style={{ fontSize: 44, letterSpacing: -1 }}>Nemasus</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={{ fontSize: 76, lineHeight: 1.05, letterSpacing: -2, maxWidth: 980 }}>
          Nous créons votre site. Vous le gérez ensuite.
        </div>
        <div style={{ fontSize: 30, color: '#4B545C', maxWidth: 980 }}>
          Studio français de sites web professionnels, conçus et développés sur mesure.
        </div>
      </div>
    </div>,
    size,
  );
}
