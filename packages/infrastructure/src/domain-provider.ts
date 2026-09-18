import { hasCapability, readEnv, sitesDomain } from '@stax/config';

/**
 * Fournisseur de domaines.
 *
 * Rattacher le domaine d'un client a son site est une operation d'infrastructure.
 * Elle est isolee derriere cette interface pour trois raisons :
 *
 *  1. la plateforme doit fonctionner SANS fournisseur configure — en
 *     developpement, en test, et le jour ou une cle expire. Le fournisseur par
 *     defaut dit alors honnetement « je ne peux pas », au lieu de faire croire
 *     qu'un domaine est actif ;
 *  2. changer de fournisseur ne doit toucher qu'un fichier ;
 *  3. les consignes DNS montrees au client sont produites au meme endroit que
 *     l'appel qui les rend vraies : elles ne peuvent pas diverger.
 *
 * Aucun secret d'API n'atteint jamais le navigateur : ce module est appele
 * depuis des actions serveur et des taches de fond.
 */

export type DomainStatus =
  | 'pending'
  | 'verifying'
  | 'active'
  | 'failed'
  | 'unsupported';

export interface DnsInstruction {
  /** `TXT` pour la preuve de propriete, `CNAME` pour l'acheminement. */
  type: 'TXT' | 'CNAME' | 'A';
  /** Nom de l'enregistrement, tel qu'il doit etre saisi chez le registrar. */
  name: string;
  value: string;
  /** Explication en francais courant, affichee au client. */
  purpose: string;
}

export interface DomainAttachment {
  status: DomainStatus;
  /** Identifiant chez le fournisseur, conserve pour les operations suivantes. */
  externalId: string | null;
  instructions: DnsInstruction[];
  /** Message exploitable par un humain quand le rattachement echoue. */
  message: string | null;
}

export interface DomainProvider {
  readonly id: string;
  readonly available: boolean;
  /** Demande le rattachement d'un nom d'hote au reseau de la plateforme. */
  attach(hostname: string, verificationToken: string): Promise<DomainAttachment>;
  /** Etat courant, pour la verification periodique. */
  check(hostname: string, externalId: string | null): Promise<DomainAttachment>;
  /** Detache un nom d'hote. Doit rester idempotent. */
  detach(externalId: string | null): Promise<void>;
  /** Consignes DNS, meme quand le fournisseur est indisponible. */
  instructions(hostname: string, verificationToken: string): DnsInstruction[];
}

/** Cible CNAME vers laquelle pointer un domaine personnalise. */
export function routingTarget(): string {
  return readEnv('CLOUDFLARE_SAAS_FALLBACK_ORIGIN') ?? `sites.${sitesDomain()}`;
}

function baseInstructions(hostname: string, verificationToken: string): DnsInstruction[] {
  // Un domaine « nu » (exemple.fr) ne peut pas porter un CNAME au sens strict
  // du DNS. La plupart des registrars proposent l'equivalent sous le nom
  // ALIAS, ANAME ou « CNAME aplati » : on le dit, plutot que de donner une
  // adresse IP qui changera un jour sans prevenir le client.
  const isApex = hostname.split('.').length === 2;

  return [
    {
      type: 'TXT',
      name: `_stax-verification.${hostname}`,
      value: verificationToken,
      purpose:
        'Prouve que ce domaine vous appartient. Sans cette preuve, personne ne peut rattacher votre domaine à un autre site.',
    },
    {
      type: 'CNAME',
      name: hostname,
      value: routingTarget(),
      purpose: isApex
        ? 'Dirige les visiteurs vers votre site. Sur un domaine sans préfixe, choisissez le type ALIAS, ANAME ou « CNAME aplati » si votre hébergeur DNS le propose — sinon nous le mettons en place pour vous.'
        : 'Dirige les visiteurs de votre domaine vers votre site.',
    },
  ];
}

/**
 * Fournisseur par defaut : aucun.
 *
 * Il produit les consignes DNS — qui sont vraies et utiles — mais refuse de
 * declarer un domaine actif. C'est volontaire : afficher « domaine en ligne »
 * sans l'avoir verifie serait un mensonge, et le client le decouvrirait en
 * ouvrant son site.
 */
class UnconfiguredDomainProvider implements DomainProvider {
  readonly id = 'unconfigured';
  readonly available = false;

  instructions(hostname: string, verificationToken: string): DnsInstruction[] {
    return baseInstructions(hostname, verificationToken);
  }

