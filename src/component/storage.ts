import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server.js";
import schema from "./schema.js";

const machineStatusValidator = v.union(
  v.literal("provisioning"),
  v.literal("running"),
  v.literal("stopped"),
  v.literal("hibernated"),
  v.literal("error"),
  v.literal("deleted"),
);

const machineRecordValidator = schema.tables.agentMachines.validator.extend({
  _id: v.id("agentMachines"),
  _creationTime: v.number(),
});

const secretRecordValidator = schema.tables.agentVmSecrets.validator.extend({
  _id: v.id("agentVmSecrets"),
  _creationTime: v.number(),
});

export const getMachineRecord = internalQuery({
  args: { machineDocId: v.id("agentMachines") },
  returns: v.union(v.null(), machineRecordValidator),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.machineDocId);
  },
});

export const insertMachineRecord = internalMutation({
  args: {
    userId: v.string(),
    tenantId: v.string(),
    status: machineStatusValidator,
    allowedSkills: v.array(v.string()),
    memoryMB: v.number(),
    appKey: v.string(),
    bridgeUrl: v.string(),
    serviceId: v.string(),
    serviceKey: v.string(),
    region: v.string(),
    lastActivityAt: v.optional(v.number()),
    lifecycleMode: v.optional(v.union(v.literal("running"), v.literal("hibernated"))),
  },
  returns: v.id("agentMachines"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("agentMachines", args);
  },
});

export const patchMachineRecord = internalMutation({
  args: {
    machineDocId: v.id("agentMachines"),
    status: v.optional(machineStatusValidator),
    machineId: v.optional(v.string()),
    flyVolumeId: v.optional(v.string()),
    lastWakeAt: v.optional(v.number()),
    lastActivityAt: v.optional(v.number()),
    lifecycleMode: v.optional(v.union(v.literal("running"), v.literal("hibernated"))),
    latestSnapshotId: v.optional(v.id("agentSnapshots")),
    lastError: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { machineDocId, ...updates } = args;
    await ctx.db.patch(machineDocId, updates);
    return null;
  },
});

const snapshotStatusValidator = v.union(
  v.literal("created"),
  v.literal("restored"),
  v.literal("failed"),
);

export const getLatestMachineByUserTenant = internalQuery({
  args: {
    userId: v.string(),
    tenantId: v.string(),
  },
  returns: v.union(v.null(), machineRecordValidator),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("agentMachines")
      .withIndex("by_userId_and_tenantId", (q) =>
        q.eq("userId", args.userId).eq("tenantId", args.tenantId),
      )
      .order("desc")
      .take(1);
    return rows[0] ?? null;
  },
});

export const getLatestSnapshotByAgentKey = internalQuery({
  args: { agentKey: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("agentSnapshots"),
      _creationTime: v.number(),
      agentKey: v.string(),
      machineDocId: v.optional(v.id("agentMachines")),
      tenantId: v.string(),
      userId: v.string(),
      status: snapshotStatusValidator,
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
    }),
  ),
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("agentSnapshots")
      .withIndex("by_agentKey_createdAt", (q) => q.eq("agentKey", args.agentKey))
      .order("desc")
      .take(1);
    return entries[0] ?? null;
  },
});

export const insertAgentSnapshot = internalMutation({
  args: {
    agentKey: v.string(),
    machineDocId: v.optional(v.id("agentMachines")),
    tenantId: v.string(),
    userId: v.string(),
    status: snapshotStatusValidator,
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
  },
  returns: v.id("agentSnapshots"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("agentSnapshots", args);
  },
});

export const patchAgentSnapshot = internalMutation({
  args: {
    snapshotId: v.id("agentSnapshots"),
    status: v.optional(snapshotStatusValidator),
    restoreInfo: v.optional(
      v.object({
        restoredMachineDocId: v.id("agentMachines"),
        restoredMachineId: v.string(),
        restoredAt: v.number(),
      }),
    ),
    lastError: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { snapshotId, ...updates } = args;
    await ctx.db.patch(snapshotId, updates);
    return null;
  },
});

export const getAgentSecretsRecord = internalQuery({
  args: {
    agentKey: v.string(),
  },
  returns: v.union(v.null(), secretRecordValidator),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentVmSecrets")
      .withIndex("by_agentKey", (q) => q.eq("agentKey", args.agentKey))
      .unique();
  },
});

export const upsertAgentSecretsRecord = internalMutation({
  args: {
    agentKey: v.string(),
    tenantId: v.string(),
    userId: v.string(),
    flyApiTokenEnc: v.optional(v.string()),
    llmApiKeyEnc: v.optional(v.string()),
    openaiApiKeyEnc: v.optional(v.string()),
    telegramBotTokenEnc: v.optional(v.string()),
    openclawGatewayTokenEnc: v.optional(v.string()),
    updatedAt: v.number(),
  },
  returns: v.id("agentVmSecrets"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("agentVmSecrets")
      .withIndex("by_agentKey", (q) => q.eq("agentKey", args.agentKey))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }
    return await ctx.db.insert("agentVmSecrets", args);
  },
});

export const clearAgentSecretsRecord = internalMutation({
  args: {
    agentKey: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("agentVmSecrets")
      .withIndex("by_agentKey", (q) => q.eq("agentKey", args.agentKey))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return null;
  },
});
