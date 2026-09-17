import type { Metadata } from 'next';
import { Alert, EmptyState, Table, TableWrapper, TBody, TD, TH, THead, TR } from '@stax/ui';
import { LegalDocumentView } from '~/components/legal/legal-document-view';
import { getLegalDocument } from '~/content/legal';
import { getSubprocessors } from '~/lib/catalog';

/**
 * La liste provient de la base, jamais d'un fichier de contenu : une page
 * prerendue afficherait l'etat du jour de la compilation, ce qui est
 * exactement le piege que cette page doit eviter.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const document = getLegalDocument('sous-traitants');
  return {
    title: document.title,
    description: document.description,
    alternates: { canonical: '/sous-traitants' },
    robots: { index: true, follow: true },
  };
}

const CATEGORY_LABELS: Record<string, string> = {
  infrastructure: 'Infrastructure',
  paiement: 'Paiement',
  email: 'E-mail',
  analytics: 'Mesure d’audience',
  support: 'Support',
};

export default async function SubprocessorsPage() {
  const subprocessors = await getSubprocessors();

  return (
    <LegalDocumentView
      document={getLegalDocument('sous-traitants')}
      lead={
        subprocessors === null ? (
          <Alert tone="warning" title="Liste momentanément indisponible" live="status">
            La liste des sous-traitants n’a pas pu être consultée. Ce n’est pas une absence de
            sous-traitants : réessayez dans quelques instants, ou écrivez-nous pour en obtenir une
            copie.
          </Alert>
        ) : subprocessors.length === 0 ? (
          <EmptyState
            title="Aucun sous-traitant publié"
            description="Aucune entrée n’est actuellement enregistrée dans le registre."
          />
        ) : (
          <TableWrapper label="Sous-traitants de StaX">
            <Table>
              <caption className="sr-only">
                Prestataires techniques traitant des données pour le compte de StaX, avec leur
                finalité, la localisation des données et les garanties de transfert applicables.
              </caption>
              <THead>
                <TR>
                  <TH scope="col">Prestataire</TH>
                  <TH scope="col">Finalité</TH>
                  <TH scope="col">Localisation des données</TH>
                  <TH scope="col">Garanties de transfert</TH>
                </TR>
              </THead>
              <TBody>
                {subprocessors.map((entry) => (
                  <TR key={entry.name}>
                    <TD>
                      <span className="font-medium">{entry.name}</span>
                      <span className="mt-1 block text-2xs tracking-[0.1em] text-[var(--muted)] uppercase">
                        {CATEGORY_LABELS[entry.category] ?? entry.category}
                      </span>
                      {entry.privacyUrl ? (
                        <a
                          href={entry.privacyUrl}
                          rel="noopener noreferrer nofollow"
                          target="_blank"
                          className="mt-1 block text-xs text-[var(--foreground-muted)] underline underline-offset-2 hover:text-[var(--foreground)]"
                        >
                          Politique de confidentialité
                        </a>
                      ) : null}
                    </TD>
                    <TD className="text-[var(--foreground-muted)]">{entry.purpose}</TD>
                    <TD className="text-[var(--foreground-muted)]">{entry.location}</TD>
                    <TD className="text-[var(--foreground-muted)]">
                      {entry.transferSafeguards ?? 'Données conservées dans l’Union européenne'}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrapper>
        )
      }
    />
  );
}
