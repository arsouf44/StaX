import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { unwrapMaybe } from '@stax/database';
import { formatMoney } from '@stax/payments';
import { Alert, ButtonLink, Panel, StatusPill } from '@stax/ui';
import { getWorkspace } from '~/lib/workspace';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Confirmation de commande',
  robots: { index: false, follow: false },
};

/**
 * Page de confirmation.
 *
 * ELLE NE CONSIDERE JAMAIS UN PAIEMENT COMME ACQUIS PARCE QUE LE NAVIGATEUR
 * EST ARRIVE ICI. Le parametre `session_id` renvoye par Stripe n est meme pas
 * lu : la page relit l etat REEL de la commande en base, ou seul le webhook
 * signe a pu ecrire « payee ».
 *
 * Consequence assumee : pendant les quelques secondes qui separent le retour
 * du navigateur de la reception du webhook, la page affiche « paiement en
 * cours de confirmation ». C est honnete, et c est preferable a afficher une
 * confirmation qui pourrait etre fausse.
 */
export default async function OrderConfirmationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { db } = await getWorkspace();

  // La RLS garantit qu on ne lit que les commandes de son organisation : un
  // identifiant appartenant a quelqu un d autre renvoie simplement « rien ».
  const order = unwrapMaybe<{
    id: string;
    reference: string;
    status: string;
    plan_slug: string | null;
    total_cents: number;
    maintenance_price_cents: number;
    currency: string;
    created_at: string;
    site_id: string | null;
  }>(
    (await db
      .from('orders')
      .select(
        'id, reference, status, plan_slug, total_cents, maintenance_price_cents, currency, created_at, site_id',
      )
      .eq('id', id)
      .maybeSingle()) as never,
  );

  if (!order) notFound();

  const paid = order.status === 'paid';
  const pending = order.status === 'checkout_pending' || order.status === 'draft';

  return (
    <div className="mx-auto max-w-2xl">
      {paid ? (
        <>
          <StatusPill tone="success">Paiement confirmé</StatusPill>
          <h1 className="mt-4 text-2xl font-medium tracking-[-0.02em]">
            Merci, votre projet est lancé
          </h1>
          <p className="mt-3 text-[var(--foreground-muted)]">
            Nous avons bien reçu votre règlement. Votre espace est ouvert et vous pouvez suivre
            l’avancement de votre site à tout moment.
          </p>
        </>
      ) : pending ? (
        <>
          <StatusPill tone="info" pulse>
            Confirmation en cours
          </StatusPill>
          <h1 className="mt-4 text-2xl font-medium tracking-[-0.02em]">
            Nous confirmons votre paiement
          </h1>
          <p className="mt-3 text-[var(--foreground-muted)]">
            Votre banque nous transmet la confirmation, ce qui prend généralement quelques secondes.
            Actualisez cette page dans un instant : nous ne considérons un paiement comme acquis que
            lorsqu’il est confirmé par notre prestataire bancaire, jamais avant.
          </p>
          <Alert tone="info" className="mt-5" live="status">
            Si rien ne change au bout de quelques minutes, rien n’est perdu : votre commande est
            enregistrée sous la référence <strong>{order.reference}</strong> et aucun débit ne sera
            appliqué deux fois. Écrivez-nous depuis votre espace.
          </Alert>
        </>
      ) : (
        <>
          <StatusPill tone="warning">Commande {order.status}</StatusPill>
          <h1 className="mt-4 text-2xl font-medium tracking-[-0.02em]">
            Cette commande n’est pas active
          </h1>
          <p className="mt-3 text-[var(--foreground-muted)]">
            Contactez-nous depuis votre espace si vous pensez qu’il s’agit d’une erreur.
          </p>
        </>
      )}

      <Panel level={2} padding="lg" className="mt-8">
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--foreground-muted)]">Référence</dt>
            <dd className="font-mono">{order.reference}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--foreground-muted)]">Montant réglé</dt>
            <dd className="tabular-nums">
              {formatMoney(order.total_cents, order.currency as 'EUR')}
            </dd>
          </div>
          {order.maintenance_price_cents > 0 ? (
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--foreground-muted)]">Maintenance</dt>
              <dd className="tabular-nums">
                {formatMoney(order.maintenance_price_cents, order.currency as 'EUR', {
                  hideDecimalsWhenRound: true,
                })}{' '}
                / mois, à partir de la mise en ligne
              </dd>
            </div>
          ) : null}
        </dl>
      </Panel>

      {paid ? (
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/app/projet">Suivre mon projet</ButtonLink>
          <ButtonLink href="/app" variant="secondary">
            Aller à mon espace
          </ButtonLink>
        </div>
      ) : (
        <div className="mt-8">
          <ButtonLink href={`/app/commande/${order.id}/confirmation`} variant="secondary">
            Actualiser
          </ButtonLink>
        </div>
      )}

      <p className="mt-8 text-xs text-[var(--muted)]">
        Une facture vous sera adressée par e-mail. Vous la retrouverez aussi dans{' '}
        <Link href="/app/facturation" className="underline underline-offset-4">
          Facturation
        </Link>
        .
      </p>
    </div>
  );
}
