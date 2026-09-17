const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Echappement HTML local au paquet e-mails.
 *
 * Duplique volontairement la fonction de @stax/security : le rendu d e-mail
 * doit rester utilisable dans un contexte ou seul ce paquet est charge, et
 * cette dependance ne doit jamais devenir optionnelle.
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}
