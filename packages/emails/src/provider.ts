import { readEnv } from '@stax/config';

/**
 * Envoi d e-mails transactionnels.
 *
 * Interface volontairement minimale pour rester independante du fournisseur :
 * changer de prestataire ne doit toucher qu un fichier. Le mode `console`
 * permet de developper sans compte externe, sans jamais envoyer un vrai
 * message a un vrai client par accident.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  /** Identifiant du gabarit, pour la journalisation et les statistiques. */
  template: string;
  tags?: Record<string, string>;
}

export interface EmailSendResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
  /** `true` lorsque le fournisseur n est pas configure : le flux continue. */
  skipped?: boolean;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailSendResult>;
}

/** Fournisseur de developpement : trace l envoi, n expedie rien. */
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = 'console';

  async send(message: EmailMessage): Promise<EmailSendResult> {
    console.warn(
      `[StaX][email:${message.template}] destinataire masque, sujet : ${message.subject}`,
    );
    return { ok: true, providerMessageId: `console-${Date.now()}`, skipped: true };
  }
}

export class ResendEmailProvider implements EmailProvider {
  readonly name = 'resend';

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<EmailSendResult> {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
          ...(message.replyTo ? { reply_to: message.replyTo } : {}),
          tags: Object.entries(message.tags ?? {}).map(([name, value]) => ({ name, value })),
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        return { ok: false, error: `Resend ${response.status}: ${body.slice(0, 200)}` };
      }
      const data = (await response.json()) as { id?: string };
      return { ok: true, providerMessageId: data.id };
    } catch (cause) {
      return { ok: false, error: cause instanceof Error ? cause.message : 'Envoi impossible.' };
    }
  }
}

export class PostmarkEmailProvider implements EmailProvider {
  readonly name = 'postmark';

  constructor(
    private readonly serverToken: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<EmailSendResult> {
    try {
      const response = await fetch('https://api.postmarkapp.com/email', {
        method: 'POST',
        headers: {
          'X-Postmark-Server-Token': this.serverToken,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          From: this.from,
          To: message.to,
          Subject: message.subject,
          HtmlBody: message.html,
          TextBody: message.text,
          MessageStream: 'outbound',
          ...(message.replyTo ? { ReplyTo: message.replyTo } : {}),
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        return { ok: false, error: `Postmark ${response.status}: ${body.slice(0, 200)}` };
      }
      const data = (await response.json()) as { MessageID?: string };
      return { ok: true, providerMessageId: data.MessageID };
    } catch (cause) {
      return { ok: false, error: cause instanceof Error ? cause.message : 'Envoi impossible.' };
    }
  }
}

let cached: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (cached) return cached;
  const provider = readEnv('EMAIL_PROVIDER') ?? 'console';
  const apiKey = readEnv('EMAIL_API_KEY');
  const from = readEnv('EMAIL_FROM') ?? 'StaX <bonjour@localhost>';

  if (provider === 'resend' && apiKey) {
    cached = new ResendEmailProvider(apiKey, from);
  } else if (provider === 'postmark' && apiKey) {
    cached = new PostmarkEmailProvider(apiKey, from);
  } else {
    cached = new ConsoleEmailProvider();
  }
  return cached;
}

export function resetEmailProvider(): void {
  cached = null;
}
