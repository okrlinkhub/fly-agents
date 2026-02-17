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

  test("touch activity removes machine from idle candidates", async () => {
    const t = initConvexTest();
    const now = Date.now();
    const machineDocId = await t.mutation(internal.storage.insertMachineRecord, {
      userId: "user2",
      tenantId: "tenant-2",
      status: "running",
      allowedSkills: ["linkhub-bridge"],
      memoryMB: 1024,
      appKey: "linkhub-w4",
      bridgeUrl: "https://linkhub-w4.convex.site",
      serviceId: "svc-2",
      serviceKey: "secret-2",
      region: "iad",
      lastActivityAt: now - 40 * 60_000,
      lifecycleMode: "running",
    });
    await t.mutation(internal.storage.patchMachineRecord, {
      machineDocId,
      machineId: "machine-1",
      flyVolumeId: "vol-1",
    });

    const staleBefore = await t.query(internal.storage.listStaleRunningMachines, {
      cutoffMs: now - 30 * 60_000,
    });
    expect(staleBefore.map((m) => m._id)).toContain(machineDocId);

    await t.mutation(api.lib.touchAgentActivity, { machineDocId });

    const staleAfter = await t.query(internal.storage.listStaleRunningMachines, {
      cutoffMs: now - 30 * 60_000,
    });
    expect(staleAfter.map((m) => m._id)).not.toContain(machineDocId);
  });
});
