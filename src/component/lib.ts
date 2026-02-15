import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server.js";
import { internal } from "./_generated/api.js";
import type { Id } from "./_generated/dataModel.js";
import schema from "./schema.js";

const machineRecordValidator = schema.tables.agentMachines.validator.extend({
  _id: v.id("agentMachines"),
  _creationTime: v.number(),
});

type FlyRequestArgs = {
  endpoint: string;
  token: string;
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
};

async function flyRequest(args: FlyRequestArgs) {
  const response = await fetch(`https://api.machines.dev/v1${args.endpoint}`, {
    method: args.method ?? "GET",
    headers: {
      Authorization: `Bearer ${args.token}`,
      "Content-Type": "application/json",
    },
    body: args.body !== undefined ? JSON.stringify(args.body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`Fly API ${args.endpoint} failed: ${await response.text()}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function envOrThrow(name: string, fallback?: string) {
  const value =
    fallback ??
    (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
      ?.env?.[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required value: ${name}`);
  }
  return value.trim();
}

export const listAgentMachinesByTenant = query({
  args: { tenantId: v.string() },
  returns: v.array(machineRecordValidator),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentMachines")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", args.tenantId))
      .order("desc")
      .collect();
  },
});

export const getAgentMachine = query({
  args: { machineDocId: v.id("agentMachines") },
  returns: v.union(v.null(), machineRecordValidator),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.machineDocId);
  },
});

export const updateAllowedSkills = mutation({
  args: {
    machineDocId: v.id("agentMachines"),
    allowedSkills: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.machineDocId, {
      allowedSkills: args.allowedSkills,
      lastWakeAt: Date.now(),
    });
    return null;
  },
});

export const provisionAgentMachine = action({
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
    openclawGatewayToken: v.optional(v.string()),
    appKey: v.optional(v.string()),
    allowedSkills: v.optional(v.array(v.string())),
  },
  returns: v.object({
    machineDocId: v.id("agentMachines"),
    machineId: v.string(),
    volumeId: v.string(),
  }),
  handler: async (ctx, args): Promise<{
    machineDocId: Id<"agentMachines">;
    machineId: string;
    volumeId: string;
  }> => {
    const allowedSkills = args.allowedSkills ?? ["linkhub-bridge"];
    const bridgeUrl = envOrThrow("AGENT_BRIDGE_URL", args.bridgeUrl);
    const serviceId = envOrThrow("OPENCLAW_SERVICE_ID", args.serviceId);
    const serviceKey = envOrThrow("OPENCLAW_SERVICE_KEY", args.serviceKey);
    const openclawGatewayToken = envOrThrow(
      "OPENCLAW_GATEWAY_TOKEN",
      args.openclawGatewayToken,
    );
    const appKey = args.appKey?.trim() || "linkhub-w4";
    const memoryMB = args.memoryMB ?? 512;
    const region = args.region ?? "iad";
    const image = args.image ?? "registry.fly.io/linkhub-agents:openclaw-okr-v1";

    const machineDocId: Id<"agentMachines"> = await ctx.runMutation(
      internal.storage.insertMachineRecord,
      {
        userId: args.userId,
        tenantId: args.tenantId,
        status: "provisioning",
        allowedSkills,
        memoryMB,
        appKey,
        bridgeUrl,
        serviceId,
        serviceKey,
        region,
      },
    );

    try {
      const volume = await flyRequest({
        endpoint: `/apps/${args.flyAppName}/volumes`,
        token: args.flyApiToken,
        method: "POST",
        body: {
          name: `agent-${args.userId}-${Date.now()}`,
          region,
          size_gb: 1,
        },
      });

      const machine = await flyRequest({
        endpoint: `/apps/${args.flyAppName}/machines`,
        token: args.flyApiToken,
        method: "POST",
        body: {
          config: {
            image,
            guest: {
              cpu_kind: "shared",
              cpus: 1,
              memory_mb: memoryMB,
            },
            env: {
              USER_ID: args.userId,
              TENANT_ID: args.tenantId,
              AGENT_BRIDGE_URL: bridgeUrl,
              OPENCLAW_SERVICE_ID: serviceId,
              OPENCLAW_SERVICE_KEY: serviceKey,
              OPENCLAW_GATEWAY_TOKEN: openclawGatewayToken,
              OPENCLAW_APP_KEY: appKey,
              ALLOWED_SKILLS_JSON: JSON.stringify(allowedSkills),
            },
            mounts: [{ volume: volume.id, path: "/data" }],
            services: [
              {
                protocol: "tcp",
                internal_port: 3000,
                ports: [{ port: 443, handlers: ["tls", "http"] }],
                autostart: true,
                autostop: true,
              },
            ],
          },
        },
      });

      await ctx.runMutation(internal.storage.patchMachineRecord, {
        machineDocId,
        status: "running",
        machineId: machine.id,
        flyVolumeId: volume.id,
        lastWakeAt: Date.now(),
      });

      return {
        machineDocId,
        machineId: machine.id,
        volumeId: volume.id,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown provisioning error";
      await ctx.runMutation(internal.storage.patchMachineRecord, {
        machineDocId,
        status: "error",
        lastError: message,
      });
      throw error;
    }
  },
});

