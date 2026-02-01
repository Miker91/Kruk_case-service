import { Router } from 'express';
import { caseController } from '../controllers/CaseController';

const router = Router();

// GET /api/cases - List cases with optional filters
router.get('/cases', (req, res) => caseController.getCases(req, res));

// GET /api/cases/:id - Get case by ID
router.get('/cases/:id', (req, res) => caseController.getCaseById(req, res));

// GET /api/cases/:id/status - Get case status (lightweight)
router.get('/cases/:id/status', (req, res) => caseController.getCaseStatus(req, res));

// POST /api/cases - Create new case
router.post('/cases', (req, res) => caseController.createCase(req, res));

// PATCH /api/cases/:id - Update case
router.patch('/cases/:id', (req, res) => caseController.updateCase(req, res));

// POST /api/cases/:id/payments - Record payment
router.post('/cases/:id/payments', (req, res) => caseController.recordPayment(req, res));

// GET /api/cases/:id/history - Get case history
router.get('/cases/:id/history', (req, res) => caseController.getCaseHistory(req, res));

export default router;
