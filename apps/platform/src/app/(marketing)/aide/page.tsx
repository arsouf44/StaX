import type { Metadata } from 'next';
import Link from 'next/link';
import { ButtonLink, Container, Panel, Section, SectionHeading } from '@nemasus/ui';
import { breadcrumbJsonLd, JsonLd } from '~/lib/structured-data';

export const metadata: Metadata = {
  title: 'Centre d’aide',
  description:
    'Guides de l’espace Nemasus : accéder avec votre code, choisir votre mot de passe, ' +
    'modifier et publier votre site, connecter un domaine, gérer vos messages.',
  alternates: { canonical: '/aide' },
};

interface Guide {
  id: string;
  title: string;
  steps: readonly string[];
  link?: { href: string; label: string };
}

/**
 * Guides courts, chacun décrivant ce que fait réellement l'espace client.
 * Aucun guide annoncé « à venir » : ce qui est écrit ici fonctionne.
 */
const GUIDES: ReadonlyArray<{ topic: string; guides: readonly Guide[] }> = [
  {
    topic: 'Accès et compte',
    guides: [
      {
        id: 'code-acces',
        title: 'Accéder à mon espace avec mon code',
        steps: [
          'Ouvrez l’e-mail « Votre code d’accès Nemasus » reçu après votre virement.',
          'Cliquez sur « Accéder à mon espace » : le code est prérempli. Vous pouvez aussi le saisir sur la page Accès client (tirets facultatifs).',
          'Cliquez sur « Accéder à mon site », puis choisissez votre mot de passe pour vos prochaines connexions.',
        ],
        link: { href: '/acces', label: 'Page Accès client' },
      },
      {
        id: 'mot-de-passe',
        title: 'Retrouver l’accès si j’ai oublié mon mot de passe',
        steps: [
          'Sur la page de connexion, cliquez sur « Mot de passe oublié ? » et indiquez votre adresse e-mail.',
          'Ouvrez le lien reçu : il est valable une heure et ne sert qu’une fois.',
          'Choisissez un nouveau mot de passe (12 caractères au moins). Vos autres sessions sont fermées.',
        ],
        link: { href: '/mot-de-passe-oublie', label: 'Mot de passe oublié' },
      },
      {
        id: 'collaborateurs',
        title: 'Inviter un collaborateur',
        steps: [
          'Dans votre espace, ouvrez « Collaborateurs » et indiquez son adresse e-mail et son rôle.',
          'Il reçoit un lien d’invitation valable 7 jours et crée son compte avec cette adresse.',
          'Vous pouvez retirer un accès à tout moment depuis la même page.',
        ],
      },
    ],
  },
  {
    topic: 'Votre site',
    guides: [
      {
        id: 'modifier',
        title: 'Modifier un texte ou une photo',
        steps: [
          'Une fois votre site livré, ouvrez « Modifier mon site ».',
          'Choisissez la zone à modifier : seuls les contenus prévus pour être modifiés sont proposés.',
          'Vos changements sont enregistrés en brouillon : vérifiez-les dans l’aperçu de votre vrai site.',
        ],
      },
      {
        id: 'publier',
        title: 'Publier, et revenir en arrière',
        steps: [
          'Cliquez sur « Publier » : vos modifications sont enregistrées dans le code de votre site puis déployées.',
          '« Publié » ne s’affiche qu’une fois le déploiement confirmé ; en cas d’échec, la version précédente reste en ligne.',
          'Dans « Versions », chaque publication est datée et peut être restaurée.',
        ],
      },
      {
        id: 'domaine',
        title: 'Connecter mon nom de domaine',
        steps: [
          'Ouvrez « Nom de domaine » dans votre espace et indiquez le domaine que vous possédez.',
          'Ajoutez chez votre registraire les enregistrements DNS affichés.',
          'L’état du domaine et du certificat HTTPS se met à jour automatiquement. Un souci ? Écrivez-nous.',
        ],
      },
    ],
  },
  {
    topic: 'Votre activité',
    guides: [
      {
        id: 'messages',
        title: 'Traiter les messages de mes visiteurs',
        steps: [
          'Les messages envoyés depuis les formulaires de votre site arrivent dans « Messages ».',
          'Vous êtes prévenu par e-mail à chaque nouveau message.',
          'Un message classé en indésirable reste consultable : rien n’est supprimé sans vous.',
        ],
      },
      {
        id: 'reservations',
        title: 'Gérer mes réservations',
        steps: [
          'Si votre site propose la réservation, les demandes arrivent dans « Réservations ».',
          'Confirmez ou refusez chaque demande ; votre client en est informé.',
          'Déclarez vos fermetures exceptionnelles dans vos disponibilités.',
        ],
      },
      {
        id: 'paiements',
        title: 'Encaisser des paiements sur mon site',
        steps: [
          'Si votre site encaisse (boutique, acomptes), ouvrez « Paiements » et connectez votre compte Stripe, à votre nom.',
          'Les sommes vont directement sur votre compte : Nemasus ne prend aucune commission.',
        ],
      },
    ],
  },
];

