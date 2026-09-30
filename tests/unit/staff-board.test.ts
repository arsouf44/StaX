import { describe, expect, it } from 'vitest';
import {
  daysSince,
  filterCards,
  groupByStep,
  parseBoardFilter,
  type BoardCard,
} from '~/lib/staff-board';

/**
 * Tableau de production de l'équipe : chaque projet tombe dans l'étape que
 * voit son client, et les filtres ne perdent aucun projet.
 */

function card(status: string, extra: Partial<BoardCard> = {}): BoardCard {
  return {
    id: `${status}-${Math.random()}`,
    reference: 'PRJ-1',
    status,
    due_at: null,
    created_at: '2026-09-01T00:00:00Z',
    delivered_at: null,
    last_activity_at: null,
    site_id: null,
    site_name: null,
    organization_name: null,
    plan_name: null,
    assignee: null,
    unread_messages: 0,
    waiting_on: 'team',
    late: false,
    ...extra,
  };
}

describe('tableau de production', () => {
  it('place chaque statut de projet dans une et une seule des sept étapes', () => {
    const statuses = [
      'ordered',
      'questionnaire_pending',
      'assets_pending',
      'design',
      'client_review',
      'changes_requested',
      'development',
      'in_progress',
      'verification',
      'internal_review',
      'approved',
      'ready_to_publish',
      'deploying',
      'published',
      'delivered',
      'maintenance',
    ];
    const columns = groupByStep(statuses.map((status) => card(status)));
    expect(columns).toHaveLength(7);
    expect(columns.reduce((total, column) => total + column.cards.length, 0)).toBe(statuses.length);
    expect(columns[0]?.key).toBe('ordered');
    expect(columns[6]?.cards.map((c) => c.status)).toEqual(['delivered', 'maintenance']);
  });

  it('filtre les retards, les attentes du client et le travail de l’équipe', () => {
    const cards = [
      card('assets_pending', { waiting_on: 'client', late: true }),
      card('development'),
      card('delivered'),
    ];
    expect(filterCards(cards, 'retard')).toHaveLength(1);
    expect(filterCards(cards, 'client').map((c) => c.status)).toEqual(['assets_pending']);
    // Un site livré n'est plus « à faire » par l'équipe.
    expect(filterCards(cards, 'equipe').map((c) => c.status)).toEqual(['development']);
    expect(filterCards(cards, 'tous')).toHaveLength(3);
  });

  it('refuse un filtre inconnu et compte les jours d’inactivité', () => {
    expect(parseBoardFilter('retard')).toBe('retard');
    expect(parseBoardFilter('<script>')).toBe('tous');
    expect(parseBoardFilter(undefined)).toBe('tous');
    const now = Date.parse('2026-09-30T12:00:00Z');
    expect(daysSince('2026-09-30T08:00:00Z', now)).toBe(0);
    expect(daysSince('2026-09-27T12:00:00Z', now)).toBe(3);
    expect(daysSince(null, now)).toBeNull();
  });
});
