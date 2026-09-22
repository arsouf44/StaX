'use client';

import { useEffect, useState, useTransition } from 'react';
import { Alert, Button, Dialog, Icon, Spinner } from '@stax/ui';
import { checkPublicationAction, publishAction } from './actions';
import type { PublicationReport, PublishOutcome } from './types';

/**
 * Publication, en trois temps : on verifie, on confirme, c est en ligne.
 *
 * Un probleme BLOQUANT (bouton qui mene nulle part, page d accueil vide...)
 * empeche la publication et dit comment le corriger, avec un bouton qui amene
 * directement a la section concernee. Un simple AVERTISSEMENT (texte
 * d exemple, description Google absente) n empeche rien : le client decide.
 */

type Step = 'checking' | 'blocked' | 'confirm' | 'publishing' | 'done' | 'failed';

export function PublishDialog({
  open,
  siteId,
  isLive,
  onClose,
  onPublished,
  onFix,
  flush,
}: {
  open: boolean;
  siteId: string;
  isLive: boolean;
  onClose: () => void;
  onPublished: (outcome: PublishOutcome) => void;
  /** Amene l editeur sur la section a corriger. */
  onFix: (pageId: string | undefined, blockId: string | undefined) => void;
  /** Attend la fin des enregistrements en cours avant de verifier. */
  flush: () => Promise<void>;
}) {
  const [step, setStep] = useState<Step>('checking');
  const [report, setReport] = useState<PublicationReport | null>(null);
  const [outcome, setOutcome] = useState<PublishOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setStep('checking');
    setReport(null);
    setOutcome(null);
    setError(null);
    let cancelled = false;
    void flush()
      .then(() => checkPublicationAction({ siteId }))
      .then((result) => {
        if (cancelled) return;
        if (result.status === 'error') {
          setError(result.message);
          setStep('failed');
          return;
        }
        setReport(result.report);
        setStep(result.report.ok ? 'confirm' : 'blocked');
      });
    return () => {
      cancelled = true;
    };
  }, [open, siteId, flush]);

  const publish = () => {
    setStep('publishing');
    startTransition(() => {
      void publishAction({ siteId }).then((result) => {
        if (result.status === 'error') {
          if (result.report) {
            setReport(result.report);
            setStep('blocked');
          } else {
            setError(result.message);
            setStep('failed');
          }
          return;
        }
        setOutcome(result.outcome);
        setStep('done');
        onPublished(result.outcome);
      });
    });
  };

  const title =
    step === 'done'
      ? 'Votre site est en ligne'
      : step === 'blocked'
        ? 'Nous avons détecté un problème avant la publication.'
        : isLive
          ? 'Publier vos modifications'
          : 'Mettre votre site en ligne';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={title}
      dismissible={step !== 'publishing'}
    >
      <div className="space-y-5" data-testid="publish-dialog" data-step={step}>
        {step === 'checking' || step === 'publishing' ? (
          <div className="flex items-center gap-3 py-6 text-sm text-[var(--foreground-muted)]">
            <Spinner />
            {step === 'checking'
              ? 'Nous vérifions votre site avant de le publier…'
              : 'Mise en ligne en cours…'}
          </div>
        ) : null}

        {step === 'failed' && error ? (
          <Alert tone="danger" live="alert">
            {error}
          </Alert>
        ) : null}

        {step === 'blocked' && report ? (
          <>
            <p className="text-sm text-[var(--foreground-muted)]">
              Votre site en ligne n’a pas changé. Corrigez{' '}
              {report.blocking.length > 1 ? 'ces points' : 'ce point'} puis publiez à nouveau.
            </p>
            <ul className="space-y-3">
              {report.blocking.map((issue, index) => (
                <li
                  key={`${issue.code}-${index}`}
                  className="rounded-[var(--radius-md)] border border-[var(--danger)]/40 bg-[var(--danger)]/5 p-3"
                >
                  <p className="text-sm font-medium">{issue.message}</p>
                  <p className="mt-1 text-sm text-[var(--foreground-muted)]">{issue.fix}</p>
                  {issue.pageId ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-2"
                      onClick={() => onFix(issue.pageId, issue.blockId)}
                    >
                      Corriger
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {(step === 'confirm' || step === 'blocked') && report && report.warnings.length > 0 ? (
          <details
            className="rounded-[var(--radius-md)] border border-[var(--border)] p-3"
            open={step === 'confirm'}
          >
            <summary className="cursor-pointer text-sm font-medium">
              {report.warnings.length} conseil{report.warnings.length > 1 ? 's' : ''} pour améliorer
              votre site (facultatif)
            </summary>
            <ul className="mt-3 space-y-2">
              {report.warnings.map((issue, index) => (
                <li key={`${issue.code}-${index}`} className="text-sm">
                  <p>{issue.message}</p>
                  <p className="text-[var(--foreground-muted)]">{issue.fix}</p>
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        {step === 'confirm' ? (
          <>
            <p className="flex items-start gap-2 text-sm">
              <Icon name="circle-check" size={16} className="mt-0.5 text-[var(--success)]" />
              <span>
                {report && report.warnings.length === 0
                  ? 'Tout est prêt. '
                  : 'Rien ne bloque la publication. '}
                {isLive
                  ? 'Vos visiteurs verront la nouvelle version immédiatement. La version actuelle reste dans l’historique : vous pourrez y revenir en un clic.'
                  : 'Votre site deviendra accessible à tout le monde. Vous pourrez continuer à le modifier ensuite.'}
              </span>
            </p>
            <div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
              <Button onClick={publish} data-testid="confirm-publish">
                <Icon name="rocket" size={14} aria-hidden="true" />
                {isLive ? 'Publier maintenant' : 'Mettre en ligne'}
              </Button>
              <Button variant="ghost" onClick={onClose}>
                Annuler
              </Button>
            </div>
          </>
        ) : null}

        {step === 'done' && outcome ? (
          <div className="space-y-4" data-testid="publish-success">
            <p className="text-sm">
              C’est fait : la version {outcome.versionNumber} de votre site est maintenant celle que
              voient vos visiteurs.
            </p>
            {outcome.liveUrl ? (
              <a
                href={outcome.liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--surface)]"
              >
                <Icon name="globe" size={14} aria-hidden="true" />
                Voir mon site
                <Icon name="external-link" size={12} aria-hidden="true" />
              </a>
            ) : (
              <p className="text-sm text-[var(--foreground-muted)]">
                Votre adresse n’est pas encore active : connectez-la depuis « Mon adresse ».
              </p>
            )}
            <div>
              <Button variant="secondary" onClick={onClose}>
                Continuer à modifier
              </Button>
            </div>
          </div>
        ) : null}

        {step === 'blocked' || step === 'failed' ? (
          <div className="border-t border-[var(--border)] pt-4">
            <Button variant="secondary" onClick={onClose}>
              Fermer
            </Button>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
