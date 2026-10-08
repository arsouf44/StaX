import { escapeHtml } from './escape';

/**
 * Gabarit d e-mail.
 *
 * Contraintes propres au courrier electronique : tableaux plutot que flexbox,
 * styles en ligne, largeur fixe, et une version texte toujours fournie. Le
 * rendu doit rester lisible dans un client qui bloque les images ou refuse le
 * CSS moderne (Outlook pour Windows, Gmail sans styles) : aucune image, aucune
 * police distante, des couleurs posees aussi en attributs `bgcolor`.
 *
 * L identite reprend celle du site : le mot Nemasus en caracteres a empattement,
 * l encre gris-bleu, le fond perle, le bleu de mer pour l accent.
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
  background: '#F1F2F3',
  surface: '#FFFFFF',
  ink: '#14181C',
  ink2: '#4B545C',
  muted: '#6B737B',
  border: '#E1E4E7',
  inset: '#F6F7F8',
  accent: '#1D2328',
  accentText: '#FFFFFF',
  sea: '#2F5F86',
};

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',Times,serif";

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

  // Bouton « a l epreuve des balles » : une cellule coloree contenant le lien,
  // pour qu Outlook (qui ignore le padding des liens) affiche bien un bouton.
  const button = action
    ? `
      <tr>
        <td style="padding:8px 0 4px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td align="center" bgcolor="${COLORS.accent}"
                  style="border-radius:999px;background:${COLORS.accent};">
                <a href="${escapeHtml(action.url)}"
                   style="display:inline-block;padding:14px 26px;font-family:${SANS};font-size:15px;
                          line-height:1.2;font-weight:600;color:${COLORS.accentText};
                          text-decoration:none;border-radius:999px;">
                  ${escapeHtml(action.label)}
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : '';

  const secondary = secondaryAction
    ? `
      <tr>
        <td style="padding:12px 0 0;font-family:${SANS};font-size:14px;color:${COLORS.muted};">
          <a href="${escapeHtml(secondaryAction.url)}"
             style="color:${COLORS.sea};text-decoration:underline;">
            ${escapeHtml(secondaryAction.label)}
          </a>
        </td>
      </tr>`
    : '';

  const fallbackLink = action
    ? `<p style="margin:14px 0 0;font-family:${SANS};font-size:12px;line-height:1.6;color:${COLORS.muted};">
         Le bouton ne fonctionne pas ? Copiez ce lien dans votre navigateur :<br />
         <a href="${escapeHtml(action.url)}" style="color:${COLORS.muted};word-break:break-all;">
           ${escapeHtml(action.url)}</a>
       </p>`
    : '';

  return `<!DOCTYPE html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${escapeHtml(heading)}</title>
<style>
  @media only screen and (max-width: 600px) {
    .nm-card { border-radius: 0 !important; border-left: none !important; border-right: none !important; }
    .nm-pad { padding-left: 22px !important; padding-right: 22px !important; }
    .nm-outer { padding: 0 !important; }
    .nm-h1 { font-size: 24px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${COLORS.background};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       bgcolor="${COLORS.background}" style="background:${COLORS.background};">
  <tr>
    <td align="center" class="nm-outer" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             class="nm-card" bgcolor="${COLORS.surface}"
             style="max-width:560px;background:${COLORS.surface};border:1px solid ${COLORS.border};
                    border-radius:18px;">
        <tr>
          <td class="nm-pad" style="padding:30px 36px 0;">
            <span style="font-family:${SERIF};font-size:24px;line-height:1;letter-spacing:-0.01em;
                         color:${COLORS.ink};">Nemasus</span>
            <span style="display:block;margin-top:6px;font-family:${SANS};font-size:11px;
                         letter-spacing:0.16em;text-transform:uppercase;color:${COLORS.muted};">
              Studio de sites web
            </span>
          </td>
        </tr>
        <tr>
          <td class="nm-pad" style="padding:26px 36px 0;">
            <h1 class="nm-h1" style="margin:0;font-family:${SERIF};font-size:27px;line-height:1.2;
                       font-weight:normal;color:${COLORS.ink};letter-spacing:-0.01em;">
              ${escapeHtml(heading)}
            </h1>
          </td>
        </tr>
        <tr>
          <td class="nm-pad" style="padding:16px 36px 0;font-family:${SANS};font-size:15px;
                     line-height:1.65;color:${COLORS.ink};">
            ${body}
          </td>
        </tr>
        <tr>
          <td class="nm-pad" style="padding:18px 36px 30px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">${button}${secondary}</table>
            ${fallbackLink}
          </td>
        </tr>
        <tr>
          <td class="nm-pad" style="padding:0 36px 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="border-top:1px solid ${COLORS.border};font-size:0;line-height:0;">&nbsp;</td></tr>
            </table>
            <p style="margin:16px 0 0;font-family:${SANS};font-size:12px;line-height:1.6;color:${COLORS.muted};">
              ${footerNote ? `${escapeHtml(footerNote)}<br /><br />` : ''}
              Une question ? Répondez à cet e-mail ou écrivez à
              <a href="mailto:${escapeHtml(supportEmail)}" style="color:${COLORS.muted};">${escapeHtml(supportEmail)}</a>.
            </p>
          </td>
        </tr>
      </table>
      <p style="margin:18px 0 0;font-family:${SANS};font-size:12px;line-height:1.6;color:${COLORS.muted};">
        ${escapeHtml(companyName)} ·
        <a href="${escapeHtml(platformUrl)}" style="color:${COLORS.muted};">${escapeHtml(platformUrl.replace(/^https?:\/\//, ''))}</a>
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
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 18px;">
    <tr><td align="center" bgcolor="${COLORS.inset}"
            style="padding:18px 12px;background:${COLORS.inset};border:1px solid ${COLORS.border};
                   border-radius:12px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
                   font-size:24px;letter-spacing:0.14em;font-weight:600;color:${COLORS.ink};">
      ${escapeHtml(value)}
    </td></tr>
  </table>`;
}

export function definitionList(items: ReadonlyArray<[string, string]>): string {
  const rows = items
    .map(
      ([label, value]) => `
      <tr>
        <td style="padding:8px 12px 8px 0;font-size:14px;color:${COLORS.muted};width:42%;
                   vertical-align:top;border-bottom:1px solid ${COLORS.border};">
          ${escapeHtml(label)}</td>
        <td style="padding:8px 0;font-size:14px;color:${COLORS.ink};font-weight:600;
                   vertical-align:top;border-bottom:1px solid ${COLORS.border};word-break:break-word;">
          ${escapeHtml(value)}</td>
      </tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
    style="margin:4px 0 18px;font-family:${SANS};">${rows}</table>`;
}

/** Etapes numerotees : « ce qui se passe ensuite ». */
export function steps(items: readonly string[]): string {
  const rows = items
    .map(
      (item, index) => `
      <tr>
        <td style="padding:6px 12px 6px 0;width:26px;vertical-align:top;">
          <span style="display:inline-block;width:24px;height:24px;line-height:24px;border-radius:999px;
                       background:${COLORS.inset};border:1px solid ${COLORS.border};text-align:center;
                       font-size:12px;font-weight:600;color:${COLORS.ink};">${index + 1}</span>
        </td>
        <td style="padding:8px 0;font-size:14px;line-height:1.55;color:${COLORS.ink2};vertical-align:top;">
          ${escapeHtml(item)}</td>
      </tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
    style="margin:4px 0 18px;font-family:${SANS};">${rows}</table>`;
}

/** Version texte : obligatoire, et souvent la seule lue sur mobile. */
export function toPlainText(parts: readonly string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n\n');
}
