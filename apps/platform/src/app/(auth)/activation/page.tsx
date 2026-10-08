import { permanentRedirect } from 'next/navigation';

/** Ancienne page d'activation : l'accès par code se fait désormais sur `/acces`. */
export default async function ActivationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<never> {
  const params = await searchParams;
  const code = typeof params.code === 'string' ? params.code.slice(0, 40) : '';
  permanentRedirect(code ? `/acces?code=${encodeURIComponent(code)}` : '/acces');
}
