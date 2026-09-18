/**
 * Etat partage des formulaires pilotes par une action serveur.
 *
 * Ces valeurs vivent ICI et non dans les fichiers `'use server'` : un module
 * d actions serveur ne peut exporter QUE des fonctions asynchrones. Y placer
 * une constante compile sans erreur et casse a l execution — un defaut que
 * seul un test de bout en bout contre un vrai build attrape.
 */

export interface ActionState {
  status: 'idle' | 'error' | 'success';
  message?: string;
  /** Erreurs par champ, telles que produites par `fieldErrors()`. */
  errors?: Record<string, string[]>;
}

/** Etat initial commun a tous les formulaires. */
export const IDLE_STATE: ActionState = { status: 'idle' };

/**
 * Etat initial type, pour les formulaires qui portent des champs
 * supplementaires (etape courante, reference, jeton…).
 */
export function idleState<T extends ActionState>(extra?: Omit<T, 'status'>): T {
  return { status: 'idle', ...(extra ?? {}) } as T;
}
