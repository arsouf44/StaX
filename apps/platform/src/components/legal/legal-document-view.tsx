import type { ReactNode } from 'react';
import Link from 'next/link';
import { deployEnvironment, legalStatus, LEGAL_FIELDS } from '@stax/config';
import { Alert, Container, Panel, Section } from '@stax/ui';
import { LEGAL_ORDER, LEGAL_BUILDERS, type LegalBlock, type LegalDocument } from '~/content/legal';

/**
 * Rendu d'un document legal.
 *
 * Deux garde-fous s'affichent ici, et nulle part ailleurs :
 *  - le marqueur LEGAL_REVIEW_REQUIRED, tant que le deploiement n'est pas une
 *    production ouverte commercialement ;
 *  - l'avertissement de configuration incomplete, des qu'une information
 *    d'identite obligatoire manque. Dans ce cas la page affiche un marqueur
 *    explicite plutot qu'une valeur plausible : aucun SIREN, aucune adresse et
 *    aucun nom de directeur de publication n'est invente.
 */

function formatDate(iso: string): string {
  // Date fixe du document, pas une date de rendu : le formatage est
  // deterministe et identique sur le serveur et dans le navigateur.
  const [year, month, day] = iso.split('-');
  const months = [
    'janvier',
    'février',
    'mars',
    'avril',
    'mai',
    'juin',
    'juillet',
    'août',
    'septembre',
    'octobre',
    'novembre',
    'décembre',
  ] as const;
  const index = Number.parseInt(month ?? '', 10) - 1;
  const label = months[index];
  if (!year || !day || !label) return iso;
  return `${Number.parseInt(day, 10)} ${label} ${year}`;
}

function BlockView({ block }: { block: LegalBlock }) {
  if (block.kind === 'paragraph') {
    return (
      <p className="text-[0.9375rem] leading-[1.75] text-[var(--foreground-muted)]">{block.text}</p>
    );
  }

  if (block.kind === 'list') {
    return (
      <ul className="space-y-2.5">
        {(block.items ?? []).map((item) => (
          <li
            key={item}
            className="relative pl-5 text-[0.9375rem] leading-[1.75] text-[var(--foreground-muted)]"
          >
            <span
              aria-hidden="true"
              className="absolute top-[0.7em] left-0 size-1.5 rounded-full bg-[var(--border-strong)]"
            />
            {item}
          </li>
        ))}
      </ul>
    );
  }

  if (block.kind === 'definitions') {
    return (
      <dl className="divide-y divide-[var(--border)] overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)]">
        {(block.definitions ?? []).map((definition) => (
          <div key={definition.term} className="grid gap-1.5 p-4 sm:grid-cols-[14rem_1fr] sm:gap-6">
            <dt className="text-sm font-medium">{definition.term}</dt>
            <dd className="text-sm leading-relaxed text-[var(--foreground-muted)]">
              {definition.description}
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  return (
    <Panel level="inset" padding="sm" className="text-sm leading-relaxed text-[var(--muted)]">
      {block.text}
    </Panel>
  );
}

export interface LegalDocumentViewProps {
  document: LegalDocument;
  /** Contenu insere entre l'introduction et les articles (tableau, liste dynamique). */
  lead?: ReactNode;
}

export function LegalDocumentView({ document, lead }: LegalDocumentViewProps) {
  const status = legalStatus();
  const isProduction = deployEnvironment() === 'production';
  const showReviewNotice = !isProduction || !status.configured;
  const missingLabels = status.missingRequired.map(
    (key) => LEGAL_FIELDS.find((field) => field.key === key)?.label ?? key,
  );

  return (
    <Section spacing="compact">
      <Container size="wide">
        <div className="grid gap-12 lg:grid-cols-[1fr_17rem] lg:gap-16">
          <div className="max-w-3xl min-w-0">
            <p className="text-2xs font-medium tracking-[0.14em] text-[var(--muted)] uppercase">
              Informations légales
            </p>
            <h1 className="mt-4 text-3xl font-medium tracking-[-0.03em] text-balance sm:text-4xl">
              {document.title}
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-pretty text-[var(--foreground-muted)]">
              {document.description}
            </p>

            <p className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
              <span>Dernière mise à jour : {formatDate(document.updatedAt)}</span>
              {document.version ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>Version {document.version}</span>
                </>
              ) : null}
            </p>

            {showReviewNotice ? (
              <Alert
                tone="warning"
                className="mt-8"
                title="Modèle en attente de validation juridique"
                live="status"
              >
                Ce texte est un modèle fourni avec la plateforme. Il doit être relu et validé par un
                professionnel du droit avant toute ouverture commerciale. Il ne remplace ni ne
                restreint les protections d’ordre public du droit français et européen de la
                consommation.
              </Alert>
            ) : null}

            {!status.configured ? (
              <Alert
                tone="danger"
                className="mt-4"
                title="Identité de l’éditeur non configurée"
                live="status"
              >
                Les informations suivantes ne sont pas renseignées et apparaissent ci-dessous sous
                forme de marqueurs explicites plutôt que de valeurs inventées :{' '}
                {missingLabels.join(', ')}. Renseignez-les dans les secrets de déploiement
                (voir&nbsp;
                <code className="rounded bg-[var(--background-inset)] px-1 py-0.5 text-2xs">
                  docs/legal-configuration.md
                </code>
                ).
              </Alert>
            ) : null}

            {document.intro ? (
              <p className="mt-8 border-l-2 border-[var(--border-strong)] pl-5 text-[0.9375rem] leading-[1.75] text-[var(--foreground-muted)]">
                {document.intro}
              </p>
            ) : null}

            {lead ? <div className="mt-10">{lead}</div> : null}

            <div className="mt-12 space-y-12">
              {document.articles.map((article) => (
                <article key={article.id} id={article.id} className="scroll-mt-28">
                  <h2 className="text-lg font-medium tracking-[-0.01em]">{article.title}</h2>
                  <div className="mt-4 space-y-4">
                    {article.blocks.map((block, index) => (
                      <BlockView key={index} block={block} />
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <nav aria-label="Sommaire du document">
              <p className="text-2xs font-medium tracking-[0.14em] text-[var(--muted)] uppercase">
                Sommaire
              </p>
              <ol className="mt-3 space-y-1.5 border-l border-[var(--border)] pl-4">
                {document.articles.map((article) => (
                  <li key={article.id}>
                    <a
                      href={`#${article.id}`}
                      className="block text-xs leading-relaxed text-[var(--foreground-muted)] transition-colors hover:text-[var(--foreground)]"
                    >
                      {article.title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>

            <nav aria-label="Autres documents légaux" className="mt-10">
              <p className="text-2xs font-medium tracking-[0.14em] text-[var(--muted)] uppercase">
                Autres documents
              </p>
              <ul className="mt-3 space-y-1.5">
                {LEGAL_ORDER.filter((slug) => slug !== document.slug).map((slug) => (
                  <li key={slug}>
                    <Link
                      href={`/${slug}`}
                      className="block text-xs leading-relaxed text-[var(--foreground-muted)] transition-colors hover:text-[var(--foreground)]"
                    >
                      {LEGAL_BUILDERS[slug]().title}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>
        </div>
      </Container>
    </Section>
  );
}
