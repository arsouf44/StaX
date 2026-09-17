'use client';

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';

/**
 * Widget Turnstile.
 *
 * N est rendu que si une cle publique est configuree : sans elle, le champ
 * disparait et la verification cote serveur passe en mode « non configure »
 * plutot que de bloquer tout le monde.
 *
 * Le jeton est depose dans un champ cache, donc transmis par la soumission
 * normale du formulaire — le mecanisme fonctionne avec les actions serveur
 * comme avec un envoi classique.
 */
export function TurnstileField({ siteKey }: { siteKey: string | null }) {
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!siteKey || !ready) return;
    const element = container.current;
    if (!element || element.childElementCount > 0) return;

    const api = (globalThis as { turnstile?: { render: (el: Element, options: unknown) => void } })
      .turnstile;
    if (!api) return;

    api.render(element, {
      sitekey: siteKey,
      theme: 'auto',
      action: 'stax-form',
      'response-field-name': 'turnstileToken',
    });
  }, [siteKey, ready]);

  if (!siteKey) return null;

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="lazyOnload"
        onReady={() => setReady(true)}
      />
      <div ref={container} className="min-h-[65px]" />
      <noscript>
        <p className="text-xs text-[var(--muted)]">
          La vérification anti-robot nécessite JavaScript. Écrivez-nous si vous ne pouvez pas
          l’activer.
        </p>
      </noscript>
    </>
  );
}