export const startAgentMachine = action({
  args: {
    machineDocId: v.id("agentMachines"),
    flyApiToken: v.string(),
    flyAppName: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const machine: { machineId?: string } | null = await ctx.runQuery(
      internal.storage.getMachineRecord,
      {
        machineDocId: args.machineDocId,
      },
    );
    if (!machine?.machineId) {
      throw new Error("Machine id not available");
    }
    await flyRequest({
      endpoint: `/apps/${args.flyAppName}/machines/${machine.machineId}/start`,
      token: args.flyApiToken,
      method: "POST",
    });
    await ctx.runMutation(internal.storage.patchMachineRecord, {
      machineDocId: args.machineDocId,
      status: "running",
      lastWakeAt: Date.now(),
    });
    return null;
  },
});

export const stopAgentMachine = action({
  args: {
    machineDocId: v.id("agentMachines"),
    flyApiToken: v.string(),
    flyAppName: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const machine: { machineId?: string } | null = await ctx.runQuery(
      internal.storage.getMachineRecord,
      {
        machineDocId: args.machineDocId,
      },
    );
    if (!machine?.machineId) {
      throw new Error("Machine id not available");
    }
    await flyRequest({
      endpoint: `/apps/${args.flyAppName}/machines/${machine.machineId}/stop`,
      token: args.flyApiToken,
      method: "POST",
    });
    await ctx.runMutation(internal.storage.patchMachineRecord, {
      machineDocId: args.machineDocId,
      status: "stopped",
    });
    return null;
  },
});

export const deprovisionAgentMachine = action({
  args: {
    machineDocId: v.id("agentMachines"),
    flyApiToken: v.string(),
    flyAppName: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const machine: { machineId?: string; flyVolumeId?: string } | null =
      await ctx.runQuery(internal.storage.getMachineRecord, {
        machineDocId: args.machineDocId,
      });
    if (!machine) {
      return null;
    }

    if (machine.machineId) {
      await flyRequest({
        endpoint: `/apps/${args.flyAppName}/machines/${machine.machineId}`,
        token: args.flyApiToken,
        method: "DELETE",
      });
    }
    if (machine.flyVolumeId) {
      await flyRequest({
        endpoint: `/apps/${args.flyAppName}/volumes/${machine.flyVolumeId}`,
        token: args.flyApiToken,
        method: "DELETE",
      });
    }

    await ctx.runMutation(internal.storage.patchMachineRecord, {
      machineDocId: args.machineDocId,
      status: "deleted",
    });
    return null;
  },
});
