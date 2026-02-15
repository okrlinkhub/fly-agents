import {
  actionGeneric,
  mutationGeneric,
  queryGeneric,
} from "convex/server";
import type { Auth } from "convex/server";
import { v } from "convex/values";
import type { ComponentApi } from "../component/_generated/component.js";

export function exposeApi(
  component: ComponentApi,
  options: {
    auth: (
      ctx: { auth: Auth },
      operation:
        | { type: "list"; tenantId: string }
        | { type: "get"; machineDocId: string }
        | { type: "updateSkills"; machineDocId: string }
        | { type: "provision"; tenantId: string }
        | { type: "start"; machineDocId: string }
        | { type: "stop"; machineDocId: string }
        | { type: "deprovision"; machineDocId: string },
    ) => Promise<string>;
  },
) {
  return {
    listAgentMachinesByTenant: queryGeneric({
      args: { tenantId: v.string() },
      handler: async (ctx, args) => {
        await options.auth(ctx, { type: "list", tenantId: args.tenantId });
        return await ctx.runQuery(component.lib.listAgentMachinesByTenant, {
          tenantId: args.tenantId,
        });
      },
    }),
    getAgentMachine: queryGeneric({
      args: { machineDocId: v.string() },
      handler: async (ctx, args) => {
        await options.auth(ctx, { type: "get", machineDocId: args.machineDocId });
        return await ctx.runQuery(component.lib.getAgentMachine, {
          machineDocId: args.machineDocId as never,
        });
      },
    }),
    updateAllowedSkills: mutationGeneric({
      args: {
        machineDocId: v.string(),
        allowedSkills: v.array(v.string()),
      },
      handler: async (ctx, args) => {
        await options.auth(ctx, {
          type: "updateSkills",
          machineDocId: args.machineDocId,
        });
        return await ctx.runMutation(component.lib.updateAllowedSkills, {
          machineDocId: args.machineDocId as never,
          allowedSkills: args.allowedSkills,
        });
      },
    }),
    provisionAgentMachine: actionGeneric({
      args: {
        userId: v.string(),
        tenantId: v.string(),
        flyApiToken: v.string(),
        flyAppName: v.string(),
        openclawGatewayToken: v.optional(v.string()),
      },
      handler: async (ctx, args) => {
        await options.auth(ctx, {
          type: "provision",
          tenantId: args.tenantId,
        });
        return await ctx.runAction(component.lib.provisionAgentMachine, args);
      },
    }),
    startAgentMachine: actionGeneric({
      args: {
        machineDocId: v.string(),
        flyApiToken: v.string(),
        flyAppName: v.string(),
      },
      handler: async (ctx, args) => {
        await options.auth(ctx, { type: "start", machineDocId: args.machineDocId });
        return await ctx.runAction(component.lib.startAgentMachine, {
          machineDocId: args.machineDocId as never,
          flyApiToken: args.flyApiToken,
          flyAppName: args.flyAppName,
        });
      },
    }),
    stopAgentMachine: actionGeneric({
      args: {
        machineDocId: v.string(),
        flyApiToken: v.string(),
        flyAppName: v.string(),
      },
      handler: async (ctx, args) => {
        await options.auth(ctx, { type: "stop", machineDocId: args.machineDocId });
        return await ctx.runAction(component.lib.stopAgentMachine, {
          machineDocId: args.machineDocId as never,
          flyApiToken: args.flyApiToken,
          flyAppName: args.flyAppName,
        });
      },
    }),
    deprovisionAgentMachine: actionGeneric({
      args: {
        machineDocId: v.string(),
        flyApiToken: v.string(),
        flyAppName: v.string(),
      },
      handler: async (ctx, args) => {
        await options.auth(ctx, {
          type: "deprovision",
          machineDocId: args.machineDocId,
        });
        return await ctx.runAction(component.lib.deprovisionAgentMachine, {
          machineDocId: args.machineDocId as never,
          flyApiToken: args.flyApiToken,
          flyAppName: args.flyAppName,
        });
      },
    }),
  };
}

