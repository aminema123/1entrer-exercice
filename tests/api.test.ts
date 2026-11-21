import { beforeEach, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { openDatabase, seedDemo, hashPassword } from '../src/database.js';

let db: ReturnType<typeof openDatabase>;
let app: ReturnType<typeof createApp>;
const password = 'Demo-chantier-2026!';
const report = { date: '2026-11-19', site: 'École du quartier', notes: 'Coffrage',
  entries: [{ workerName: 'Samir', hours: 7.25 }, { workerName: 'Julie', hours: 0.1 }] };
beforeEach(() => { db = openDatabase(); seedDemo(db); app = createApp(db); });
afterEach(() => db.close());
async function login(email = 'foreman.a@example.com') {
  const response = await request(app).post('/login').send({ email, password }).expect(200);
  return response.body.token as string;
}
async function create(token: string) {
  const response = await request(app).post('/reports').auth(token, { type: 'bearer' }).send(report).expect(201);
  return response.body.id as number;
}

test('A ne peut lire un rapport de B, même avec son identifiant, admin compris', async () => {
  const b = await login('foreman.b@example.com');
  const id = await create(b);
  for (const email of ['foreman.a@example.com', 'admin.a@example.com']) {
    const token = await login(email);
    await request(app).get(`/reports/${id}`).auth(token, { type: 'bearer' }).expect(404);
    const list = await request(app).get('/reports').auth(token, { type: 'bearer' }).expect(200);
    assert.deepEqual(list.body, []);
  }
});
test('un contremaître ne voit pas un autre contremaître de sa propre entreprise', async () => {
  db.prepare(`INSERT INTO users(company_id,name,email,password_hash,role) VALUES(1,?,?,?,'foreman')`)
    .run('Deuxième contremaître', 'second.a@example.com', hashPassword(password));
  const first = await login();
  const second = await login('second.a@example.com');
  const firstId = await create(first);
  const secondId = await create(second);
  const list = await request(app).get('/reports').auth(first, { type: 'bearer' }).expect(200);
  assert.deepEqual(list.body.map((item: { id: number }) => item.id), [firstId]);
  await request(app).get(`/reports/${secondId}`).auth(first, { type: 'bearer' }).expect(404);
  const admin = await login('admin.a@example.com');
  const all = await request(app).get('/reports').auth(admin, { type: 'bearer' }).expect(200);
  assert.equal(all.body.length, 2);
  await request(app).get(`/reports/${secondId}`).auth(admin, { type: 'bearer' }).expect(200);
});
test('création, détail, total exact et rattachement serveur', async () => {
  const token = await login();
  const id = await create(token);
  const detail = await request(app).get(`/reports/${id}`).auth(token, { type: 'bearer' }).expect(200);
  assert.equal(detail.body.companyId, 1);
  assert.equal(detail.body.foremanId, db.prepare('SELECT id FROM users WHERE email = ?').get('foreman.a@example.com')!.id);
  assert.equal(detail.body.totalHours, 7.35);
  assert.equal(detail.body.entries.length, 2);
});
test('usurpation dans le corps refusée sans insertion', async () => {
  const token = await login();
  for (const extra of [{ companyId: 2 }, { foremanId: 4 }, { company_id: 2 }]) {
    await request(app).post('/reports').auth(token, { type: 'bearer' }).send({ ...report, ...extra }).expect(400);
  }
  assert.equal(db.prepare('SELECT count(*) AS n FROM reports').get()!.n, 0);
});
test('admin ne peut créer de rapport', async () => {
  await request(app).post('/reports').auth(await login('admin.a@example.com'), { type: 'bearer' }).send(report).expect(403);
});
test('validation des heures, dates et champs obligatoires', async () => {
  const token = await login();
  for (const invalid of [
    { ...report, date: '2026-02-30' }, { ...report, site: ' ' }, { ...report, entries: [] },
    ...[-1, 24.01, 1.001, '8'].map(hours => ({ ...report, entries: [{ workerName: 'Samir', hours }] })),
    { ...report, entries: [{ workerName: '', hours: 8 }] },
  ]) await request(app).post('/reports').auth(token, { type: 'bearer' }).send(invalid).expect(400);
  await request(app).post('/reports').auth(token, { type: 'bearer' }).send({ ...report,
    entries: [{ workerName: 'A', hours: 0 }, { workerName: 'B', hours: 24 }] }).expect(201);
});
test('jeton absent, falsifié ou expiré refusé', async () => {
  await request(app).get('/reports').expect(401);
  await request(app).post('/reports').send(report).expect(401);
  await request(app).get('/reports/1').expect(401);
  await request(app).get('/reports').auth('a'.repeat(64), { type: 'bearer' }).expect(401);
  const token = await login();
  db.prepare('UPDATE sessions SET expires_at = ?').run(Date.now() - 1);
  await request(app).get('/reports').auth(token, { type: 'bearer' }).expect(401);
});
test('mauvais mot de passe et utilisateur inconnu donnent la même erreur', async () => {
  for (const email of ['foreman.a@example.com', 'unknown@example.com']) {
    const response = await request(app).post('/login').send({ email, password: 'incorrect' }).expect(401);
    assert.equal(response.body.error, 'Identifiants invalides');
  }
  await request(app).post('/login').send({ email: 'invalide', password }).expect(400);
  const row = db.prepare('SELECT password_hash FROM users LIMIT 1').get()!;
  assert.notEqual(row.password_hash, password);
});
test('identifiant mal formé, rapport absent et JSON invalide', async () => {
  const token = await login();
  await request(app).get('/reports/1abc').auth(token, { type: 'bearer' }).expect(400);
  await request(app).get('/reports/999').auth(token, { type: 'bearer' }).expect(404);
  await request(app).post('/reports').auth(token, { type: 'bearer' }).set('Content-Type', 'application/json').send('{').expect(400);
});
test('transaction annulée si une ligne échoue en base', async () => {
  db.exec(`CREATE TRIGGER fail_entry BEFORE INSERT ON time_entries
    WHEN NEW.worker_name = 'Julie' BEGIN SELECT RAISE(ABORT, 'test rollback'); END;`);
  await request(app).post('/reports').auth(await login(), { type: 'bearer' }).send(report).expect(500);
  assert.equal(db.prepare('SELECT count(*) AS n FROM reports').get()!.n, 0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM time_entries').get()!.n, 0);
});
test('clé étrangère composite empêche un auteur rattaché à une autre entreprise', () => {
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get('foreman.b@example.com')!;
  assert.throws(() => db.prepare(`INSERT INTO reports(company_id,foreman_id,date,site,notes)
    VALUES(1,?,'2026-11-19','Test','')`).run(user.id));
});
test('seed relançable sans doublon', () => {
  seedDemo(db);
  assert.equal(db.prepare('SELECT count(*) AS n FROM users').get()!.n, 4);
});
