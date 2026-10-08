import { permanentRedirect } from 'next/navigation';

/**
 * Ancienne page « Récupérer mon site » (propositions payées par carte). L'accès
 * à un site se fait désormais avec le code personnel reçu après le virement.
 */
export default function ClaimSitePage(): never {
  permanentRedirect('/acces');
}
