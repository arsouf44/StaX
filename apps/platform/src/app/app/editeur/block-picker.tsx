'use client';

import { useMemo, useState } from 'react';
import { Button, Dialog, Icon, cn } from '@stax/ui';

/**
 * Choix d une section a ajouter.
 *
 * Les sections sont groupees par intention — structurer, raconter, rassurer,
 * faire agir — et non par nom technique. Une personne qui cherche « comment
 * mettre mes avis clients » lit « Rassurer », pas « testimonials ».
 *
 * Seules les sections que le metier du site rend disponibles sont proposees :
 * la liste est calculee cote serveur a partir des modules actifs.
 */

export interface BlockChoice {
  type: string;
  label: string;
  description: string;
  icon: string;
  category: string;
  /** Deja present sur la page alors qu un seul exemplaire est permis. */
  disabled: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  structure: 'Structurer la page',
  contenu: 'Raconter votre activité',
  preuve: 'Rassurer vos visiteurs',
  conversion: 'Faire agir',
  metier: 'Propre à votre métier',
};

const CATEGORY_ORDER = ['structure', 'contenu', 'metier', 'preuve', 'conversion'];

export function BlockPicker({
  choices,
  pending,
  onPick,
}: {
  choices: BlockChoice[];
  pending: boolean;
  onPick: (type: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const groups = useMemo(() => {
    const byCategory = new Map<string, BlockChoice[]>();
    for (const choice of choices) {
      const list = byCategory.get(choice.category) ?? [];
      list.push(choice);
      byCategory.set(choice.category, list);
    }
    return CATEGORY_ORDER.filter((category) => byCategory.has(category)).map((category) => ({
      category,
      label: CATEGORY_LABELS[category] ?? category,
      items: byCategory.get(category) ?? [],
    }));
  }, [choices]);

  return (
    <>
      <Button variant="secondary" size="sm" className="w-full" onClick={() => setOpen(true)}>
        <Icon name="plus" size={16} aria-hidden="true" />
        Ajouter une section
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title="Ajouter une section"
        description="Elle sera ajoutée en bas de la page. Vous pourrez la déplacer ensuite."
      >
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.category}>
              <h3 className="text-2xs font-medium tracking-[0.12em] text-[var(--muted)] uppercase">
                {group.label}
              </h3>
              <ul className="mt-2.5 grid gap-2 sm:grid-cols-2">
                {group.items.map((choice) => (
                  <li key={choice.type}>
                    <button
                      type="button"
                      disabled={choice.disabled || pending}
                      onClick={() => {
                        onPick(choice.type);
                        setOpen(false);
                      }}
                      className={cn(
                        'flex w-full items-start gap-3 rounded-[var(--radius-md)] border p-3 text-left transition',
                        'border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--surface-2)]',
                        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
                        'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[var(--border)] disabled:hover:bg-transparent',
                      )}
                    >
                      <span className="mt-0.5 shrink-0 text-[var(--accent)]" aria-hidden="true">
                        <Icon name={choice.icon} size={18} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{choice.label}</span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-[var(--foreground-muted)]">
                          {choice.disabled
                            ? 'Déjà présente sur cette page — une seule est possible.'
                            : choice.description}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </Dialog>
    </>
  );
}
