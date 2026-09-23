import { ButtonLink, Icon, Panel } from '@stax/ui';

/**
 * Site en construction chez StaX.
 *
 * Le site est concu et construit par l equipe StaX ; le client le decouvre
 * quand il lui est confie. En attendant, il suit son projet et peut nous
 * ecrire. Aucune date n est promise ici : l echeance, quand elle existe, est
 * celle du projet, affichee dans « Mon projet ».
 */
export function SiteUnderConstruction({
  siteName,
  compact = false,
}: {
  siteName: string;
  /** Version courte, pour le tableau de bord. */
  compact?: boolean;
}) {
  return (
    <Panel level={2} padding="lg" data-testid="site-under-construction">
      <div className="flex items-start gap-4">
        <span
          aria-hidden
          className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--accent)]/12 text-[var(--accent)]"
        >
          <Icon name="pencil-ruler" size={20} />
        </span>
        <div className="min-w-0">
          <p className="text-2xs font-medium tracking-[0.12em] text-[var(--muted)] uppercase">
            {siteName}
          </p>
          <h2 className="mt-1 text-xl font-medium tracking-[-0.01em]">
            Votre site est en cours de création
          </h2>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-[var(--foreground-muted)]">
            L’équipe StaX conçoit et construit votre site. Il apparaîtra ici dès que nous vous
            l’aurons confié, et nous vous préviendrons. Vous pourrez alors le découvrir, demander
            vos corrections et le modifier.
          </p>
          {compact ? null : (
            <p className="mt-2 max-w-prose text-sm leading-relaxed text-[var(--foreground-muted)]">
              Cette page fait partie de votre site : elle s’ouvrira à ce moment-là.
            </p>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            <ButtonLink href="/app/projet">Suivre mon projet</ButtonLink>
            <ButtonLink href="/app/support" variant="secondary">
              Écrire à l’équipe
            </ButtonLink>
          </div>
        </div>
      </div>
    </Panel>
  );
}
