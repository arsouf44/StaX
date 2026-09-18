import type { Metadata } from 'next';
import { legalValue } from '@stax/config';
import { ButtonLink, Container, Logo, Panel } from '@stax/ui';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Compte désactivé',
  robots: { index: false, follow: false },
};

/**
 * Compte desactive.
 *
 * On dit ce qui est vrai — l acces est ferme — sans laisser croire que les
 * donnees sont perdues, et on donne une voie de recours reelle.
 */
export default function DisabledAccountPage() {
  const support = legalValue('SUPPORT_EMAIL');

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="py-8">
        <Container size="default">
          <Logo />
        </Container>
      </header>

      <main id="contenu-principal" className="flex flex-1 items-center">
        <Container size="default">
          <div className="max-w-xl">
            <h1 className="text-3xl font-medium tracking-[-0.03em]">Ce compte est désactivé</h1>
            <p className="mt-4 leading-relaxed text-[var(--foreground-muted)]">
              L’accès à votre espace est suspendu. Cela arrive après une demande de votre part, ou à
              la suite d’un manquement signalé.
            </p>

            <Panel level={1} padding="lg" className="mt-8">
              <h2 className="text-sm font-medium">Vos données ne sont pas supprimées</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
                Vos contenus, vos messages et vos contacts sont conservés. Si le compte est
                réactivé, vous les retrouverez tels quels. Si vous souhaitez les récupérer,
                écrivez-nous : nous vous transmettrons un export.
              </p>
            </Panel>

            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href={`mailto:${support}`}>Nous écrire</ButtonLink>
              <ButtonLink href="/" variant="secondary">
                Retour à l’accueil
              </ButtonLink>
            </div>

            <p className="mt-8 text-sm text-[var(--muted)]">
              Si vous pensez qu’il s’agit d’une erreur, dites-le-nous : nous réexaminons chaque
              demande.
            </p>
          </div>
        </Container>
      </main>
    </div>
  );
}
