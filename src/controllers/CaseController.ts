/**
 * Case Controller
 *
 * REST API endpoints for case management.
 *
 * Endpoints:
 * - GET /api/cases - List cases with filters
 * - GET /api/cases/:id - Get case by ID
 * - GET /api/cases/:id/status - Get case status (lightweight)
 * - POST /api/cases - Create new case
 * - PATCH /api/cases/:id - Update case
 * - POST /api/cases/:id/payments - Record payment
 * - GET /api/cases/:id/history - Get case history
 */

import { Request, Response } from 'express';
import { caseService } from '../services/CaseService';
import { CaseFilter, CreateCaseDto, UpdateCaseDto, CaseStatus, CasePriority } from '../models/Case';

export class CaseController {
  /**
   * GET /api/cases
   */
  async getCases(req: Request, res: Response): Promise<void> {
    try {
      const filter: CaseFilter = {};

      if (req.query.debtorId) filter.debtorId = req.query.debtorId as string;
      if (req.query.creditorId) filter.creditorId = req.query.creditorId as string;
      if (req.query.status) filter.status = req.query.status as CaseStatus;
      if (req.query.priority) filter.priority = req.query.priority as CasePriority;
      if (req.query.assignedAgentId) filter.assignedAgentId = req.query.assignedAgentId as string;
      if (req.query.assignedTeam) filter.assignedTeam = req.query.assignedTeam as string;

      const cases = await caseService.getAllCases(filter);

      res.json({
        success: true,
        data: cases,
        meta: {
          total: cases.length,
          filters: filter,
        },
      });
    } catch (error) {
      console.error('[CaseController] Error fetching cases:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }

  /**
   * GET /api/cases/:id
   */
  async getCaseById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const caseData = await caseService.getCaseById(id);

      if (!caseData) {
        res.status(404).json({
          success: false,
          error: 'Case not found',
        });
        return;
      }

      res.json({
        success: true,
        data: caseData,
      });
    } catch (error) {
      console.error('[CaseController] Error fetching case:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }

  /**
   * GET /api/cases/:id/status
   *
   * Lightweight endpoint to check case status.
   * Used by payment-service before accepting payments.
   */
  async getCaseStatus(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const status = await caseService.getCaseStatus(id);

      if (!status) {
        res.status(404).json({
          success: false,
          error: 'Case not found',
        });
        return;
      }

      res.json({
        success: true,
        data: status,
      });
    } catch (error) {
      console.error('[CaseController] Error fetching case status:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }

  /**
   * POST /api/cases
   */
  async createCase(req: Request, res: Response): Promise<void> {
    try {
      const dto: CreateCaseDto = req.body;

      if (!dto.debtorId || !dto.creditorId || !dto.originalDebt || !dto.source) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: debtorId, creditorId, originalDebt, source',
        });
        return;
      }

      if (dto.originalDebt <= 0) {
        res.status(400).json({
          success: false,
          error: 'originalDebt must be greater than 0',
        });
        return;
      }

      const newCase = await caseService.createCase(dto);

      res.status(201).json({
        success: true,
        data: newCase,
      });
    } catch (error) {
      console.error('[CaseController] Error creating case:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }

  /**
   * PATCH /api/cases/:id
   */
  async updateCase(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const dto: UpdateCaseDto = req.body;

      // Validate status if provided
      if (dto.status && !Object.values(CaseStatus).includes(dto.status)) {
        res.status(400).json({
          success: false,
          error: 'Invalid status value',
        });
        return;
      }

      // Validate priority if provided
      if (dto.priority && !Object.values(CasePriority).includes(dto.priority)) {
        res.status(400).json({
          success: false,
          error: 'Invalid priority value',
        });
        return;
      }

      const updated = await caseService.updateCase(id, dto);

      if (!updated) {
        res.status(404).json({
          success: false,
          error: 'Case not found',
        });
        return;
      }

      res.json({
        success: true,
        data: updated,
      });
    } catch (error) {
      console.error('[CaseController] Error updating case:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }

  /**
   * POST /api/cases/:id/payments
   *
   * Record a payment against the case.
   * Called by payment-service after successful payment.
   */
  async recordPayment(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { paymentId, amount } = req.body;

      if (!paymentId || !amount) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: paymentId, amount',
        });
        return;
      }

      const updated = await caseService.recordPayment(id, paymentId, parseFloat(amount));

      if (!updated) {
        res.status(404).json({
          success: false,
          error: 'Case not found',
        });
        return;
      }

      res.json({
        success: true,
        data: {
          caseId: id,
          paymentRecorded: true,
          newBalance: updated.currentDebt,
          totalPaid: updated.paidAmount,
          status: updated.status,
        },
      });
    } catch (error) {
      console.error('[CaseController] Error recording payment:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }

  /**
   * GET /api/cases/:id/history
   */
  async getCaseHistory(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const history = await caseService.getCaseHistory(id);

      res.json({
        success: true,
        data: history,
        meta: {
          caseId: id,
          total: history.length,
        },
      });
    } catch (error) {
      console.error('[CaseController] Error fetching case history:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
}

export const caseController = new CaseController();
