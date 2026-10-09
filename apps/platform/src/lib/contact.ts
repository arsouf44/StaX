import { isLegalValueConfigured, legalValue } from '@nemasus/config';
import { internationalPhone } from '~/lib/phone';

export interface SupportContact {
  email: string;
  /** Numéro tel qu'il s'affiche (« 07 82 09 37 51 »), ou null s'il n'est pas configuré. */
  phone: string | null;
  /** Lien `tel:` au format international, ou null. */
  phoneHref: string | null;
}

/**
 * Coordonnées de l'équipe, telles que les publient les mentions légales :
 * une seule source pour l'accueil, les réalisations, le parcours de commande
 * et la barre d'action mobile.
 */
export function supportContact(): SupportContact {
  const phone = isLegalValueConfigured('SUPPORT_PHONE') ? legalValue('SUPPORT_PHONE') : null;
  return {
    email: legalValue('SUPPORT_EMAIL'),
    phone,
    phoneHref: phone ? `tel:${internationalPhone(phone)}` : null,
  };
}
