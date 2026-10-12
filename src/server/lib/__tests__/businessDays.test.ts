import assert from "node:assert/strict";
import { test } from "node:test";
import { addBusinessDays } from "../businessDays.ts";

test("addBusinessDays skips a weekend when crossing Friday into the next week", () => {
  // 2030-01-10 is a Thursday.
  const start = new Date("2030-01-10T09:00:00.000Z");
  // +1 business day -> Friday 2030-01-11.
  // +2 business days -> skips Sat/Sun -> Monday 2030-01-14.
  // +3 business days -> Tuesday 2030-01-15.
  const result = addBusinessDays(start, 3);
  assert.equal(result.toISOString(), "2030-01-15T09:00:00.000Z");
});

test("addBusinessDays never lands on a Saturday or Sunday", () => {
  const start = new Date("2030-01-07T09:00:00.000Z"); // Monday
  for (let n = 1; n <= 10; n += 1) {
    const result = addBusinessDays(start, n);
    const day = result.getUTCDay();
    assert.notEqual(day, 0, `n=${n} landed on a Sunday`);
    assert.notEqual(day, 6, `n=${n} landed on a Saturday`);
  }
});

test("addBusinessDays(date, 0) returns the same instant", () => {
  const start = new Date("2030-01-07T09:00:00.000Z");
  const result = addBusinessDays(start, 0);
  assert.equal(result.toISOString(), start.toISOString());
});

test("addBusinessDays never mutates the input date", () => {
  const start = new Date("2030-01-07T09:00:00.000Z");
  const startIso = start.toISOString();
  addBusinessDays(start, 5);
  assert.equal(start.toISOString(), startIso);
});

test("addBusinessDays rejects negative or non-integer n", () => {
  const start = new Date("2030-01-07T09:00:00.000Z");
  assert.throws(() => addBusinessDays(start, -1));
  assert.throws(() => addBusinessDays(start, 1.5));
});
