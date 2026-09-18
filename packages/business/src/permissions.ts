import type { OrgCapability, OrgRole } from '@stax/types';

/**
 * Matrice RBAC — miroir EXACT de app.org_can() en PostgreSQL.
 *
 * La base reste l'autorite : meme si cette table divergeait, la RLS refuserait
 * l'operation. Elle sert a construire une interface coherente et a donner un
 * message clair avant que la base ne rejette la requete. Un test compare les
 * deux definitions pour garantir qu'elles ne divergent jamais.
 */
export const ROLE_CAPABILITIES: Readonly<Record<OrgRole, readonly OrgCapability[]>> = {
  owner: [
    'org.view',
    'org.manage',
    'org.delete',
    'members.manage',
    'content.view',
    'content.edit',
    'content.publish',
    'inbox.view',
    'inbox.manage',
    'commerce.view',
    'commerce.manage',
    'billing.view',
    'billing.manage',
    'analytics.view',
    'domain.manage',
    'media.manage',
    'payments.connect',
    'data.export',
    'support.manage',
  ],
  admin: [
    'org.view',
    'org.manage',
    'members.manage',
    'content.view',
    'content.edit',
    'content.publish',
    'inbox.view',
    'inbox.manage',
    'commerce.view',
    'commerce.manage',
    'billing.view',
    'analytics.view',
    'domain.manage',
    'media.manage',
    'data.export',
    'support.manage',
  ],
  editor: [
    'org.view',
    'content.view',
    'content.edit',
    'content.publish',
    'inbox.view',
    'inbox.manage',
    'commerce.view',
    'commerce.manage',
    'analytics.view',
    'media.manage',
    'support.manage',
  ],
  billing: ['org.view', 'billing.view', 'billing.manage', 'analytics.view', 'data.export'],
  viewer: ['org.view', 'content.view', 'inbox.view', 'commerce.view', 'analytics.view'],
};

export function roleCan(role: OrgRole | null | undefined, capability: OrgCapability): boolean {
  if (!role) return false;
  return ROLE_CAPABILITIES[role].includes(capability);
}

export const ROLE_LABELS: Record<OrgRole, string> = {
  owner: 'Propriétaire',
  admin: 'Administrateur',
  editor: 'Éditeur',
  billing: 'Facturation',
  viewer: 'Lecture seule',
};

export const ROLE_DESCRIPTIONS: Record<OrgRole, string> = {
  owner: 'Contrôle total : contenu, équipe, facturation, domaine et suppression de l’organisation.',
  admin: 'Gère le site, l’équipe et le domaine. Consulte la facturation sans pouvoir la modifier.',
  editor:
    'Modifie et publie le contenu, traite les messages et les commandes. Aucun accès à la facturation.',
  billing: 'Accès à la facturation, aux factures et au moyen de paiement. Aucun accès au contenu.',
  viewer: 'Consultation uniquement. Ne peut rien modifier.',
};

/** Roles qu'un membre donne peut attribuer a un autre. */
export function assignableRoles(actorRole: OrgRole): OrgRole[] {
  if (actorRole === 'owner') return ['owner', 'admin', 'editor', 'billing', 'viewer'];
  if (actorRole === 'admin') return ['editor', 'billing', 'viewer'];
  return [];
}
