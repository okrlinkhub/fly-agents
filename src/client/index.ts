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
        | { type: "recreate"; tenantId: string }
        | { type: "start"; machineDocId: string }
        | { type: "stop"; machineDocId: string }
        | { type: "deprovision"; machineDocId: string }
        | { type: "touchActivity"; machineDocId: string }
        | { type: "snapshot"; machineDocId: string }
        | { type: "pairTelegram"; machineDocId: string }
        | { type: "secrets"; tenantId: string },
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
    getAgentSecretsMeta: queryGeneric({
      args: {
        tenantId: v.string(),
        userId: v.string(),
      },
      handler: async (ctx, args) => {
        await options.auth(ctx, {
          type: "secrets",
          tenantId: args.tenantId,
        });
        return await ctx.runQuery((component.lib as any).getAgentSecretsMeta, args);
      },
    }),
    upsertAgentSecrets: mutationGeneric({
      args: {
        tenantId: v.string(),
        userId: v.string(),
        flyApiToken: v.optional(v.string()),
        llmApiKey: v.optional(v.string()),
        openaiApiKey: v.optional(v.string()),
        telegramBotToken: v.optional(v.string()),
        openclawGatewayToken: v.optional(v.string()),
      },
      handler: async (ctx, args) => {
        await options.auth(ctx, {
          type: "secrets",
          tenantId: args.tenantId,
        });
        return await ctx.runMutation((component.lib as any).upsertAgentSecrets, args);
      },
    }),
    clearAgentSecrets: mutationGeneric({
      args: {
        tenantId: v.string(),
        userId: v.string(),
      },
      handler: async (ctx, args) => {
        await options.auth(ctx, {
          type: "secrets",
          tenantId: args.tenantId,
        });
        return await ctx.runMutation((component.lib as any).clearAgentSecrets, args);
      },
    }),
    touchAgentActivity: mutationGeneric({
      args: {
        machineDocId: v.string(),
      },
      handler: async (ctx, args) => {
        await options.auth(ctx, {
          type: "touchActivity",
          machineDocId: args.machineDocId,
        });
        return await ctx.runMutation((component.lib as any).touchAgentActivity, {
          machineDocId: args.machineDocId as never,
        });
      },
    }),
    provisionAgentMachine: actionGeneric({
      args: {
        userId: v.string(),
        tenantId: v.string(),
        flyApiToken: v.string(),
        flyAppName: v.string(),
        image: v.optional(v.string()),
        region: v.optional(v.string()),
        memoryMB: v.optional(v.number()),
        bridgeUrl: v.optional(v.string()),
        llmApiKey: v.optional(v.string()),
        llmModel: v.optional(v.string()),
        telegramBotToken: v.optional(v.string()),
        serviceId: v.optional(v.string()),
        serviceKey: v.optional(v.string()),
        appKey: v.optional(v.string()),
        openclawGatewayToken: v.string(),
        allowedSkillsJson: v.optional(v.string()),
        allowedSkills: v.optional(v.array(v.string())),
        restoreFromLatestSnapshot: v.optional(v.boolean()),
      },
      handler: async (ctx, args) => {
        await options.auth(ctx, {
          type: "provision",
          tenantId: args.tenantId,
        });
        return await ctx.runAction(component.lib.provisionAgentMachine, args);
      },
    }),
    provisionAgentMachineWithStoredSecrets: actionGeneric({
      args: {
        userId: v.string(),
        tenantId: v.string(),
        flyAppName: v.string(),
        image: v.optional(v.string()),
        region: v.optional(v.string()),
        memoryMB: v.optional(v.number()),
        bridgeUrl: v.optional(v.string()),
        llmModel: v.optional(v.string()),
        serviceId: v.optional(v.string()),
        serviceKey: v.optional(v.string()),
        appKey: v.optional(v.string()),
        allowedSkillsJson: v.optional(v.string()),
        allowedSkills: v.optional(v.array(v.string())),
        restoreFromLatestSnapshot: v.optional(v.boolean()),
      },
      handler: async (ctx, args) => {
        await options.auth(ctx, {
          type: "provision",
          tenantId: args.tenantId,
        });
        return await ctx.runAction((component.lib as any).provisionAgentMachineWithStoredSecrets, args);
      },
    }),
    recreateAgentFromLatestSnapshot: actionGeneric({
      args: {
        userId: v.string(),
        tenantId: v.string(),
        flyApiToken: v.string(),
        flyAppName: v.string(),
        image: v.optional(v.string()),
        region: v.optional(v.string()),
        memoryMB: v.optional(v.number()),
        bridgeUrl: v.optional(v.string()),
        llmApiKey: v.optional(v.string()),
        llmModel: v.optional(v.string()),
        telegramBotToken: v.optional(v.string()),
        serviceId: v.optional(v.string()),
        serviceKey: v.optional(v.string()),
        appKey: v.optional(v.string()),
        openclawGatewayToken: v.string(),
        allowedSkillsJson: v.optional(v.string()),
        allowedSkills: v.optional(v.array(v.string())),
      },
      handler: async (ctx, args) => {
        await options.auth(ctx, {
          type: "recreate",
          tenantId: args.tenantId,
        });
        return await ctx.runAction((component.lib as any).recreateAgentFromLatestSnapshot, args);
      },
    }),
    recreateAgentFromLatestSnapshotWithStoredSecrets: actionGeneric({
      args: {
        userId: v.string(),
        tenantId: v.string(),
        flyAppName: v.string(),
        image: v.optional(v.string()),
        region: v.optional(v.string()),
        memoryMB: v.optional(v.number()),
        bridgeUrl: v.optional(v.string()),
        llmModel: v.optional(v.string()),
        serviceId: v.optional(v.string()),
        serviceKey: v.optional(v.string()),
        appKey: v.optional(v.string()),
        allowedSkillsJson: v.optional(v.string()),
        allowedSkills: v.optional(v.array(v.string())),
      },
      handler: async (ctx, args) => {
        await options.auth(ctx, {
          type: "recreate",
          tenantId: args.tenantId,
        });
        return await ctx.runAction(
          (component.lib as any).recreateAgentFromLatestSnapshotWithStoredSecrets,
          args,
        );
      },
    }),
    createAgentSnapshot: actionGeneric({
      args: {
        machineDocId: v.string(),
        flyApiToken: v.string(),
        flyAppName: v.string(),
      },
      handler: async (ctx, args) => {
        await options.auth(ctx, { type: "snapshot", machineDocId: args.machineDocId });
        return await ctx.runAction((component.lib as any).createAgentSnapshot, {
          machineDocId: args.machineDocId as never,
          flyApiToken: args.flyApiToken,
          flyAppName: args.flyAppName,
        });
      },
    }),
    createAgentSnapshotWithStoredSecrets: actionGeneric({
      args: {
        machineDocId: v.string(),
        flyAppName: v.string(),
      },
      handler: async (ctx, args) => {
        await options.auth(ctx, { type: "snapshot", machineDocId: args.machineDocId });
        return await ctx.runAction((component.lib as any).createAgentSnapshotWithStoredSecrets, {
          machineDocId: args.machineDocId as never,
          flyAppName: args.flyAppName,
        });
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
    startAgentMachineWithStoredSecrets: actionGeneric({
      args: {
        machineDocId: v.string(),
        flyAppName: v.string(),
      },
      handler: async (ctx, args) => {
        await options.auth(ctx, { type: "start", machineDocId: args.machineDocId });
        return await ctx.runAction((component.lib as any).startAgentMachineWithStoredSecrets, {
          machineDocId: args.machineDocId as never,
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
    stopAgentMachineWithStoredSecrets: actionGeneric({
      args: {
        machineDocId: v.string(),
        flyAppName: v.string(),
      },
      handler: async (ctx, args) => {
        await options.auth(ctx, { type: "stop", machineDocId: args.machineDocId });
        return await ctx.runAction((component.lib as any).stopAgentMachineWithStoredSecrets, {
          machineDocId: args.machineDocId as never,
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
    deprovisionAgentMachineWithStoredSecrets: actionGeneric({
      args: {
        machineDocId: v.string(),
        flyAppName: v.string(),
      },
      handler: async (ctx, args) => {
        await options.auth(ctx, {
          type: "deprovision",
          machineDocId: args.machineDocId,
        });
        return await ctx.runAction((component.lib as any).deprovisionAgentMachineWithStoredSecrets, {
          machineDocId: args.machineDocId as never,
          flyAppName: args.flyAppName,
        });
      },
    }),
    approveTelegramPairing: actionGeneric({
      args: {
        machineDocId: v.string(),
        flyApiToken: v.string(),
        flyAppName: v.string(),
        telegramPairingCode: v.string(),
      },
      handler: async (ctx, args) => {
        await options.auth(ctx, {
          type: "pairTelegram",
          machineDocId: args.machineDocId,
        });
        return await ctx.runAction((component.lib as any).approveTelegramPairing, {
          machineDocId: args.machineDocId as never,
          flyApiToken: args.flyApiToken,
          flyAppName: args.flyAppName,
          telegramPairingCode: args.telegramPairingCode,
        });
      },
    }),
    approveTelegramPairingWithStoredSecrets: actionGeneric({
      args: {
        machineDocId: v.string(),
        flyAppName: v.string(),
        telegramPairingCode: v.string(),
      },
      handler: async (ctx, args) => {
        await options.auth(ctx, {
          type: "pairTelegram",
          machineDocId: args.machineDocId,
        });
        return await ctx.runAction((component.lib as any).approveTelegramPairingWithStoredSecrets, {
          machineDocId: args.machineDocId as never,
          flyAppName: args.flyAppName,
          telegramPairingCode: args.telegramPairingCode,
        });
      },
    }),
  };
}