  async attach(hostname: string, verificationToken: string): Promise<DomainAttachment> {
    return {
      status: 'pending',
      externalId: null,
      instructions: this.instructions(hostname, verificationToken),
      message:
        'Votre demande est enregistrée. Notre équipe finalise le rattachement technique et vous prévient dès que votre domaine est actif.',
    };
  }

  async check(_hostname: string, _externalId: string | null): Promise<DomainAttachment> {
    return {
      status: 'pending',
      externalId: null,
      instructions: [],
      message: null,
    };
  }

  async detach(_externalId: string | null): Promise<void> {
    // Rien a defaire : aucun rattachement n'a ete cree.
  }
}

interface CloudflareHostnameResponse {
  success?: boolean;
  errors?: Array<{ message?: string }>;
  result?: {
    id?: string;
    status?: string;
    ssl?: { status?: string };
    verification_errors?: string[];
  };
}

/**
 * Cloudflare for SaaS.
 *
 * Un « custom hostname » par domaine client, tous servis par le meme Worker.
 * C'est ce qui permet a mille sites de vivre sur un seul deploiement.
 */
class CloudflareDomainProvider implements DomainProvider {
  readonly id = 'cloudflare';
  readonly available = true;

  constructor(
    private readonly apiToken: string,
    private readonly zoneId: string,
  ) {}

  instructions(hostname: string, verificationToken: string): DnsInstruction[] {
    return baseInstructions(hostname, verificationToken);
  }

  private async call(
    path: string,
    init: RequestInit,
  ): Promise<{ ok: boolean; body: CloudflareHostnameResponse }> {
    const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.apiToken}`,
        'content-type': 'application/json',
        ...(init.headers ?? {}),
      },
    });

    const body = (await response.json().catch(() => ({}))) as CloudflareHostnameResponse;
    return { ok: response.ok && body.success !== false, body };
  }

  private toStatus(body: CloudflareHostnameResponse): DomainStatus {
    const status = body.result?.status;
    const ssl = body.result?.ssl?.status;
    if (status === 'active' && ssl === 'active') return 'active';
    if (status === 'blocked' || status === 'moved' || status === 'deleted') return 'failed';
    if (status === 'pending' || ssl === 'pending_validation') return 'verifying';
    return 'pending';
  }

  async attach(hostname: string, verificationToken: string): Promise<DomainAttachment> {
    const { ok, body } = await this.call(`/zones/${this.zoneId}/custom_hostnames`, {
      method: 'POST',
      body: JSON.stringify({
        hostname,
        ssl: { method: 'http', type: 'dv', settings: { min_tls_version: '1.2' } },
      }),
    });

    if (!ok) {
      return {
        status: 'failed',
        externalId: null,
        instructions: this.instructions(hostname, verificationToken),
        message:
          body.errors?.[0]?.message ??
          'Le rattachement a été refusé. Vérifiez que ce domaine n’est pas déjà utilisé ailleurs.',
      };
    }

    return {
      status: this.toStatus(body),
      externalId: body.result?.id ?? null,
      instructions: this.instructions(hostname, verificationToken),
      message: null,
    };
  }

  async check(_hostname: string, externalId: string | null): Promise<DomainAttachment> {
    if (!externalId) {
      return { status: 'pending', externalId: null, instructions: [], message: null };
    }

    const { ok, body } = await this.call(
      `/zones/${this.zoneId}/custom_hostnames/${externalId}`,
      { method: 'GET' },
    );

    if (!ok) {
      return {
        status: 'failed',
        externalId,
        instructions: [],
        message: body.errors?.[0]?.message ?? null,
      };
    }

    const verificationErrors = body.result?.verification_errors ?? [];

    return {
      status: this.toStatus(body),
      externalId,
      instructions: [],
      message: verificationErrors[0] ?? null,
    };
  }

  async detach(externalId: string | null): Promise<void> {
    if (!externalId) return;
    await this.call(`/zones/${this.zoneId}/custom_hostnames/${externalId}`, { method: 'DELETE' });
  }
}

let cached: DomainProvider | null = null;

export function domainProvider(): DomainProvider {
  if (cached) return cached;

  if (hasCapability('cloudflare_domains')) {
    const token = readEnv('CLOUDFLARE_API_TOKEN');
    const zone = readEnv('CLOUDFLARE_ZONE_ID');
    if (token && zone) {
      cached = new CloudflareDomainProvider(token, zone);
      return cached;
    }
  }

  cached = new UnconfiguredDomainProvider();
  return cached;
}

/** Test helper : force la relecture de la configuration. */
export function resetDomainProvider(): void {
  cached = null;
}
