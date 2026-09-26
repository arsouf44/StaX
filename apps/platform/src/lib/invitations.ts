import 'server-only';
import { hmacHex } from '@stax/security';

/**
 * Empreinte du jeton d'invitation, telle qu'elle est stockée en base
 * (`organization_invitations.token_hash`, écrite par « Collaborateurs »).
 * Module privé : exportée d'un fichier `'use server'`, elle deviendrait une
 * action appelable depuis n'importe quel navigateur.
 */
export async function invitationTokenHash(token: string): Promise<string> {
  return hmacHex(token, 'organization-invitation');
}
