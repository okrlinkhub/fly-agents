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

function agentKeyFor(userId: string, tenantId: string) {
  return `${tenantId}:${userId}`;
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

function parseAllowedSkillsJson(raw?: string): Array<string> | null {
  if (!raw?.trim()) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("ALLOWED_SKILLS_JSON must be valid JSON");
  }
  if (!Array.isArray(parsed) || parsed.some((skill) => typeof skill !== "string")) {
    throw new Error("ALLOWED_SKILLS_JSON must be a JSON array of strings");
  }
  return parsed;
}

function assertAllowedModel(model: string) {
  const normalizedModel = model.trim().toLowerCase();
  const modelParts = normalizedModel.split("/");
  const modelId = modelParts[modelParts.length - 1] ?? normalizedModel;
  if (modelId === "gpt-5-mini") {
    throw new Error(
      "LLM_MODEL=gpt-5-mini is currently disabled due to a known reasoning-model bug",
    );
  }
}

const DEFAULT_LLM_MODEL = "openai/gpt-4.1-mini";
const MODEL_SET_RETRY_ATTEMPTS = 30;
const MODEL_SET_RETRY_DELAY_MS = 5_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shellSingleQuote(value: string) {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

async function sha256Hex(value: string) {
  const input = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function forceDefaultModelOnMachine(args: {
  flyApiToken: string;
  flyAppName: string;
  machineId: string;
  llmModel: string;
}) {
  const modelArg = shellSingleQuote(args.llmModel);
  const command = `cd /app && node ./openclaw.mjs models set ${modelArg}`;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MODEL_SET_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const execResponse = (await flyRequest({
        endpoint: `/apps/${args.flyAppName}/machines/${args.machineId}/exec`,
        token: args.flyApiToken,
        method: "POST",
        body: { command: ["sh", "-lc", command] },
      })) as { exit_code?: number; stderr?: string };

      if (typeof execResponse?.exit_code === "number" && execResponse.exit_code !== 0) {
        throw new Error(
          `models set failed with exit code ${execResponse.exit_code}${
            execResponse.stderr ? `: ${execResponse.stderr}` : ""
          }`,
        );
      }
      return;
    } catch (error: unknown) {
      lastError = error;
      if (attempt < MODEL_SET_RETRY_ATTEMPTS) {
        await sleep(MODEL_SET_RETRY_DELAY_MS);
      }
    }
  }

  const message =
    lastError instanceof Error ? lastError.message : "unknown exec error while forcing model";
  throw new Error(`Unable to force model ${args.llmModel} on machine ${args.machineId}: ${message}`);
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
      lastActivityAt: Date.now(),
    });
    return null;
  },
});

export const touchAgentActivity = mutation({
  args: {
    machineDocId: v.id("agentMachines"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.machineDocId, {
      lastActivityAt: now,
      lastWakeAt: now,
    });
    return null;
  },
});

async function createBackupSnapshotForMachine(ctx: any, args: {
  machineDocId: Id<"agentMachines">;
  flyApiToken: string;
  flyAppName: string;
}): Promise<{ snapshotId: Id<"agentSnapshots">; flyVolumeSnapshotId?: string }> {
  const machine: any = await ctx.runQuery(internal.storage.getMachineRecord, {
    machineDocId: args.machineDocId,
  });
  if (!machine) {
    throw new Error("Machine record not found");
  }
  if (!machine.flyVolumeId) {
    throw new Error("Cannot snapshot machine without volume");
  }
  if (!machine.userId || !machine.tenantId) {
    throw new Error("Machine record missing identity fields");
  }

  const snapshotResponse = await flyRequest({
    endpoint: `/apps/${args.flyAppName}/volumes/${machine.flyVolumeId}/snapshots`,
    token: args.flyApiToken,
    method: "POST",
    body: {},
  });

  const flyVolumeSnapshotId: string | undefined =
    typeof snapshotResponse?.id === "string"
      ? snapshotResponse.id
      : typeof snapshotResponse?.snapshot?.id === "string"
        ? snapshotResponse.snapshot.id
        : undefined;

  const manifest = {
    sourceMachineId: machine.machineId,
    sourceFlyVolumeId: machine.flyVolumeId,
    image: undefined as string | undefined,
    region: machine.region,
    llmModel: undefined as string | undefined,
    backupScope: "openclaw-state-plus-manifest" as const,
    backupCreatedAt: Date.now(),
    notes: "Captured from idle sweeper before machine hibernation",
  };

  const snapshotStorageId = await ctx.storage.store(
    new Blob([JSON.stringify({ machineDocId: args.machineDocId, manifest })], {
      type: "application/json",
    }),
  );

  const snapshotId: Id<"agentSnapshots"> = await ctx.runMutation(internal.storage.insertAgentSnapshot, {
    agentKey: agentKeyFor(machine.userId, machine.tenantId),
    machineDocId: args.machineDocId,
    tenantId: machine.tenantId,
    userId: machine.userId,
    status: "created",
    snapshotStorageId,
    flyVolumeSnapshotId,
    manifest,
  });

  await ctx.runMutation(internal.storage.patchMachineRecord, {
    machineDocId: args.machineDocId,
    latestSnapshotId: snapshotId,
  });

  return {
    snapshotId,
    flyVolumeSnapshotId,
  };
}

