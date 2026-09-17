import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Fusionne des classes Tailwind en resolvant les conflits.
 * `cn('p-4', condition && 'p-6')` donne `p-6` et non les deux.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
