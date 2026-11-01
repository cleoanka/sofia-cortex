import { openDatabaseSync, type SQLiteBindValue } from 'expo-sqlite';
import { CortexEngine } from '../engine/CortexEngine';
import type { SqlDriver } from '../engine/types';
import { seedShowcase } from '../engine/seed';

let engine: CortexEngine | null = null;

function expoDriver(name: string): SqlDriver {
  const db = openDatabaseSync(name);
  return {
    exec: (sql) => db.execSync(sql),
    run: (sql, params = []) => void db.runSync(sql, params as SQLiteBindValue[]),
    all: <T,>(sql: string, params: readonly unknown[] = []) => db.getAllSync<T>(sql, params as SQLiteBindValue[]),
    transaction: (fn) => db.withTransactionSync(fn),
  };
}

/** Synchronous boot: open WAL db, hydrate the in-memory mirror, seed on first launch. */
export function getEngine(): CortexEngine {
  if (engine) return engine;
  engine = new CortexEngine(expoDriver('cortex.db'));
  if (engine.meta('seeded') !== '1') {
    seedShowcase(engine);
    engine.clearHistory();
    engine.setMeta('seeded', '1');
  }
  // Leftovers from the soft-delete era, and the old link syntax, are cleaned once.
  if (engine.meta('syntax') !== '2') {
    engine.purgeTrash(0);
    engine.migrateSyntax();
    engine.setMeta('syntax', '2');
  }
  return engine;
}
