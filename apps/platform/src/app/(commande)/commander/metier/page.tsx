import { permanentRedirect } from 'next/navigation';

/** Ancienne deuxième étape : le métier est désormais la première. */
export default function LegacyBusinessStep(): never {
  permanentRedirect('/commander');
}
