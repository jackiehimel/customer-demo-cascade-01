import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEMO_ROLE_COOKIE,
  buildDemoRoleSetCookie,
  extractDemoRole,
  isDemoRole,
  parseDemoRoleFromRequest,
} from "../session.ts";

test("isDemoRole accepts only the two known demo roles", () => {
  assert.equal(isDemoRole("administrator"), true);
  assert.equal(isDemoRole("advisor"), true);
  assert.equal(isDemoRole("superadmin"), false);
  assert.equal(isDemoRole(undefined), false);
  assert.equal(isDemoRole(42), false);
});

test("parseDemoRoleFromRequest reads the demo-role cookie from the Cookie header", () => {
  const request = new Request("http://localhost/api/session/role", {
    headers: { cookie: `${DEMO_ROLE_COOKIE}=advisor` },
  });
  assert.equal(parseDemoRoleFromRequest(request), "advisor");
});

test("parseDemoRoleFromRequest returns null when no cookie header is present", () => {
  const request = new Request("http://localhost/api/session/role");
  assert.equal(parseDemoRoleFromRequest(request), null);
});

test("parseDemoRoleFromRequest returns null for an unrecognized role value", () => {
  const request = new Request("http://localhost/api/session/role", {
    headers: { cookie: `${DEMO_ROLE_COOKIE}=superadmin` },
  });
  assert.equal(parseDemoRoleFromRequest(request), null);
});

test("parseDemoRoleFromRequest returns null for a malformed percent-encoded cookie value instead of throwing", () => {
  const request = new Request("http://localhost/api/session/role", {
    headers: { cookie: `${DEMO_ROLE_COOKIE}=%zz` },
  });
  assert.equal(parseDemoRoleFromRequest(request), null);
});

test("parseDemoRoleFromRequest finds the demo-role cookie among several cookies", () => {
  const request = new Request("http://localhost/api/session/role", {
    headers: { cookie: `other=1; ${DEMO_ROLE_COOKIE}=administrator; another=2` },
  });
  assert.equal(parseDemoRoleFromRequest(request), "administrator");
});

test("buildDemoRoleSetCookie produces a Path=/ SameSite=Lax cookie for the given role", () => {
  const header = buildDemoRoleSetCookie("administrator");
  assert.match(header, new RegExp(`^${DEMO_ROLE_COOKIE}=administrator`));
  assert.match(header, /Path=\//);
  assert.match(header, /SameSite=Lax/);
});

test("extractDemoRole narrows a raw cookie value, defaulting to null", () => {
  assert.equal(extractDemoRole("advisor"), "advisor");
  assert.equal(extractDemoRole("bogus"), null);
  assert.equal(extractDemoRole(undefined), null);
});
