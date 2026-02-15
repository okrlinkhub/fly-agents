"use node";

import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server.js";
import schema from "./schema.js";

const machineStatusValidator = v.union(
  v.literal("provisioning"),
  v.literal("running"),
  v.literal("stopped"),
  v.literal("error"),
  v.literal("deleted"),
);

const machineRecordValidator = schema.tables.agentMachines.validator.extend({
  _id: v.id("agentMachines"),
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
    lastError: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { machineDocId, ...updates } = args;
    await ctx.db.patch(machineDocId, updates);
    return null;
  },
});
