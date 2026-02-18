import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  agentMachines: defineTable({
    userId: v.string(),
    tenantId: v.string(),
    machineId: v.optional(v.string()),
    flyVolumeId: v.optional(v.string()),
    status: v.union(
      v.literal("provisioning"),
      v.literal("running"),
      v.literal("stopped"),
      v.literal("hibernated"),
      v.literal("error"),
      v.literal("deleted"),
    ),
    allowedSkills: v.array(v.string()),
    memoryMB: v.number(),
    appKey: v.string(),
    bridgeUrl: v.string(),
    serviceId: v.string(),
    serviceKey: v.string(),
    telegramTokenHash: v.optional(v.string()),
    region: v.string(),
    lastWakeAt: v.optional(v.number()),
    lastActivityAt: v.optional(v.number()),
    lifecycleMode: v.optional(v.union(v.literal("running"), v.literal("hibernated"))),
    latestSnapshotId: v.optional(v.id("agentSnapshots")),
    lastError: v.optional(v.string()),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_machineId", ["machineId"])
    .index("by_userId_and_tenantId", ["userId", "tenantId"]),
  agentSnapshots: defineTable({
    agentKey: v.string(),
    machineDocId: v.optional(v.id("agentMachines")),
    tenantId: v.string(),
    userId: v.string(),
    status: v.union(v.literal("created"), v.literal("restored"), v.literal("failed")),
    snapshotStorageId: v.optional(v.id("_storage")),
    flyVolumeSnapshotId: v.optional(v.string()),
    manifest: v.object({
      sourceMachineId: v.optional(v.string()),
      sourceFlyVolumeId: v.optional(v.string()),
      image: v.optional(v.string()),
      region: v.string(),
      llmModel: v.optional(v.string()),
      backupScope: v.literal("openclaw-state-plus-manifest"),
      backupCreatedAt: v.number(),
      notes: v.optional(v.string()),
    }),
    restoreInfo: v.optional(
      v.object({
        restoredMachineDocId: v.id("agentMachines"),
        restoredMachineId: v.string(),
        restoredAt: v.number(),
      }),
    ),
    lastError: v.optional(v.string()),
  }).index("by_agentKey_createdAt", ["agentKey"]),
});
