import { ImageResponse } from 'next/og';

/** Icône d'écran d'accueil (iOS) : la marque, sur fond graphite. */
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#1D2328',
      }}
    >
      <svg width="132" height="132" viewBox="0 0 32 32">
        <g strokeWidth="4.5" strokeLinecap="round">
          <path d="M9.5 23.5 L9.5 8.5" stroke="#F4F6F8" />
          <path d="M13.4 13 L18.6 19" stroke="#F4F6F8" strokeOpacity="0.8" />
          <path d="M22.5 23.5 L22.5 8.5" stroke="#9FB7CB" />
        </g>
      </svg>
    </div>,
    size,
  );
}
