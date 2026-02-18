import { action, mutation, query } from "./_generated/server.js";
import { components } from "./_generated/api.js";
import { exposeApi } from "../../src/client/index.js";
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
    await getAuthUserId(ctx);
    const fly = getFlyRuntimeConfig();
    return await ctx.runAction(components.flyAgents.lib.provisionAgentMachine, {
      ...args,
      flyApiToken: fly.flyApiToken,
      flyAppName: fly.flyAppName,
      bridgeUrl: args.bridgeUrl ?? getEnvOrThrow("AGENT_BRIDGE_URL", "AGENT_BRIDGE_URL"),
      serviceId: args.serviceId ?? getEnvOrThrow("OPENCLAW_SERVICE_ID", "OPENCLAW_SERVICE_ID"),
      serviceKey: args.serviceKey ?? getEnvOrThrow("OPENCLAW_SERVICE_KEY", "OPENCLAW_SERVICE_KEY"),
      telegramBotToken:
        args.telegramBotToken ?? getEnvOrThrow("TELEGRAM_BOT_TOKEN", "TELEGRAM_BOT_TOKEN"),
      llmModel: args.llmModel ?? getEnvOptional("LLM_MODEL") ?? "openai/gpt-4.1-mini",
      openclawGatewayToken:
        args.openclawGatewayToken ?? getEnvOrThrow("OPENCLAW_GATEWAY_TOKEN", "OPENCLAW_GATEWAY_TOKEN"),
      appKey: args.appKey ?? getEnvOptional("OPENCLAW_APP_KEY") ?? "linkhub-w4",
      llmApiKey: args.llmApiKey ??  getEnvOptional("OPENAI_API_KEY"),
    });
  },
});

