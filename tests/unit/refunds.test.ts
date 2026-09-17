import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REFUND_POLICY,
  addDays,
  assertRefundTransition,
  canTransitionRefund,
  computeRefundEligibility,
} from '@stax/payments';

const GO_LIVE = new Date('2026-03-01T10:00:00Z');

describe('politique de remboursement', () => {
  it('accepte une demande dans la fenetre de 15 jours', () => {
    const r = computeRefundEligibility({
      goLiveAt: GO_LIVE,
      amountPaidCents: 23999,
      domainPurchased: false,
      requestedAt: addDays(GO_LIVE, 10),
    });
    expect(r.eligible).toBe(true);
    expect(r.refundAmountCents).toBe(23999);
    expect(r.deductionCents).toBe(0);
    expect(r.daysRemaining).toBe(5);
  });

  it('refuse une demande au-dela de la fenetre', () => {
    const r = computeRefundEligibility({
      goLiveAt: GO_LIVE,
      amountPaidCents: 23999,
      domainPurchased: false,
      requestedAt: addDays(GO_LIVE, 16),
    });
    expect(r.eligible).toBe(false);
    expect(r.daysRemaining).toBe(0);
    // La formulation rappelle explicitement que les droits legaux subsistent :
    // une garantie commerciale ne peut jamais les restreindre.
    expect(r.reason).toContain('droits l\u00e9gaux');
  });

  it('retient 10 € UNIQUEMENT si un domaine a ete reellement achete', () => {
    const withDomain = computeRefundEligibility({
      goLiveAt: GO_LIVE,
      amountPaidCents: 23999,
      domainPurchased: true,
      domainCostCents: 1200,
      requestedAt: addDays(GO_LIVE, 5),
    });
    expect(withDomain.deductionCents).toBe(1000);
    expect(withDomain.refundAmountCents).toBe(22999);

    const withoutDomain = computeRefundEligibility({
      goLiveAt: GO_LIVE,
      amountPaidCents: 23999,
      domainPurchased: false,
      requestedAt: addDays(GO_LIVE, 5),
    });
    expect(withoutDomain.deductionCents).toBe(0);
    expect(withoutDomain.refundAmountCents).toBe(23999);
  });

  it('ne retient jamais plus que le montant encaisse', () => {
    const r = computeRefundEligibility({
      goLiveAt: GO_LIVE,
      amountPaidCents: 500,
      domainPurchased: true,
      requestedAt: addDays(GO_LIVE, 1),
    });
    expect(r.deductionCents).toBe(500);
    expect(r.refundAmountCents).toBe(0);
  });

  it('reste indetermine tant que le site n’est pas en ligne', () => {
    const r = computeRefundEligibility({
      goLiveAt: null,
      amountPaidCents: 23999,
      domainPurchased: false,
    });
    expect(r.eligible).toBeNull();
    expect(r.deadlineAt).toBeNull();
  });

  it('honore une fenetre configuree differemment', () => {
    const r = computeRefundEligibility({
      goLiveAt: GO_LIVE,
      amountPaidCents: 23999,
      domainPurchased: false,
      requestedAt: addDays(GO_LIVE, 20),
      policy: { ...DEFAULT_REFUND_POLICY, windowDays: 30 },
    });
    expect(r.eligible).toBe(true);
  });

  it('accepte la demande exactement a l’echeance', () => {
    const r = computeRefundEligibility({
      goLiveAt: GO_LIVE,
      amountPaidCents: 23999,
      domainPurchased: false,
      requestedAt: addDays(GO_LIVE, 15),
    });
    expect(r.eligible).toBe(true);
  });
});

describe('workflow de remboursement', () => {
  it('suit les transitions autorisees', () => {
    expect(canTransitionRefund('requested', 'under_review')).toBe(true);
    expect(canTransitionRefund('under_review', 'approved')).toBe(true);
    expect(canTransitionRefund('approved', 'processing')).toBe(true);
    expect(canTransitionRefund('processing', 'refunded')).toBe(true);
  });

  it('interdit les raccourcis', () => {
    expect(canTransitionRefund('requested', 'refunded')).toBe(false);
    expect(canTransitionRefund('rejected', 'approved')).toBe(false);
    expect(canTransitionRefund('refunded', 'processing')).toBe(false);
    expect(() => assertRefundTransition('requested', 'refunded')).toThrow();
  });
});
