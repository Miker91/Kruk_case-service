/**
 * Case Service
 *
 * Business logic for case management.
 * Handles case lifecycle, status transitions, and payment recording.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Case,
  CaseStatus,
  CasePriority,
  CreateCaseDto,
  UpdateCaseDto,
  CaseFilter,
  CaseStatusResponse,
  CaseHistoryEntry,
} from '../models/Case';

// In-memory storage for demo
const cases: Map<string, Case> = new Map();
const caseHistory: Map<string, CaseHistoryEntry[]> = new Map();

// Idempotency tracking for payment events (KRUK-10)
const processedPayments: Set<string> = new Set();

// Initialize sample data
function initializeSampleData(): void {
  const sampleCases: Case[] = [
    {
      id: 'CASE-2024-001',
      debtorId: 'DBT-12345',
      creditorId: 'CRED-BANK-001',
      originalDebt: 18000,
      currentDebt: 15000,
      paidAmount: 3000,
      interestAccrued: 1200,
      currency: 'PLN',
      status: CaseStatus.SETTLEMENT,
      priority: CasePriority.MEDIUM,
      assignedAgentId: 'agent-anna-k',
      assignedTeam: 'Settlement Team',
      createdAt: new Date('2023-06-15'),
      updatedAt: new Date('2024-01-15'),
      lastContactAt: new Date('2024-01-10'),
      lastPaymentAt: new Date('2024-01-15'),
      nextActionAt: new Date('2024-02-15'),
      source: 'Portfolio-2023-Q2',
      externalRef: 'BANK-REF-12345',
      tags: ['settlement', 'regular-payer'],
      notes: 'Debtor cooperating well. Settlement plan: 12 monthly installments.',
    },
    {
      id: 'CASE-2024-002',
      debtorId: 'DBT-67890',
      creditorId: 'CRED-TELCO-001',
      originalDebt: 5200.50,
      currentDebt: 5200.50,
      paidAmount: 0,
      interestAccrued: 320,
      currency: 'PLN',
      status: CaseStatus.ACTIVE,
      priority: CasePriority.HIGH,
      assignedAgentId: 'agent-jan-m',
      assignedTeam: 'Collection Team A',
      createdAt: new Date('2024-01-10'),
      updatedAt: new Date('2024-01-10'),
      nextActionAt: new Date('2024-01-25'),
      source: 'Direct-Assignment',
      externalRef: 'TELCO-2024-67890',
      tags: ['new-case', 'first-contact-pending'],
    },
    {
      id: 'CASE-2024-003',
      debtorId: 'DBT-11111',
      creditorId: 'CRED-BANK-002',
      originalDebt: 45000,
      currentDebt: 40000,
      paidAmount: 5000,
      interestAccrued: 8500,
      currency: 'PLN',
      status: CaseStatus.LEGAL_ACTION,
      priority: CasePriority.CRITICAL,
      assignedAgentId: 'legal-team',
      assignedTeam: 'Legal Department',
      createdAt: new Date('2022-03-20'),
      updatedAt: new Date('2023-11-15'),
      lastContactAt: new Date('2023-08-10'),
      lastPaymentAt: new Date('2023-08-10'),
      source: 'Portfolio-2022-Q1',
      externalRef: 'BANK-REF-11111',
      tags: ['legal-action', 'court-pending'],
      notes: 'Court case in progress. File no: IC 1234/23. No contact from debtor.',
    },
    {
      id: 'CASE-2024-004',
      debtorId: 'DBT-22222',
      creditorId: 'CRED-UTILITY-001',
      originalDebt: 8500,
      currentDebt: 0,
      paidAmount: 8500,
      interestAccrued: 0,
      currency: 'PLN',
      status: CaseStatus.CLOSED,
      priority: CasePriority.LOW,
      assignedAgentId: 'agent-piotr-s',
      assignedTeam: 'Collection Team B',
      createdAt: new Date('2023-01-05'),
      updatedAt: new Date('2024-01-20'),
      lastContactAt: new Date('2024-01-18'),
      lastPaymentAt: new Date('2024-01-20'),
      closedAt: new Date('2024-01-20'),
      source: 'Portfolio-2023-Q1',
      tags: ['paid-in-full'],
      notes: 'Fully paid. Case closed successfully.',
    },
    {
      id: 'CASE-2024-005',
      debtorId: 'DBT-33333',
      creditorId: 'CRED-BANK-001',
      originalDebt: 125000,
      currentDebt: 125000,
      paidAmount: 0,
      interestAccrued: 15000,
      currency: 'PLN',
      status: CaseStatus.WRITTEN_OFF,
      priority: CasePriority.LOW,
      createdAt: new Date('2019-06-01'),
      updatedAt: new Date('2023-06-01'),
      source: 'Portfolio-2019-Q2',
      tags: ['written-off', 'no-contact'],
      notes: 'Debtor unreachable. Written off after 4 years.',
    },
  ];

  sampleCases.forEach((c) => {
    cases.set(c.id, c);
    caseHistory.set(c.id, []);
  });
}

initializeSampleData();

export class CaseService {
  /**
   * Get all cases with optional filtering
   */
  async getAllCases(filter?: CaseFilter): Promise<Case[]> {
    let result = Array.from(cases.values());

    if (filter) {
      if (filter.debtorId) {
        result = result.filter((c) => c.debtorId === filter.debtorId);
      }
      if (filter.creditorId) {
        result = result.filter((c) => c.creditorId === filter.creditorId);
      }
      if (filter.status) {
        result = result.filter((c) => c.status === filter.status);
      }
      if (filter.priority) {
        result = result.filter((c) => c.priority === filter.priority);
      }
      if (filter.assignedAgentId) {
        result = result.filter((c) => c.assignedAgentId === filter.assignedAgentId);
      }
      if (filter.assignedTeam) {
        result = result.filter((c) => c.assignedTeam === filter.assignedTeam);
      }
    }

    return result.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  /**
   * Get case by ID
   */
  async getCaseById(id: string): Promise<Case | null> {
    return cases.get(id) || null;
  }

  /**
   * Get case status (lightweight endpoint)
   */
  async getCaseStatus(id: string): Promise<CaseStatusResponse | null> {
    const caseData = cases.get(id);
    if (!caseData) {
      return null;
    }

    const canAcceptPayments = this.canAcceptPayments(caseData.status);
    let reason: string | undefined;

    if (!canAcceptPayments) {
      if (caseData.status === CaseStatus.LEGAL_ACTION) {
        reason = 'Case is in legal action. Contact legal department.';
      } else if (caseData.status === CaseStatus.CLOSED) {
        reason = 'Case is closed. Payment may trigger review.';
      }
    }

    return {
      caseId: id,
      status: caseData.status,
      canAcceptPayments,
      reason,
    };
  }

  /**
   * Create new case
   */
  async createCase(dto: CreateCaseDto): Promise<Case> {
    const id = `CASE-${new Date().getFullYear()}-${uuidv4().substring(0, 6).toUpperCase()}`;
    const now = new Date();

    const newCase: Case = {
      id,
      debtorId: dto.debtorId,
      creditorId: dto.creditorId,
      originalDebt: dto.originalDebt,
      currentDebt: dto.originalDebt,
      paidAmount: 0,
      interestAccrued: 0,
      currency: dto.currency || 'PLN',
      status: CaseStatus.ACTIVE,
      priority: dto.priority || CasePriority.MEDIUM,
      createdAt: now,
      updatedAt: now,
      source: dto.source,
      externalRef: dto.externalRef,
      notes: dto.notes,
    };

    cases.set(id, newCase);
    caseHistory.set(id, []);

    this.addHistoryEntry(id, 'CASE_CREATED', 'Case created', 'system');

    return newCase;
  }

  /**
   * Update case
   */
  async updateCase(id: string, dto: UpdateCaseDto): Promise<Case | null> {
    const caseData = cases.get(id);
    if (!caseData) {
      return null;
    }

    const oldStatus = caseData.status;

    if (dto.status !== undefined) {
      caseData.status = dto.status;
    }
    if (dto.priority !== undefined) {
      caseData.priority = dto.priority;
    }
    if (dto.assignedAgentId !== undefined) {
      caseData.assignedAgentId = dto.assignedAgentId;
    }
    if (dto.assignedTeam !== undefined) {
      caseData.assignedTeam = dto.assignedTeam;
    }
    if (dto.notes !== undefined) {
      caseData.notes = dto.notes;
    }
    if (dto.tags !== undefined) {
      caseData.tags = dto.tags;
    }

    caseData.updatedAt = new Date();

    if (dto.status !== undefined && dto.status !== oldStatus) {
      this.addHistoryEntry(
        id,
        'STATUS_CHANGED',
        `Status changed from ${oldStatus} to ${dto.status}`,
        'system'
      );

      if (dto.status === CaseStatus.CLOSED) {
        caseData.closedAt = new Date();
      }
    }

    cases.set(id, caseData);
    return caseData;
  }

  /**
   * Record payment against case
   * Idempotent - duplicate paymentIds are ignored (KRUK-10)
   */
  async recordPayment(
    caseId: string,
    paymentId: string,
    amount: number
  ): Promise<Case | null> {
    const caseData = cases.get(caseId);
    if (!caseData) {
      return null;
    }

    // Idempotency check - prevent duplicate processing (KRUK-10)
    const idempotencyKey = `${caseId}:${paymentId}`;
    if (processedPayments.has(idempotencyKey)) {
      console.log(`[CaseService] Duplicate payment ignored: ${paymentId} for case ${caseId}`);
      return caseData; // Return current state without modification
    }

    caseData.paidAmount += amount;
    caseData.currentDebt = Math.max(0, caseData.originalDebt + caseData.interestAccrued - caseData.paidAmount);
    caseData.lastPaymentAt = new Date();
    caseData.updatedAt = new Date();

    this.addHistoryEntry(
      caseId,
      'PAYMENT_RECEIVED',
      `Payment ${paymentId} received: ${amount} ${caseData.currency}`,
      'payment-service'
    );

    // Auto-close if fully paid
    if (caseData.currentDebt <= 0 && caseData.status !== CaseStatus.CLOSED) {
      caseData.status = CaseStatus.CLOSED;
      caseData.closedAt = new Date();
      this.addHistoryEntry(caseId, 'CASE_CLOSED', 'Case auto-closed: debt fully paid', 'system');
    }

    // Reopen if written-off and payment received
    if (caseData.status === CaseStatus.WRITTEN_OFF && amount > 0) {
      caseData.status = CaseStatus.ACTIVE;
      this.addHistoryEntry(
        caseId,
        'CASE_REOPENED',
        'Case reopened due to payment received after write-off',
        'system'
      );
    }

    // Mark payment as processed (KRUK-10 idempotency)
    processedPayments.add(idempotencyKey);

    // Cleanup old entries to prevent memory leak (keep last 10000)
    if (processedPayments.size > 10000) {
      const oldestKeys = Array.from(processedPayments).slice(0, 5000);
      oldestKeys.forEach((key) => processedPayments.delete(key));
    }

    cases.set(caseId, caseData);
    return caseData;
  }

  /**
   * Get case history
   */
  async getCaseHistory(caseId: string): Promise<CaseHistoryEntry[]> {
    return caseHistory.get(caseId) || [];
  }

  /**
   * Get cases by debtor
   */
  async getCasesByDebtor(debtorId: string): Promise<Case[]> {
    return this.getAllCases({ debtorId });
  }

  /**
   * Check if case can accept payments based on status
   */
  private canAcceptPayments(status: CaseStatus): boolean {
    // LEGAL_ACTION cases need special handling
    // But we return true for most statuses (fail-open for payments)
    return status !== CaseStatus.LEGAL_ACTION;
  }

  /**
   * Add entry to case history
   */
  private addHistoryEntry(
    caseId: string,
    action: string,
    description: string,
    performedBy: string,
    metadata?: Record<string, any>
  ): void {
    const history = caseHistory.get(caseId) || [];
    history.push({
      id: uuidv4(),
      caseId,
      action,
      description,
      performedBy,
      performedAt: new Date(),
      metadata,
    });
    caseHistory.set(caseId, history);
  }
}

export const caseService = new CaseService();