export const ensureUserAgent = action({
  args: {
    userId: v.string(),
    tenantId: v.string(),
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
    openclawGatewayToken: v.optional(v.string()),
    allowedSkillsJson: v.optional(v.string()),
    allowedSkills: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    const fly = getFlyRuntimeConfig();
    const machines = (await ctx.runQuery(components.flyAgents.lib.listAgentMachinesByTenant, {
      tenantId: args.tenantId,
    })) as Array<{
      _id: string;
      _creationTime: number;
      userId: string;
      status: "provisioning" | "running" | "stopped" | "hibernated" | "error" | "deleted";
      machineId?: string;
      flyVolumeId?: string;
    }>;
    const latest = machines
      .filter((machine) => machine.userId === args.userId)
      .sort((a, b) => b._creationTime - a._creationTime)[0];

    if (latest?.status === "running" && latest.machineId) {
      return {
        mode: "existing_running" as const,
        machineDocId: latest._id,
        machineId: latest.machineId,
        volumeId: latest.flyVolumeId ?? "",
      };
    }

    if ((latest?.status === "stopped" || latest?.status === "hibernated") && latest._id) {
      await ctx.runAction(components.flyAgents.lib.startAgentMachine, {
        machineDocId: latest._id as never,
        flyApiToken: fly.flyApiToken,
        flyAppName: fly.flyAppName,
      });
      const started = await ctx.runQuery(components.flyAgents.lib.getAgentMachine, {
        machineDocId: latest._id as never,
      });
      return {
        mode: "started_existing" as const,
        machineDocId: latest._id,
        machineId: started?.machineId ?? "",
        volumeId: started?.flyVolumeId ?? "",
      };
    }

    const provisioned = await ctx.runAction(components.flyAgents.lib.provisionAgentMachine, {
      ...args,
      flyApiToken: fly.flyApiToken,
      flyAppName: fly.flyAppName,
      bridgeUrl: args.bridgeUrl ?? getEnvOrThrow("AGENT_BRIDGE_URL", "AGENT_BRIDGE_URL"),
      serviceId: args.serviceId ?? getEnvOrThrow("OPENCLAW_SERVICE_ID", "OPENCLAW_SERVICE_ID"),
      serviceKey: args.serviceKey ?? getEnvOrThrow("OPENCLAW_SERVICE_KEY", "OPENCLAW_SERVICE_KEY"),
      telegramBotToken:
        args.telegramBotToken ?? getEnvOrThrow("TELEGRAM_BOT_TOKEN", "TELEGRAM_BOT_TOKEN"),
      llmModel: args.llmModel ?? getEnvOptional("LLM_MODEL") ?? "openai/gpt-4.1-mini",
      openclawGatewayToken:
        args.openclawGatewayToken ?? getEnvOrThrow("OPENCLAW_GATEWAY_TOKEN", "OPENCLAW_GATEWAY_TOKEN"),
      appKey: args.appKey ?? getEnvOptional("OPENCLAW_APP_KEY") ?? "linkhub-w4",
      llmApiKey: args.llmApiKey ?? getEnvOptional("OPENAI_API_KEY"),
    });
    return {
      mode: "provisioned_new" as const,
      ...provisioned,
    };
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

export const createAgentSnapshot = action({
  args: {
    machineDocId: v.string(),
    flyApiToken: v.optional(v.string()),
    flyAppName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    const fly = getFlyRuntimeConfig();
    return await ctx.runAction((components.flyAgents.lib as any).createAgentSnapshot, {
      machineDocId: args.machineDocId as never,
      flyApiToken: args.flyApiToken || fly.flyApiToken,
      flyAppName: args.flyAppName || fly.flyAppName,
    });
  },
});

export const startMyAgent = action({
  args: { machineDocId: v.string() },
  handler: async (ctx, args) => {
    const authUserId = await getAuthUserId(ctx);
    await assertMachineOwnership(ctx, authUserId, args.machineDocId);
    const fly = getFlyRuntimeConfig();
    return await ctx.runAction(components.flyAgents.lib.startAgentMachine, {
      machineDocId: args.machineDocId as never,
      flyApiToken: fly.flyApiToken,
      flyAppName: fly.flyAppName,
    });
  },
});

export const stopMyAgent = action({
  args: { machineDocId: v.string() },
  handler: async (ctx, args) => {
    const authUserId = await getAuthUserId(ctx);
    await assertMachineOwnership(ctx, authUserId, args.machineDocId);
    const fly = getFlyRuntimeConfig();
    return await ctx.runAction(components.flyAgents.lib.stopAgentMachine, {
      machineDocId: args.machineDocId as never,
      flyApiToken: fly.flyApiToken,
      flyAppName: fly.flyAppName,
    });
  },
});

export const getTelegramPairingCode = action({
  args: { machineDocId: v.string() },
  returns: v.object({
    code: v.optional(v.string()),
    status: v.optional(v.string()),
    requestCount: v.number(),
    hasPendingRequest: v.boolean(),
    raw: v.string(),
  }),
  handler: async (ctx, args) => {
    const authUserId = await getAuthUserId(ctx);
    const machine = await assertMachineOwnership(ctx, authUserId, args.machineDocId);
    if (!machine.machineId) {
      throw new Error("Machine id not available");
    }
    const fly = getFlyRuntimeConfig();
    const result = await flyMachineExec({
      flyApiToken: fly.flyApiToken,
      flyAppName: fly.flyAppName,
      machineId: machine.machineId,
      command: ["sh", "-lc", "cat /data/openclaw/state/credentials/telegram-pairing.json"],
    });
    const raw = (result.stdout ?? result.stderr ?? "").trim();
    if (!raw) {
      return { raw: "", requestCount: 0, hasPendingRequest: false };
    }
    try {
      const parsed = JSON.parse(raw) as {
        code?: string;
        status?: string;
        requests?: Array<{ code?: string; status?: string }>;
      };
      const requests = Array.isArray(parsed.requests) ? parsed.requests : [];
      const pendingRequest =
        requests.find((request) => {
          const status = (request.status ?? "").toLowerCase();
          return !status || status === "pending" || status === "created";
        }) ?? requests[0];
      const resolvedCode = parsed.code ?? pendingRequest?.code;
      const resolvedStatus = parsed.status ?? pendingRequest?.status;
      return {
        code: resolvedCode,
        status: resolvedStatus,
        requestCount: requests.length,
        hasPendingRequest: !!pendingRequest,
        raw,
      };
    } catch {
      return { raw, requestCount: 0, hasPendingRequest: false };
    }
  },
});

export const approveTelegramPairing = action({
  args: {
    machineDocId: v.string(),
    pairingCode: v.string(),
  },
  returns: v.object({
    ok: v.boolean(),
    exitCode: v.optional(v.number()),
    stdout: v.optional(v.string()),
    stderr: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const authUserId = await getAuthUserId(ctx);
    const machine = await assertMachineOwnership(ctx, authUserId, args.machineDocId);
    if (!machine.machineId) {
      throw new Error("Machine id not available");
    }
    const fly = getFlyRuntimeConfig();
    const result = await flyMachineExec({
      flyApiToken: fly.flyApiToken,
      flyAppName: fly.flyAppName,
      machineId: machine.machineId,
      command: [
        "sh",
        "-lc",
        `cd /app && node ./openclaw.mjs pairing approve telegram ${shellSingleQuote(args.pairingCode)}`,
      ],
    });
    return {
      ok: (result.exit_code ?? 0) === 0,
      exitCode: result.exit_code,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  },
});

export const getLatestAgentSnapshot = query({
  args: {
    tenantId: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    const agentKey = `${args.tenantId}:${args.userId}`;
    const flyAgentsComponent = components.flyAgents as any;
    return await ctx.runQuery(flyAgentsComponent.storage.getLatestSnapshotByAgentKey, {
      agentKey,
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

async function assertMachineOwnership(
  ctx: any,
  authUserId: string,
  machineDocId: string,
) {
  const machine = await ctx.runQuery(components.flyAgents.lib.getAgentMachine, {
    machineDocId: machineDocId as never,
  });
  if (!machine) {
    throw new Error("Machine not found");
  }
  if (authUserId !== "anonymous" && machine.userId !== authUserId) {
    throw new Error("Unauthorized: machine does not belong to authenticated user");
  }
  return machine;
}

function getEnvOptional(name: string) {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name];
}

function getEnvOrThrow(name: string, message: string) {
  const value = getEnvOptional(name);
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${message}`);
  }
  return value.trim();
}

function getFlyRuntimeConfig() {
  return {
    flyApiToken: getEnvOrThrow("FLY_API_TOKEN", "FLY_API_TOKEN"),
    flyAppName: getEnvOrThrow("FLY_APP_NAME", "FLY_APP_NAME"),
  };
}

function shellSingleQuote(value: string) {
  return `'${value.replace(/'/g, `"'"'`)}'`;
}

async function flyMachineExec(args: {
  flyApiToken: string;
  flyAppName: string;
  machineId: string;
  command: string[];
}) {
  const response = await fetch(
    `https://api.machines.dev/v1/apps/${args.flyAppName}/machines/${args.machineId}/exec`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.flyApiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ command: args.command }),
    },
  );

  if (!response.ok) {
    throw new Error(`Fly exec failed: ${await response.text()}`);
  }

  return (await response.json()) as {
    exit_code?: number;
    stdout?: string;
    stderr?: string;
  };
}
