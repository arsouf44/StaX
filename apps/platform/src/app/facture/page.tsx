import { permanentRedirect } from 'next/navigation';

/** Ancienne page « Rattacher ma facture » : l'accès se fait par code personnel. */
export default function InvoicePage(): never {
  permanentRedirect('/acces');
}