async function provisionMachine(ctx: any, args: any): Promise<{
  machineDocId: Id<"agentMachines">;
  machineId: string;
  volumeId: string;
}> {
  const allowedSkills =
    parseAllowedSkillsJson(args.allowedSkillsJson) ?? args.allowedSkills ?? ["linkhub-bridge"];
  const bridgeUrl = envOrThrow("AGENT_BRIDGE_URL", args.bridgeUrl);
  const llmApiKey = envOrThrow("OPENAI_API_KEY", args.llmApiKey);
  const llmModel = envOrThrow("LLM_MODEL", args.llmModel?.trim() || DEFAULT_LLM_MODEL);
  assertAllowedModel(llmModel);
  const telegramBotToken = envOrThrow("TELEGRAM_BOT_TOKEN", args.telegramBotToken);
  const serviceId = envOrThrow("OPENCLAW_SERVICE_ID", args.serviceId);
  const serviceKey = envOrThrow("OPENCLAW_SERVICE_KEY", args.serviceKey);
  const openclawGatewayToken = envOrThrow("OPENCLAW_GATEWAY_TOKEN", args.openclawGatewayToken);
  const telegramTokenHash = await sha256Hex(telegramBotToken);
  const appKey = args.appKey?.trim() || "linkhub-w4";
  const memoryMB = args.memoryMB ?? 2048;
  const region = args.region ?? "iad";
  const image = args.image ?? "registry.fly.io/linkhub-agents:openclaw-okr-v1";
  const restoreFromLatestSnapshot = args.restoreFromLatestSnapshot ?? true;
  const agentKey = agentKeyFor(args.userId, args.tenantId);
  const safeUserSlug = args.userId
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .slice(0, 10);
  const volumeName = `agent_${safeUserSlug}_${Date.now().toString(36)}`.slice(0, 30);

  const activeMachinesWithSameToken: Array<{ userId: string; tenantId: string }> = await ctx.runQuery(
    internal.storage.listActiveMachinesByTelegramTokenHash,
    {
      telegramTokenHash,
    },
  );
  const conflict = activeMachinesWithSameToken.find(
    (machine) => machine.userId !== args.userId || machine.tenantId !== args.tenantId,
  );
  if (conflict) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN is already used by another active machine. Use a unique bot token per user.",
    );
  }

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
      telegramTokenHash,
      region,
      lastActivityAt: Date.now(),
      lifecycleMode: "running",
    },
  );

  try {
    const latestSnapshot = restoreFromLatestSnapshot
      ? await ctx.runQuery(internal.storage.getLatestSnapshotByAgentKey, { agentKey })
      : null;

    let volume: any;
    if (latestSnapshot?.flyVolumeSnapshotId) {
      try {
        volume = await flyRequest({
          endpoint: `/apps/${args.flyAppName}/volumes`,
          token: args.flyApiToken,
          method: "POST",
          body: {
            name: volumeName,
            region,
            size_gb: 1,
            snapshot_id: latestSnapshot.flyVolumeSnapshotId,
          },
        });
      } catch {
        volume = null;
      }
    }
    if (!volume?.id) {
      volume = await flyRequest({
        endpoint: `/apps/${args.flyAppName}/volumes`,
        token: args.flyApiToken,
        method: "POST",
        body: {
          name: volumeName,
          region,
          size_gb: 1,
        },
      });
    }

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
          restart: {
            policy: "always",
          },
          env: {
            USER_ID: args.userId,
            TENANT_ID: args.tenantId,
            LLM_MODEL: llmModel,
            LLM_API_KEY: llmApiKey,
            OPENAI_API_KEY: llmApiKey,
            TELEGRAM_BOT_TOKEN: telegramBotToken,
            AGENT_BRIDGE_URL: bridgeUrl,
            OPENCLAW_SERVICE_ID: serviceId,
            OPENCLAW_SERVICE_KEY: serviceKey,
            OPENCLAW_GATEWAY_TOKEN: openclawGatewayToken,
            OPENCLAW_APP_KEY: appKey,
            OPENCLAW_STATE_DIR: "/data/openclaw/state",
            OPENCLAW_CONFIG_PATH: "/data/openclaw/config.json",
            OPENCLAW_HOME: "/data/openclaw",
            OPENCLAW_STARTUP_TIMEOUT_SEC: "240",
            ALLOWED_SKILLS_JSON: JSON.stringify(allowedSkills),
          },
          mounts: [{ volume: volume.id, path: "/data" }],
          services: [
            {
              protocol: "tcp",
              internal_port: 3000,
              ports: [{ port: 443, handlers: ["tls", "http"] }],
              autostart: true,
              autostop: false,
              checks: [
                {
                  type: "tcp",
                  interval: "15s",
                  timeout: "5s",
                  grace_period: "240s",
                },
              ],
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
      lastActivityAt: Date.now(),
      lifecycleMode: "running",
      latestSnapshotId: latestSnapshot?._id,
    });

    try {
      await forceDefaultModelOnMachine({
        flyApiToken: args.flyApiToken,
        flyAppName: args.flyAppName,
        machineId: machine.id,
        llmModel,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unable to force model";
      await ctx.runMutation(internal.storage.patchMachineRecord, {
        machineDocId,
        lastError: message,
      });
    }

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
}

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
    llmApiKey: v.optional(v.string()),
    llmModel: v.optional(v.string()),
    telegramBotToken: v.optional(v.string()),
    serviceId: v.optional(v.string()),
    serviceKey: v.optional(v.string()),
    openclawGatewayToken: v.string(),
    appKey: v.optional(v.string()),
    allowedSkillsJson: v.optional(v.string()),
    allowedSkills: v.optional(v.array(v.string())),
    restoreFromLatestSnapshot: v.optional(v.boolean()),
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
    return await provisionMachine(ctx, args);
  },
});

