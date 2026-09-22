'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Button, useToast } from '@stax/ui';
import { prepareSiteAction } from './actions';

/** Prepare un site vide a partir du modele de son metier, en un clic. */
export function PrepareSiteButton() {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      size="lg"
      loading={pending}
      loadingLabel="Préparation"
      onClick={() =>
        startTransition(() => {
          void prepareSiteAction().then((result) => {
            if (result.status === 'error') toast.error(result.message);
            else {
              toast.success(result.message ?? 'Site prêt.');
              router.refresh();
            }
          });
        })
      }
    >
      Préparer mon site
    </Button>
  );
}
