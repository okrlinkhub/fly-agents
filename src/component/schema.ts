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
      v.literal("error"),
      v.literal("deleted"),
    ),
    allowedSkills: v.array(v.string()),
    memoryMB: v.number(),
    appKey: v.string(),
    bridgeUrl: v.string(),
    serviceId: v.string(),
    serviceKey: v.string(),
    region: v.string(),
    lastWakeAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
  })
    .index("by_tenantId", ["tenantId"])
    .index("by_machineId", ["machineId"])
    .index("by_userId_and_tenantId", ["userId", "tenantId"]),
});
