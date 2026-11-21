import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync } from 'node:crypto';

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

export function openDatabase(filename = ':memory:') {
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies(id),
      name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'foreman')),
      UNIQUE(id, company_id)
    );
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies(id),
      foreman_id INTEGER NOT NULL, date TEXT NOT NULL, site TEXT NOT NULL, notes TEXT NOT NULL,
      FOREIGN KEY(foreman_id, company_id) REFERENCES users(id, company_id)
    );
    CREATE INDEX IF NOT EXISTS reports_scope ON reports(company_id, foreman_id, date);
    CREATE TABLE IF NOT EXISTS time_entries (
      id INTEGER PRIMARY KEY, report_id INTEGER NOT NULL REFERENCES reports(id),
      worker_name TEXT NOT NULL, hundredths INTEGER NOT NULL CHECK(hundredths BETWEEN 0 AND 2400)
    );
    CREATE INDEX IF NOT EXISTS entries_report ON time_entries(report_id);
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
      expires_at INTEGER NOT NULL
    );
  `);
  return db;
}

export function seedDemo(db: DatabaseSync) {
  // Les identifiants de démonstration ne sont jamais activés implicitement.
  db.exec('BEGIN');
  try {
    db.prepare('INSERT OR IGNORE INTO companies(id, name) VALUES (?, ?)').run(1, 'Entreprise A');
    db.prepare('INSERT OR IGNORE INTO companies(id, name) VALUES (?, ?)').run(2, 'Entreprise B');
    const insert = db.prepare(`INSERT OR IGNORE INTO users
      (company_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)`);
    for (const [company, suffix] of [[1, 'a'], [2, 'b']] as const) {
      for (const role of ['admin', 'foreman'] as const) {
        insert.run(company, `${role} ${suffix.toUpperCase()}`, `${role}.${suffix}@example.com`,
          hashPassword('Demo-chantier-2026!'), role);
      }
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
