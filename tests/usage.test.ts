import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, expect, it } from "vitest";

// Point the DB at a temp dir before lib is loaded, so the test never touches ./data.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "usage-test-"));
const dbm = await import("@/lib/db");
const u = await import("@/lib/usage");
afterAll(() => {
  dbm.db.close();
  fs.rmSync(process.env.DATA_DIR!, { recursive: true, force: true });
});

it("tracks characters per project", () => {
  u.recordUsage(100, "proj-a");
  u.recordUsage(50, "proj-a");
  u.recordUsage(30, "proj-b");
  u.recordUsage(40); // no project (e.g. ad-hoc test voice) -> daily only

  const a = new Date();
  const b = new Date(a.getTime() + 86_400_000); // tomorrow, exclusive
  const m = u.projectUsage(a, b);
  expect(m.get("proj-a")).toBe(150);
  expect(m.get("proj-b")).toBe(30);
  expect(m.has("")).toBe(false);
  // the daily total still includes the unattributed 40
  expect(u.localUsage(a, b)).toBe(150 + 30 + 40);
});

it("ignores empty usage", () => {
  u.recordUsage(0, "proj-x");
  u.recordUsage(-5, "proj-x");
  expect(u.projectUsage(new Date(), new Date()).get("proj-x")).toBeUndefined();
});
