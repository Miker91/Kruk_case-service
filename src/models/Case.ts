/**
 * Case model for debt collection management
 *
 * A "case" represents a single debt collection matter for a debtor.
 * One debtor can have multiple cases (e.g., different debts from different creditors).
 */

export enum CaseStatus {
  /**
   * Active case - normal collection process
   */
  ACTIVE = 'ACTIVE',

  /**
   * Settlement in progress - debtor agreed to payment plan
   */
  SETTLEMENT = 'SETTLEMENT',

  /**
   * Legal action initiated - court proceedings, bailiff, etc.
   * BLOCKS normal payments - must go through legal department
   */
  LEGAL_ACTION = 'LEGAL_ACTION',

  /**
   * Case closed - debt fully paid or settled
   */
  CLOSED = 'CLOSED',

  /**
   * Debt written off - unrecoverable
   * Any payment will trigger case reopening
   */
  WRITTEN_OFF = 'WRITTEN_OFF',
}

export enum CasePriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export interface Case {
  id: string;
  debtorId: string;
  creditorId: string;

  // Financial data
  originalDebt: number;
  currentDebt: number;
  paidAmount: number;
  interestAccrued: number;
  currency: string;

  // Status
  status: CaseStatus;
  priority: CasePriority;

  // Assignment
  assignedAgentId?: string;
  assignedTeam?: string;

  // Dates
  createdAt: Date;
  updatedAt: Date;
  lastContactAt?: Date;
  lastPaymentAt?: Date;
  nextActionAt?: Date;
  closedAt?: Date;

  // Metadata
  source: string; // Original creditor/portfolio
  externalRef?: string; // Reference in external system
  tags?: string[];
  notes?: string;
}

export interface CreateCaseDto {
  debtorId: string;
  creditorId: string;
  originalDebt: number;
  currency?: string;
  priority?: CasePriority;
  source: string;
  externalRef?: string;
  notes?: string;
}

export interface UpdateCaseDto {
  status?: CaseStatus;
  priority?: CasePriority;
  assignedAgentId?: string;
  assignedTeam?: string;
  notes?: string;
  tags?: string[];
}

export interface CaseFilter {
  debtorId?: string;
  creditorId?: string;
  status?: CaseStatus;
  priority?: CasePriority;
  assignedAgentId?: string;
  assignedTeam?: string;
}

export interface CaseStatusResponse {
  caseId: string;
  status: CaseStatus;
  canAcceptPayments: boolean;
  reason?: string;
}

// Helper type for case history entries
export interface CaseHistoryEntry {
  id: string;
  caseId: string;
  action: string;
  description: string;
  performedBy: string;
  performedAt: Date;
  metadata?: Record<string, any>;
}
