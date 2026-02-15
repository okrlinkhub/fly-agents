import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initConvexTest } from "./setup.test";
import { api } from "./_generated/api";

describe("example", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    vi.useRealTimers();
  });

  test("listTenantMachines returns empty list", async () => {
    const t = initConvexTest();
    const machines = await t.query(api.example.listTenantMachines, {
      tenantId: "tenant-1",
    });
    expect(machines).toHaveLength(0);
  });
});
