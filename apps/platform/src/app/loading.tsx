import { Container, Skeleton } from '@stax/ui';

/**
 * Etat de chargement global.
 *
 * Une esquisse de la mise en page plutot qu un tourniquet : l œil comprend
 * immediatement ce qui arrive, et la page ne « saute » pas au moment ou le
 * contenu reel remplace l esquisse.
 */
export default function Loading() {
  return (
    <div className="py-16">
      <Container size="default">
        <span className="sr-only" role="status">
          Chargement en cours
        </span>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-4 h-4 w-full max-w-lg" />
        <Skeleton className="mt-2 h-4 w-full max-w-md" />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      </Container>
    </div>
  );
}
