/**
 * CaseService Tests
 *
 * KRUK-10: Tests for payment recording and idempotency
 */

import { CaseService } from '../src/services/CaseService';

describe('CaseService', () => {
  let service: CaseService;

  beforeEach(() => {
    service = new CaseService();
  });

  describe('recordPayment', () => {
    it('should record payment and update balance', async () => {
      // CASE-2024-001 has currentDebt: 15000, paidAmount: 3000
      const result = await service.recordPayment('CASE-2024-001', 'PAY-TEST-001', 1500);

      expect(result).not.toBeNull();
      expect(result!.paidAmount).toBe(4500); // 3000 + 1500
      expect(result!.currentDebt).toBe(14700); // 18000 + 1200 - 4500
    });

    it('should return null for non-existent case', async () => {
      const result = await service.recordPayment('CASE-FAKE', 'PAY-TEST-001', 1000);
      expect(result).toBeNull();
    });

    it('should be idempotent - ignore duplicate payments', async () => {
      // First payment
      const result1 = await service.recordPayment('CASE-2024-002', 'PAY-IDEM-001', 1000);
      expect(result1!.paidAmount).toBe(1000);

      // Duplicate payment with same ID - should be ignored
      const result2 = await service.recordPayment('CASE-2024-002', 'PAY-IDEM-001', 1000);
      expect(result2!.paidAmount).toBe(1000); // Still 1000, not 2000
    });

    it('should auto-close case when debt is fully paid', async () => {
      // CASE-2024-002 has currentDebt: 5200.50, paidAmount: 0
      const result = await service.recordPayment('CASE-2024-002', 'PAY-FULL-001', 5520.50);

      expect(result).not.toBeNull();
      expect(result!.currentDebt).toBe(0);
      expect(result!.status).toBe('CLOSED');
      expect(result!.closedAt).toBeDefined();
    });

    it('should reopen written-off case when payment received', async () => {
      // CASE-2024-005 is WRITTEN_OFF
      const result = await service.recordPayment('CASE-2024-005', 'PAY-REOPEN-001', 500);

      expect(result).not.toBeNull();
      expect(result!.status).toBe('ACTIVE');
      expect(result!.paidAmount).toBe(500);
    });
  });

  describe('getCaseById', () => {
    it('should return case by ID', async () => {
      const result = await service.getCaseById('CASE-2024-001');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('CASE-2024-001');
      expect(result!.debtorId).toBe('DBT-12345');
    });

    it('should return null for non-existent case', async () => {
      const result = await service.getCaseById('CASE-FAKE');
      expect(result).toBeNull();
    });
  });

  describe('getCaseStatus', () => {
    it('should return status with payment eligibility', async () => {
      const result = await service.getCaseStatus('CASE-2024-001');

      expect(result).not.toBeNull();
      expect(result!.status).toBe('SETTLEMENT');
      expect(result!.canAcceptPayments).toBe(true);
    });

    it('should block payments for LEGAL_ACTION status', async () => {
      const result = await service.getCaseStatus('CASE-2024-003');

      expect(result).not.toBeNull();
      expect(result!.status).toBe('LEGAL_ACTION');
      expect(result!.canAcceptPayments).toBe(false);
      expect(result!.reason).toContain('legal');
    });
  });
});
