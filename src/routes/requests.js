import { Router } from 'express';
import { randomUUID } from 'crypto';

const router = Router();
const db = []; // swap for Postgres/Supabase later

const TYPES = ['official', 'unofficial'];
const DELIVERY = ['pickup', 'email'];
const FLOW = {
  submitted: ['under_review'],
  under_review: ['approved', 'rejected'],
  approved: ['issued'],
  rejected: [],
  issued: [],
};

const fail = (res, status, code, message, details) =>
  res.status(status).json({ success: false, error: { code, message, ...(details && { details }) } });

function validateCreate(b) {
  const errors = [];
  if (!/^[A-Za-z0-9\/-]{5,20}$/.test(b.studentNumber ?? '')) errors.push('studentNumber must be 5-20 chars (letters, digits, / or -)');
  if (typeof b.fullName !== 'string' || b.fullName.trim().length < 3) errors.push('fullName must be at least 3 characters');
  if (!/^\S+@\S+\.\S+$/.test(b.email ?? '')) errors.push('email is invalid');
  if (typeof b.program !== 'string' || !b.program.trim()) errors.push('program is required');
  if (!TYPES.includes(b.type)) errors.push(`type must be one of: ${TYPES.join(', ')}`);
  if (!Number.isInteger(b.copies) || b.copies < 1 || b.copies > 5) errors.push('copies must be an integer between 1 and 5');
  if (!DELIVERY.includes(b.deliveryMethod)) errors.push(`deliveryMethod must be one of: ${DELIVERY.join(', ')}`);
  return errors;
}

// CREATE
router.post('/', (req, res) => {
  const errors = validateCreate(req.body);
  if (errors.length) return fail(res, 400, 'VALIDATION_ERROR', 'Invalid request data', errors);

  const open = db.find(r => r.studentNumber === req.body.studentNumber && r.type === req.body.type && !['rejected', 'issued'].includes(r.status));
  if (open) return fail(res, 409, 'DUPLICATE_REQUEST', 'An open request of this type already exists for this student');

  const { studentNumber, fullName, email, program, type, copies, deliveryMethod } = req.body;
  const record = {
    id: randomUUID(), studentNumber, fullName: fullName.trim(), email, program, type, copies, deliveryMethod,
    status: 'submitted', history: [{ status: 'submitted', at: new Date().toISOString(), note: 'Request created' }],
    createdAt: new Date().toISOString(),
  };
  db.push(record);
  res.status(201).json({ success: true, data: record });
});

// LIST (filter by ?status=&studentNumber=)
router.get('/', (req, res) => {
  const { status, studentNumber } = req.query;
  let out = db;
  if (status) out = out.filter(r => r.status === status);
  if (studentNumber) out = out.filter(r => r.studentNumber === studentNumber);
  res.json({ success: true, count: out.length, data: out });
});

// GET ONE
router.get('/:id', (req, res) => {
  const r = db.find(x => x.id === req.params.id);
  if (!r) return fail(res, 404, 'NOT_FOUND', 'Transcript request not found');
  res.json({ success: true, data: r });
});

// UPDATE STATUS (registrar)
router.patch('/:id/status', (req, res) => {
  const r = db.find(x => x.id === req.params.id);
  if (!r) return fail(res, 404, 'NOT_FOUND', 'Transcript request not found');

  const { status, note } = req.body;
  if (!Object.keys(FLOW).includes(status)) return fail(res, 400, 'VALIDATION_ERROR', `status must be one of: ${Object.keys(FLOW).join(', ')}`);
  if (!FLOW[r.status].includes(status)) return fail(res, 422, 'INVALID_TRANSITION', `Cannot move from '${r.status}' to '${status}'`);
  if (status === 'rejected' && !note) return fail(res, 400, 'VALIDATION_ERROR', 'A note is required when rejecting');

  r.status = status;
  r.history.push({ status, at: new Date().toISOString(), note: note ?? '' });
  res.json({ success: true, data: r });
});

// CANCEL (only while submitted)
router.delete('/:id', (req, res) => {
  const i = db.findIndex(x => x.id === req.params.id);
  if (i === -1) return fail(res, 404, 'NOT_FOUND', 'Transcript request not found');
  if (db[i].status !== 'submitted') return fail(res, 422, 'NOT_CANCELLABLE', 'Only submitted requests can be cancelled');
  db.splice(i, 1);
  res.status(204).send();
});

export default router;