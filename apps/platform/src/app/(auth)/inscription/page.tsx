import { permanentRedirect } from 'next/navigation';

/**
 * Plus d'inscription libre : le compte d'un client s'ouvre avec le code
 * d'accès personnel reçu après son paiement, celui d'un collaborateur avec
 * son lien d'invitation. Un ancien lien « Créer un compte » mène à l'accès.
 */
export default function SignUpPage(): never {
  permanentRedirect('/acces');
}
