import { action, mutation, query } from "./_generated/server.js";
import { components } from "./_generated/api.js";
import { exposeApi } from "@okrlinkhub/fly-agents";
import { v } from "convex/values";
import { Auth } from "convex/server";

export const provisionAgent = action({
  args: {
    userId: v.string(),
    tenantId: v.string(),
    flyApiToken: v.string(),
    flyAppName: v.string(),
    image: v.optional(v.string()),
    region: v.optional(v.string()),
    memoryMB: v.optional(v.number()),
    bridgeUrl: v.optional(v.string()),
    serviceId: v.optional(v.string()),
    serviceKey: v.optional(v.string()),
    appKey: v.optional(v.string()),
    openclawGatewayToken: v.optional(v.string()),
    allowedSkills: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    return await ctx.runAction(components.flyAgents.lib.provisionAgentMachine, args);
  },
});

export const listTenantMachines = query({
  args: { tenantId: v.string() },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    return await ctx.runQuery(components.flyAgents.lib.listAgentMachinesByTenant, {
      tenantId: args.tenantId,
    });
  },
});

export const updateSkills = mutation({
  args: { machineDocId: v.string(), allowedSkills: v.array(v.string()) },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    return await ctx.runMutation(components.flyAgents.lib.updateAllowedSkills, {
      machineDocId: args.machineDocId as never,
      allowedSkills: args.allowedSkills,
    });
  },
});

export const {
  listAgentMachinesByTenant,
  getAgentMachine,
  updateAllowedSkills,
  provisionAgentMachine,
  startAgentMachine,
  stopAgentMachine,
  deprovisionAgentMachine,
} = exposeApi(components.flyAgents, {
  auth: async (ctx, operation) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null && operation.type !== "list") {
      throw new Error("Unauthorized");
    }
    return userId;
  },
});

async function getAuthUserId(ctx: { auth: Auth }) {
  return (await ctx.auth.getUserIdentity())?.subject ?? "anonymous";
}

/**
 * List comments for a given target ID.
 */
export const list = query({
  args: { targetId: v.string() },
  returns: v.array(
    v.object({
      _id: v.id("comments"),
      _creationTime: v.number(),
      text: v.string(),
      targetId: v.string(),
      translatedText: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("comments")
      .withIndex("by_targetId", (q) => q.eq("targetId", args.targetId))
      .order("desc")
      .collect();
  },
});

/**
 * Add a comment to a target.
 */
export const add = mutation({
  args: {
    text: v.string(),
    targetId: v.string(),
  },
  returns: v.id("comments"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("comments", {
      text: args.text,
      targetId: args.targetId,
    });
  },
});

/**
 * Translate a comment to pirate talk.
 */
export const translateComment = mutation({
  args: { commentId: v.id("comments") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const comment = await ctx.db.get(args.commentId);
    if (!comment) {
      throw new Error("Comment not found");
    }

    // Simple pirate talk translation
    const pirateText =
      comment.text
        .replace(/\bhello\b/gi, "ahoy")
        .replace(/\bhi\b/gi, "ahoy")
        .replace(/\byou\b/gi, "ye")
        .replace(/\byour\b/gi, "yer")
        .replace(/\byou're\b/gi, "ye're")
        .replace(/\bis\b/gi, "be")
        .replace(/\bare\b/gi, "be")
        .replace(/\bthe\b/gi, "th'")
        .replace(/\band\b/gi, "an'") + " 🏴‍☠️";

    await ctx.db.patch(args.commentId, {
      translatedText: pirateText,
    });

    return null;
  },
});
