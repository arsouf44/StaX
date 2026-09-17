import { escapeHtml } from './escape';

/**
 * Gabarit d e-mail.
 *
 * Contraintes propres au courrier electronique : tableaux plutot que flexbox,
 * styles en ligne, largeur fixe, et une version texte toujours fournie. Le
 * rendu doit rester lisible dans un client qui bloque les images ou refuse le
 * CSS moderne.
 */

export interface EmailLayoutOptions {
  preheader: string;
  heading: string;
  body: string;
  action?: { label: string; url: string };
  secondaryAction?: { label: string; url: string };
  footerNote?: string;
  platformUrl: string;
  supportEmail: string;
  companyName: string;
}

const COLORS = {
  background: '#F4F4F5',
  surface: '#FFFFFF',
  ink: '#0B0B0D',
  muted: '#6B6B73',
  border: '#E4E4E7',
  accent: '#0B0B0D',
  accentText: '#FFFFFF',
};

export function renderEmailLayout(options: EmailLayoutOptions): string {
  const {
    preheader,
    heading,
    body,
    action,
    secondaryAction,
    footerNote,
    platformUrl,
    supportEmail,
    companyName,
  } = options;

  const button = action
    ? `
      <tr>
        <td style="padding:8px 0 4px;">
          <a href="${escapeHtml(action.url)}"
             style="display:inline-block;background:${COLORS.accent};color:${COLORS.accentText};
                    text-decoration:none;font-weight:600;font-size:15px;line-height:1;
                    padding:14px 24px;border-radius:10px;">
            ${escapeHtml(action.label)}
          </a>
        </td>
      </tr>`
    : '';

  const secondary = secondaryAction
    ? `
      <tr>
        <td style="padding:4px 0 0;font-size:14px;color:${COLORS.muted};">
          <a href="${escapeHtml(secondaryAction.url)}" style="color:${COLORS.muted};">
            ${escapeHtml(secondaryAction.label)}
          </a>
        </td>
      </tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.background};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
       style="background:${COLORS.background};padding:32px 16px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:560px;background:${COLORS.surface};border:1px solid ${COLORS.border};
                    border-radius:16px;overflow:hidden;">
        <tr>
          <td style="padding:28px 32px 0;">
            <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
                         font-size:18px;font-weight:700;letter-spacing:-0.02em;color:${COLORS.ink};">
              Sta<span style="color:#7C5CFF;">X</span>
            </span>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 0;">
            <h1 style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
                       font-size:22px;line-height:1.3;font-weight:650;color:${COLORS.ink};
                       letter-spacing:-0.02em;">
              ${escapeHtml(heading)}
            </h1>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 32px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',
                     Roboto,sans-serif;font-size:15px;line-height:1.65;color:${COLORS.ink};">
            ${body}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 28px;">
            <table role="presentation" cellpadding="0" cellspacing="0">${button}${secondary}</table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 28px;">
            <hr style="border:none;border-top:1px solid ${COLORS.border};margin:0 0 16px;" />
            <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
                      font-size:12px;line-height:1.6;color:${COLORS.muted};">
              ${footerNote ? `${escapeHtml(footerNote)}<br /><br />` : ''}
              Une question ? Repondez a cet e-mail ou ecrivez a
              <a href="mailto:${escapeHtml(supportEmail)}" style="color:${COLORS.muted};">
                ${escapeHtml(supportEmail)}</a>.
            </p>
          </td>
        </tr>
      </table>
      <p style="margin:16px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
                font-size:12px;color:${COLORS.muted};">
        ${escapeHtml(companyName)} ·
        <a href="${escapeHtml(platformUrl)}" style="color:${COLORS.muted};">
          ${escapeHtml(platformUrl.replace(/^https?:\/\//, ''))}</a>
      </p>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export function paragraph(textContent: string): string {
  return `<p style="margin:0 0 14px;">${escapeHtml(textContent)}</p>`;
}

export function strongLine(textContent: string): string {
  return `<p style="margin:0 0 14px;font-weight:600;">${escapeHtml(textContent)}</p>`;
}

export function codeBlock(value: string): string {
  return `<p style="margin:0 0 16px;padding:14px 18px;background:#F6F6F7;border:1px solid ${COLORS.border};
    border-radius:10px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:20px;
    letter-spacing:0.12em;font-weight:600;text-align:center;">${escapeHtml(value)}</p>`;
}

export function definitionList(items: ReadonlyArray<[string, string]>): string {
  const rows = items
    .map(
      ([label, value]) => `
      <tr>
        <td style="padding:6px 0;font-size:14px;color:${COLORS.muted};width:45%;">
          ${escapeHtml(label)}</td>
        <td style="padding:6px 0;font-size:14px;color:${COLORS.ink};font-weight:500;">
          ${escapeHtml(value)}</td>
      </tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
    style="margin:0 0 16px;">${rows}</table>`;
}

/** Version texte : obligatoire, et souvent la seule lue sur mobile. */
export function toPlainText(parts: readonly string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n\n');
}