export const createAgentSnapshot = action({
  args: {
    machineDocId: v.id("agentMachines"),
    flyApiToken: v.string(),
    flyAppName: v.string(),
  },
  returns: v.object({
    snapshotId: v.id("agentSnapshots"),
    flyVolumeSnapshotId: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<{
    snapshotId: Id<"agentSnapshots">;
    flyVolumeSnapshotId?: string;
  }> => {
    return await createBackupSnapshotForMachine(ctx, args);
  },
});

export const sweepIdleAgentsAndSnapshot = action({
  args: {
    flyApiToken: v.string(),
    flyAppName: v.string(),
    idleMinutes: v.optional(v.number()),
    limit: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    scanned: v.number(),
    hibernated: v.number(),
    errors: v.number(),
  }),
  handler: async (ctx, args): Promise<{ scanned: number; hibernated: number; errors: number }> => {
    const now = Date.now();
    const idleMinutes = args.idleMinutes ?? 30;
    const cutoffMs = now - idleMinutes * 60_000;
    const staleMachines: any[] = await ctx.runQuery(internal.storage.listStaleRunningMachines, {
      cutoffMs,
      limit: args.limit,
    });
    let hibernated = 0;
    let errors = 0;

    for (const machine of staleMachines) {
      if (args.dryRun) {
        continue;
      }
      try {
        const snapshot = await createBackupSnapshotForMachine(ctx, {
          machineDocId: machine._id,
          flyApiToken: args.flyApiToken,
          flyAppName: args.flyAppName,
        });

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
          machineDocId: machine._id,
          status: "hibernated",
          lifecycleMode: "hibernated",
          latestSnapshotId: snapshot.snapshotId,
          lastWakeAt: now,
          lastActivityAt: now,
        });
        hibernated += 1;
      } catch (error: unknown) {
        errors += 1;
        await ctx.runMutation(internal.storage.patchMachineRecord, {
          machineDocId: machine._id,
          status: "error",
          lastError: error instanceof Error ? error.message : "Idle sweeper failure",
        });
      }
    }

    return {
      scanned: staleMachines.length,
      hibernated,
      errors,
    };
  },
});

export const recreateAgentFromLatestSnapshot = action({
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
    openclawGatewayToken: v.string(),
    appKey: v.optional(v.string()),
    allowedSkillsJson: v.optional(v.string()),
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
    const latest: any = await ctx.runQuery(internal.storage.getLatestMachineByUserTenant, {
      userId: args.userId,
      tenantId: args.tenantId,
    });
    if (latest?.status === "running" && latest.machineId) {
      return {
        machineDocId: latest._id,
        machineId: latest.machineId,
        volumeId: latest.flyVolumeId ?? "",
      };
    }
    return await provisionMachine(ctx, {
      ...args,
      restoreFromLatestSnapshot: true,
    });
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
      lastActivityAt: Date.now(),
      lifecycleMode: "running",
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
      lifecycleMode: "hibernated",
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
