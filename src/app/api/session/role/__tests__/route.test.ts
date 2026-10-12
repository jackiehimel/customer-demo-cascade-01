import assert from "node:assert/strict";
import { test } from "node:test";
import { DEMO_ROLE_COOKIE } from "../../../../../server/lib/session.ts";
import { GET, POST } from "../route.ts";

test("GET /api/session/role returns null when no role has been selected yet", async () => {
  const response = GET(new Request("http://localhost/api/session/role"));
  assert.equal(response.status, 200);
  const body = (await response.json()) as { role: string | null };
  assert.equal(body.role, null);
});

test("GET /api/session/role reflects the current demo-role cookie", async () => {
  const request = new Request("http://localhost/api/session/role", {
    headers: { cookie: `${DEMO_ROLE_COOKIE}=advisor` },
  });
  const response = GET(request);
  assert.equal(response.status, 200);
  const body = (await response.json()) as { role: string | null };
  assert.equal(body.role, "advisor");
});

test("POST /api/session/role sets the demo-role cookie to administrator", async () => {
  const request = new Request("http://localhost/api/session/role", {
    method: "POST",
    body: JSON.stringify({ role: "administrator" }),
  });
  const response = await POST(request);
  assert.equal(response.status, 200);
  const body = (await response.json()) as { role: string };
  assert.equal(body.role, "administrator");

  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie);
  assert.match(setCookie!, new RegExp(`^${DEMO_ROLE_COOKIE}=administrator`));
});

test("POST /api/session/role sets the demo-role cookie to advisor", async () => {
  const request = new Request("http://localhost/api/session/role", {
    method: "POST",
    body: JSON.stringify({ role: "advisor" }),
  });
  const response = await POST(request);
  assert.equal(response.status, 200);
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie);
  assert.match(setCookie!, new RegExp(`^${DEMO_ROLE_COOKIE}=advisor`));
});

test("POST /api/session/role rejects an invalid role", async () => {
  const request = new Request("http://localhost/api/session/role", {
    method: "POST",
    body: JSON.stringify({ role: "superadmin" }),
  });
  const response = await POST(request);
  assert.equal(response.status, 400);
  const body = (await response.json()) as { error: string };
  assert.ok(body.error.length > 0);
});

test("POST /api/session/role rejects a missing role", async () => {
  const request = new Request("http://localhost/api/session/role", {
    method: "POST",
    body: JSON.stringify({}),
  });
  const response = await POST(request);
  assert.equal(response.status, 400);
});

test("POST /api/session/role returns 400 for malformed JSON", async () => {
  const request = new Request("http://localhost/api/session/role", {
    method: "POST",
    body: "not json",
  });
  const response = await POST(request);
  assert.equal(response.status, 400);
});
