import { Database } from 'bun:sqlite';
import type { SqlDriver } from '../src/engine/types';

export function memoryDriver(path = ':memory:'): SqlDriver & { raw: Database } {
  const db = new Database(path);
  return {
    raw: db,
    exec: (sql) => db.exec(sql),
    run: (sql, params = []) => void db.prepare(sql).run(...(params as never[])),
    all: <T,>(sql: string, params: readonly unknown[] = []) => db.prepare(sql).all(...(params as never[])) as T[],
    transaction: (fn) => db.transaction(fn)(),
  };
}