export default function HelpPage() {
  return (
    <>
      <JsonLd
        graph={[
          breadcrumbJsonLd([
            { name: 'Accueil', path: '/' },
            { name: 'Centre d’aide', path: '/aide' },
          ]),
        ]}
      />
      <Section className="relative overflow-hidden">
        <Container size="wide">
          <SectionHeading
            as="h1"
            eyebrow="Centre d’aide"
            title="Comment pouvons-nous vous aider ?"
            description="Les gestes essentiels de votre espace Nemasus, en quelques étapes. Pour tout le reste, écrivez-nous depuis votre espace : nous avons le contexte de votre site sous les yeux."
          />
          <nav aria-label="Sommaire du centre d’aide" className="mt-10">
            <ul className="flex flex-wrap gap-2">
              {GUIDES.flatMap((group) => group.guides).map((guide) => (
                <li key={guide.id}>
                  <a
                    href={`#${guide.id}`}
                    className="inline-flex rounded-full border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--foreground-muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--foreground)]"
                  >
                    {guide.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </Container>
      </Section>

      {GUIDES.map((group) => (
        <Section key={group.topic} spacing="compact" className="pt-0">
          <Container size="wide">
            <h2 className="font-serif text-[1.85rem] leading-tight font-normal">{group.topic}</h2>
            <div className="mt-6 grid gap-3 lg:grid-cols-3">
              {group.guides.map((guide) => (
                <Panel
                  key={guide.id}
                  id={guide.id}
                  level={1}
                  padding="lg"
                  className="h-full scroll-mt-28"
                >
                  <h3 className="text-base font-medium">{guide.title}</h3>
                  <ol className="mt-4 space-y-2.5 text-sm leading-relaxed text-[var(--foreground-muted)]">
                    {guide.steps.map((step, index) => (
                      <li key={step} className="flex gap-2.5">
                        <span
                          aria-hidden="true"
                          className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-[var(--border)] text-2xs font-medium text-[var(--foreground)]"
                        >
                          {index + 1}
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                  {guide.link ? (
                    <Link
                      href={guide.link.href}
                      className="mt-4 inline-block text-sm underline underline-offset-4"
                    >
                      {guide.link.label}
                    </Link>
                  ) : null}
                </Panel>
              ))}
            </div>
          </Container>
        </Section>
      ))}

      <Section spacing="compact" className="border-t border-[var(--border)]">
        <Container size="narrow">
          <Panel level={2} padding="xl" className="text-center">
            <h2 className="font-serif text-[2.4rem] leading-tight font-normal">
              Vous êtes déjà client ?
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-[var(--foreground-muted)]">
              Écrivez-nous depuis votre espace : nous avons le contexte de votre site sous les yeux,
              la réponse est plus rapide.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <ButtonLink href="/app/support" size="pill-lg">
                Contacter le support
              </ButtonLink>
              <ButtonLink href="/faq" variant="secondary" size="pill-lg">
                Questions fréquentes
              </ButtonLink>
            </div>
            <p className="mt-6 text-xs text-[var(--muted)]">
              Pas encore client ?{' '}
              <Link href="/contact" className="underline underline-offset-4">
                Écrivez-nous ici
              </Link>
              .
            </p>
          </Panel>
        </Container>
      </Section>
    </>
  );
}
