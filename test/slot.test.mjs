import { test } from "node:test";
import assert from "node:assert/strict";
import { runSlot } from "../scripts/lib/slot.mjs";

test("manhã BRT vira T08", () => {
  assert.deepEqual(runSlot(new Date("2026-10-31T08:04:00-03:00")), {
    runId: "2026-10-31T08", period: "manhã", nowBrt: "2026-10-31T08:04:00-03:00", expired: false,
  });
});

test("tarde/noite BRT vira T20, mesmo depois das 21h (dia seguinte em UTC)", () => {
  const s = runSlot(new Date("2026-11-02T01:30:00Z"));
  assert.equal(s.runId, "2026-11-01T20");
  assert.equal(s.period, "noite");
  assert.equal(s.nowBrt, "2026-11-01T22:30:00-03:00");
});

test("13h59 ainda é manhã; 14h já é noite", () => {
  assert.equal(runSlot(new Date("2026-11-03T13:59:00-03:00")).runId, "2026-11-03T08");
  assert.equal(runSlot(new Date("2026-11-03T14:00:00-03:00")).runId, "2026-11-03T20");
});

test("depois de 27/11 23h59 está expirado", () => {
  assert.equal(runSlot(new Date("2026-11-27T23:59:00-03:00")).expired, false);
  assert.equal(runSlot(new Date("2026-11-28T00:00:00-03:00")).expired, true);
});
