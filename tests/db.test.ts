import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, expect, it } from "vitest";

// Never touch ./data: point the DB at a temp dir before lib/db is loaded.
const dir = (process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "db-test-")));
const dbm = await import("@/lib/db");
afterAll(() => {
  dbm.db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

it("migrate is idempotent (parallel build workers race on a fresh DB)", () => {
  // open() already migrated once; every ALTER now hits "duplicate column name".
  expect(() => dbm.migrate(dbm.db)).not.toThrow();
  expect(() => dbm.migrate(dbm.db)).not.toThrow();
  const cols = (dbm.db.prepare("PRAGMA table_info(projects)").all() as { name: string }[]).map((c) => c.name);
  expect(cols.filter((c) => c === "volume")).toHaveLength(1);
});
