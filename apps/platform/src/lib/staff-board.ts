import type { Db } from '@nemasus/database';
import { PROJECT_TIMELINE } from '@nemasus/payments';

/**
 * Pilotage de l'équipe : la file « à traiter » et le tableau de production.
 *
 * Les deux lectures passent par des fonctions de la base réservées à
 * l'équipe (`staff_work_queue`, `staff_production_board`) : pour toute autre
 * personne elles renvoient `null`, et ce module n'affiche alors rien.
 */

export interface SiteDown {
  siteId: string;
  name: string;
  organization: string;
  url: string | null;
  statusCode: number | null;
  error: string | null;
  checkedAt: string;
}

export interface WorkQueue {
  unreadConversations: number;
  lateProjects: number;
  waitingOnClient: number;
  sitesDown: number;
  proposalsExpiring: number;
  deliveriesFailed: number;
  ticketsWaiting: number;
  sitesDownList: SiteDown[];
}

export interface BoardCard {
  id: string;
  reference: string;
  status: string;
  due_at: string | null;
  created_at: string;
  delivered_at: string | null;
  last_activity_at: string | null;
  site_id: string | null;
  site_name: string | null;
  organization_name: string | null;
  plan_name: string | null;
  assignee: string | null;
  unread_messages: number;
  waiting_on: 'client' | 'team';
  late: boolean;
}

export async function loadWorkQueue(db: Db): Promise<WorkQueue | null> {
  const { data, error } = await db.rpc('staff_work_queue');
  if (error || !data || typeof data !== 'object') return null;
  const raw = data as Partial<WorkQueue>;
  const count = (value: unknown) => (typeof value === 'number' && value > 0 ? value : 0);
  return {
    unreadConversations: count(raw.unreadConversations),
    lateProjects: count(raw.lateProjects),
    waitingOnClient: count(raw.waitingOnClient),
    sitesDown: count(raw.sitesDown),
    proposalsExpiring: count(raw.proposalsExpiring),
    deliveriesFailed: count(raw.deliveriesFailed),
    ticketsWaiting: count(raw.ticketsWaiting),
    sitesDownList: Array.isArray(raw.sitesDownList) ? raw.sitesDownList : [],
  };
}

export async function loadProductionBoard(db: Db): Promise<BoardCard[] | null> {
  const { data, error } = await db.rpc('staff_production_board');
  if (error || !Array.isArray(data)) return null;
  return data as BoardCard[];
}

export type BoardFilter = 'tous' | 'retard' | 'client' | 'equipe';

export function parseBoardFilter(value: unknown): BoardFilter {
  return value === 'retard' || value === 'client' || value === 'equipe' ? value : 'tous';
}

export function filterCards(cards: readonly BoardCard[], filter: BoardFilter): BoardCard[] {
  switch (filter) {
    case 'retard':
      return cards.filter((card) => card.late);
    case 'client':
      return cards.filter((card) => card.waiting_on === 'client' && !isDelivered(card));
    case 'equipe':
      return cards.filter((card) => card.waiting_on === 'team' && !isDelivered(card));
    default:
      return [...cards];
  }
}

export function isDelivered(card: Pick<BoardCard, 'status'>): boolean {
  return card.status === 'delivered' || card.status === 'maintenance';
}

/** Colonnes du tableau : les sept étapes que le client voit, dans le même ordre. */
export function groupByStep(cards: readonly BoardCard[]) {
  return PROJECT_TIMELINE.map((step) => ({
    key: step.key,
    label: step.label,
    cards: cards.filter((card) => (step.statuses as readonly string[]).includes(card.status)),
  }));
}

/** Jours entiers écoulés depuis une date (0 le jour même). */
export function daysSince(iso: string | null, now = Date.now()): number | null {
  if (!iso) return null;
  const elapsed = now - new Date(iso).getTime();
  return Number.isFinite(elapsed) ? Math.max(0, Math.floor(elapsed / 86_400_000)) : null;
}
