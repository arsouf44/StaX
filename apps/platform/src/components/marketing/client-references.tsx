import Link from 'next/link';
import { CLIENT_REFERENCES } from '~/content/references';

/**
 * Témoignages clients.
 *
 * Ne rend RIEN tant qu'aucune référence réelle n'existe : voir
 * `~/content/references`. C'est la raison d'être de ce composant — la section
 * est prête, et elle apparaîtra le jour où un client aura donné son accord,
 * sans qu'il faille retoucher une page.
 *
 * Volontairement sans balisage `Review` ni `AggregateRating` : une note que
 * l'entreprise se décerne à elle-même n'est pas éligible aux résultats
 * enrichis de Google, et la publier expose à une pénalité. Les témoignages
 * sont donc cités comme du texte, attribués, vérifiables.
 */
export function ClientReferences({ className }: { className?: string }) {
  if (CLIENT_REFERENCES.length === 0) return null;

  return (
    <div className={className}>
      <h2 className="font-serif text-[clamp(1.5rem,2.4vw,2rem)] leading-snug text-[var(--ink)]">
        Ce qu’en disent nos clients
      </h2>
      <ul className="mt-9 grid gap-x-12 gap-y-10 md:grid-cols-2">
        {CLIENT_REFERENCES.map((reference) => (
          <li key={reference.name} className="border-t border-[var(--border)] pt-6">
            <blockquote className="max-w-[46ch] text-[15.5px] leading-relaxed text-[var(--ink)]">
              « {reference.quote} »
            </blockquote>
            <p className="mt-4 text-[13.5px] text-[var(--ink-2)]">
              {reference.author} — {reference.name}
            </p>
            <p className="mt-1 text-[13px] text-[var(--muted)]">
              {reference.activity}
              {reference.url ? (
                <>
                  {' · '}
                  <Link
                    href={reference.url}
                    className="underline underline-offset-4"
                    target="_blank"
                    rel="noopener"
                  >
                    Voir le site
                  </Link>
                </>
              ) : null}
            </p>
            {reference.highlight ? (
              <p className="mt-3 max-w-[46ch] text-[13.5px] leading-relaxed text-[var(--ink-2)]">
                {reference.highlight}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
