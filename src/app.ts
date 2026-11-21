import express, { type ErrorRequestHandler } from 'express';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { hashPassword } from './database.js';

type User = { id: number; company_id: number; role: 'admin' | 'foreman' };
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const loginInput = z.object({
  email: z.string().trim().email().max(254).transform(value => value.toLowerCase()),
  password: z.string().min(1).max(256),
}).strict();
const reportInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Date inexistante'),
  site: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(5000).default(''),
  entries: z.array(z.object({
    workerName: z.string().trim().min(1).max(120),
    hours: z.number().finite().min(0).max(24).refine(
      value => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8,
      'Deux décimales maximum'),
  }).strict()).min(1).max(100),
}).strict();

export function createApp(db: DatabaseSync) {
  const app = express();
  const dummyHash = hashPassword('unused-password');
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));

  app.post('/login', (req, res) => {
    const input = loginInput.safeParse(req.body);
    if (!input.success) { res.status(400).json({ error: 'Identifiants mal formés' }); return; }
    const user = db.prepare('SELECT id, password_hash FROM users WHERE email = ?')
      .get(input.data.email) as { id: number; password_hash: string } | undefined;
    // Même calcul coûteux pour un courriel inconnu : limite les différences de temps.
    const [salt, stored] = (user?.password_hash ?? dummyHash).split(':');
    const matches = timingSafeEqual(Buffer.from(stored, 'hex'), scryptSync(input.data.password, salt, 64));
    if (!user || !matches) { res.status(401).json({ error: 'Identifiants invalides' }); return; }
    const token = randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 60 * 60 * 1000;
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
    db.prepare('INSERT INTO sessions(token_hash, user_id, expires_at) VALUES (?, ?, ?)')
      .run(tokenHash(token), user.id, expiresAt);
    res.set('Cache-Control', 'no-store').json({ token, expiresAt: new Date(expiresAt).toISOString() });
  });

  app.use((req, res, next) => {
    const match = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization ?? '');
    const user = match ? db.prepare(`SELECT u.id, u.company_id, u.role FROM sessions s
      JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`)
      .get(tokenHash(match[1]), Date.now()) as User | undefined : undefined;
    if (!user) { res.status(401).json({ error: 'Jeton absent, invalide ou expiré' }); return; }
    res.locals.user = user;
    res.set('Cache-Control', 'no-store');
    next();
  });

  app.post('/reports', (req, res) => {
    const user = res.locals.user as User;
    if (user.role !== 'foreman') { res.status(403).json({ error: 'Réservé aux contremaîtres' }); return; }
    const input = reportInput.safeParse(req.body);
    if (!input.success) { res.status(400).json({ error: 'Rapport invalide', details: input.error.flatten() }); return; }
    const { date, site, notes, entries } = input.data;
    db.exec('BEGIN');
    try {
      const result = db.prepare(`INSERT INTO reports(company_id, foreman_id, date, site, notes)
        VALUES (?, ?, ?, ?, ?)`).run(user.company_id, user.id, date, site, notes);
      const reportId = Number(result.lastInsertRowid);
      const insert = db.prepare('INSERT INTO time_entries(report_id, worker_name, hundredths) VALUES (?, ?, ?)');
      for (const entry of entries) insert.run(reportId, entry.workerName, Math.round(entry.hours * 100));
      db.exec('COMMIT');
      res.status(201).location(`/reports/${reportId}`).json({ id: reportId });
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  });

  app.get('/reports', (_req, res) => {
    const user = res.locals.user as User;
    const reports = db.prepare(`SELECT id, company_id AS companyId, foreman_id AS foremanId,
      date, site, notes FROM reports WHERE company_id = ? AND (? = 'admin' OR foreman_id = ?)
      ORDER BY date DESC, id DESC`).all(user.company_id, user.role, user.id);
    res.json(reports);
  });

  app.get('/reports/:id', (req, res) => {
    if (!/^[1-9]\d*$/.test(req.params.id) || !Number.isSafeInteger(Number(req.params.id))) {
      res.status(400).json({ error: 'Identifiant invalide' }); return;
    }
    const user = res.locals.user as User;
    const report = db.prepare(`SELECT id, company_id AS companyId, foreman_id AS foremanId,
      date, site, notes FROM reports WHERE id = ? AND company_id = ?
      AND (? = 'admin' OR foreman_id = ?)`).get(Number(req.params.id), user.company_id, user.role, user.id);
    if (!report) { res.status(404).json({ error: 'Rapport introuvable' }); return; }
    // On lit les lignes seulement après avoir autorisé l'accès au rapport parent.
    const rows = db.prepare(`SELECT id, worker_name AS workerName, hundredths
      FROM time_entries WHERE report_id = ? ORDER BY id`).all(Number(req.params.id)) as
      { id: number; workerName: string; hundredths: number }[];
    res.json({ ...report, entries: rows.map(row => ({ id: row.id, workerName: row.workerName,
      hours: row.hundredths / 100 })), totalHours: rows.reduce((sum, row) => sum + row.hundredths, 0) / 100 });
  });

  app.use((_req, res) => { res.status(404).json({ error: 'Route introuvable' }); });
  const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error.type === 'entity.parse.failed') { res.status(400).json({ error: 'JSON invalide' }); return; }
    if (error.type === 'entity.too.large') { res.status(413).json({ error: 'Requête trop volumineuse' }); return; }
    console.error('Erreur interne:', error.message);
    res.status(500).json({ error: 'Erreur interne' });
  };
  app.use(handleError);
  return app;
}
