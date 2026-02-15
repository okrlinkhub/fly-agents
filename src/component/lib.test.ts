/// <reference types="vite/client" />

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api.js";
import { initConvexTest } from "./setup.test.js";

describe("component lib", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  test("list and update skills", async () => {
    const t = initConvexTest();
    const machineDocId = await t.mutation(internal.storage.insertMachineRecord, {
      userId: "user1",
      tenantId: "tenant-1",
      status: "running",
      allowedSkills: ["linkhub-bridge"],
      memoryMB: 512,
      appKey: "linkhub-w4",
      bridgeUrl: "https://linkhub-w4.convex.site",
      serviceId: "svc-1",
      serviceKey: "secret-1",
      region: "iad",
    });
    expect(machineDocId).toBeDefined();

    const machines = await t.query(api.lib.listAgentMachinesByTenant, {
      tenantId: "tenant-1",
    });
    expect(machines).toHaveLength(1);
    expect(machines[0].allowedSkills).toEqual(["linkhub-bridge"]);

    await t.mutation(api.lib.updateAllowedSkills, {
      machineDocId,
      allowedSkills: ["linkhub-bridge", "calendar-helper"],
    });
    const updated = await t.query(api.lib.getAgentMachine, { machineDocId });
    expect(updated?.allowedSkills).toEqual(["linkhub-bridge", "calendar-helper"]);
  });
});
