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
