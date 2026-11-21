import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createApp } from './app.js';
import { openDatabase, seedDemo } from './database.js';

const filename = process.env.DB_PATH ?? './data/reports.sqlite';
mkdirSync(dirname(filename), { recursive: true });
const db = openDatabase(filename);
if (process.env.SEED_DEMO === 'true') seedDemo(db);
const port = Number(process.env.PORT ?? 3000);
const server = createApp(db).listen(port, '0.0.0.0', () => console.log(`API sur le port ${port}`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
