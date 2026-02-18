import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server.js";
import { internal } from "./_generated/api.js";
import type { Id } from "./_generated/dataModel.js";
import schema from "./schema.js";

const machineRecordValidator = schema.tables.agentMachines.validator.extend({
  _id: v.id("agentMachines"),
  _creationTime: v.number(),
});

const secretMetaValidator = v.object({
  tenantId: v.string(),
  userId: v.string(),
  updatedAt: v.number(),
  hasFlyApiToken: v.boolean(),
  hasLlmApiKey: v.boolean(),
  hasOpenaiApiKey: v.boolean(),
  hasTelegramBotToken: v.boolean(),
  hasOpenclawGatewayToken: v.boolean(),
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

function requiredArg(name: string, value?: string) {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`Missing required argument: ${name}`);
  }
  return normalized;
}

function requiredValue(name: string, value?: string, fallback?: string) {
  const normalizedValue = value?.trim();
  if (normalizedValue) {
    return normalizedValue;
  }
  const normalizedFallback = fallback?.trim();
  if (normalizedFallback) {
    return normalizedFallback;
  }
  throw new Error(`Missing required value: ${name}`);
}

function optionalValue(value?: string) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function defaultedValue(value: string | undefined, fallback: string) {
  return optionalValue(value) ?? fallback.trim();
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

type SecretPayload = {
  flyApiToken?: string;
  llmApiKey?: string;
  openaiApiKey?: string;
  telegramBotToken?: string;
  openclawGatewayToken?: string;
};

const cachedCryptoKeys = new Map<string, Promise<CryptoKey>>();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shellSingleQuote(value: string) {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function getSecretsCryptoKey(secretsEncryptionKey: string) {
  const secret = requiredArg("secretsEncryptionKey", secretsEncryptionKey);
  const cached = cachedCryptoKeys.get(secret);
  if (cached) {
    return await cached;
  }
  const keyPromise = (async () => {
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
    return await crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
  })();
  cachedCryptoKeys.set(secret, keyPromise);
  return await keyPromise;
}

async function encryptSecret(plaintext: string, secretsEncryptionKey: string) {
  const key = await getSecretsCryptoKey(secretsEncryptionKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return `${toBase64(iv)}.${toBase64(new Uint8Array(encrypted))}`;
}

async function decryptSecret(ciphertext: string, secretsEncryptionKey: string) {
  const key = await getSecretsCryptoKey(secretsEncryptionKey);
  const parts = ciphertext.split(".");
  if (parts.length !== 2) {
    throw new Error("Invalid encrypted secret format");
  }
  const [ivEncoded, payloadEncoded] = parts;
  if (!ivEncoded || !payloadEncoded) {
    throw new Error("Invalid encrypted secret format");
  }
  const iv = fromBase64(ivEncoded);
  const payload = fromBase64(payloadEncoded);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(payload),
  );
  return new TextDecoder().decode(decrypted);
}

function normalizeOptionalSecret(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
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

async function getSecretsForAgent(ctx: any, args: {
  tenantId: string;
  userId: string;
  secretsEncryptionKey: string;
}) {
  const agentKey = agentKeyFor(args.userId, args.tenantId);
  const record: any = await ctx.runQuery(internal.storage.getAgentSecretsRecord, { agentKey });
  if (!record) {
    return null;
  }
  const decrypted: SecretPayload = {};
  if (record.flyApiTokenEnc) {
    decrypted.flyApiToken = await decryptSecret(record.flyApiTokenEnc, args.secretsEncryptionKey);
  }
  if (record.llmApiKeyEnc) {
    decrypted.llmApiKey = await decryptSecret(record.llmApiKeyEnc, args.secretsEncryptionKey);
  }
  if (record.openaiApiKeyEnc) {
    decrypted.openaiApiKey = await decryptSecret(record.openaiApiKeyEnc, args.secretsEncryptionKey);
  }
  if (record.telegramBotTokenEnc) {
    decrypted.telegramBotToken = await decryptSecret(
      record.telegramBotTokenEnc,
      args.secretsEncryptionKey,
    );
  }
  if (record.openclawGatewayTokenEnc) {
    decrypted.openclawGatewayToken = await decryptSecret(
      record.openclawGatewayTokenEnc,
      args.secretsEncryptionKey,
    );
  }
  return decrypted;
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

export const getAgentSecretsMeta = query({
  args: {
    tenantId: v.string(),
    userId: v.string(),
  },
  returns: v.union(v.null(), secretMetaValidator),
  handler: async (ctx, args) => {
    const agentKey = agentKeyFor(args.userId, args.tenantId);
    const record: any = await ctx.runQuery(internal.storage.getAgentSecretsRecord, { agentKey });
    if (!record) {
      return null;
    }
    return {
      tenantId: record.tenantId,
      userId: record.userId,
      updatedAt: record.updatedAt,
      hasFlyApiToken: Boolean(record.flyApiTokenEnc),
      hasLlmApiKey: Boolean(record.llmApiKeyEnc),
      hasOpenaiApiKey: Boolean(record.openaiApiKeyEnc),
      hasTelegramBotToken: Boolean(record.telegramBotTokenEnc),
      hasOpenclawGatewayToken: Boolean(record.openclawGatewayTokenEnc),
    };
  },
});

export const upsertAgentSecrets = mutation({
  args: {
    tenantId: v.string(),
    userId: v.string(),
    secretsEncryptionKey: v.string(),
    flyApiToken: v.optional(v.string()),
    llmApiKey: v.optional(v.string()),
    openaiApiKey: v.optional(v.string()),
    telegramBotToken: v.optional(v.string()),
    openclawGatewayToken: v.optional(v.string()),
  },
  returns: secretMetaValidator,
  handler: async (ctx, args) => {
    const agentKey = agentKeyFor(args.userId, args.tenantId);
    const existing: any = await ctx.runQuery(internal.storage.getAgentSecretsRecord, { agentKey });

    const next = {
      flyApiToken: normalizeOptionalSecret(args.flyApiToken),
      llmApiKey: normalizeOptionalSecret(args.llmApiKey),
      openaiApiKey: normalizeOptionalSecret(args.openaiApiKey),
      telegramBotToken: normalizeOptionalSecret(args.telegramBotToken),
      openclawGatewayToken: normalizeOptionalSecret(args.openclawGatewayToken),
    };

    const flyApiTokenEnc =
      next.flyApiToken !== undefined
        ? await encryptSecret(next.flyApiToken, args.secretsEncryptionKey)
        : existing?.flyApiTokenEnc;
    const llmApiKeyEnc =
      next.llmApiKey !== undefined
        ? await encryptSecret(next.llmApiKey, args.secretsEncryptionKey)
        : existing?.llmApiKeyEnc;
    const openaiApiKeyEnc =
      next.openaiApiKey !== undefined
        ? await encryptSecret(next.openaiApiKey, args.secretsEncryptionKey)
        : existing?.openaiApiKeyEnc;
    const telegramBotTokenEnc =
      next.telegramBotToken !== undefined
        ? await encryptSecret(next.telegramBotToken, args.secretsEncryptionKey)
        : existing?.telegramBotTokenEnc;
    const openclawGatewayTokenEnc =
      next.openclawGatewayToken !== undefined
        ? await encryptSecret(next.openclawGatewayToken, args.secretsEncryptionKey)
        : existing?.openclawGatewayTokenEnc;

    const updatedAt = Date.now();
    await ctx.runMutation(internal.storage.upsertAgentSecretsRecord, {
      agentKey,
      tenantId: args.tenantId,
      userId: args.userId,
      flyApiTokenEnc,
      llmApiKeyEnc,
      openaiApiKeyEnc,
      telegramBotTokenEnc,
      openclawGatewayTokenEnc,
      updatedAt,
    });

    return {
      tenantId: args.tenantId,
      userId: args.userId,
      updatedAt,
      hasFlyApiToken: Boolean(flyApiTokenEnc),
      hasLlmApiKey: Boolean(llmApiKeyEnc),
      hasOpenaiApiKey: Boolean(openaiApiKeyEnc),
      hasTelegramBotToken: Boolean(telegramBotTokenEnc),
      hasOpenclawGatewayToken: Boolean(openclawGatewayTokenEnc),
    };
  },
});

export const clearAgentSecrets = mutation({
  args: {
    tenantId: v.string(),
    userId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const agentKey = agentKeyFor(args.userId, args.tenantId);
    await ctx.runMutation(internal.storage.clearAgentSecretsRecord, { agentKey });
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
  const bridgeUrl = requiredArg("bridgeUrl", args.bridgeUrl);
  const llmApiKey = requiredArg("llmApiKey", args.llmApiKey);
  const openaiApiKey = requiredValue("openaiApiKey", args.openaiApiKey, llmApiKey);
  const llmModel = defaultedValue(args.llmModel, DEFAULT_LLM_MODEL);
  assertAllowedModel(llmModel);
  const telegramBotToken = requiredArg("telegramBotToken", args.telegramBotToken);
  const serviceId = requiredArg("serviceId", args.serviceId);
  const serviceKey = requiredArg("serviceKey", args.serviceKey);
  const openclawGatewayToken = requiredArg("openclawGatewayToken", args.openclawGatewayToken);
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
            OPENAI_API_KEY: openaiApiKey,
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

    await forceDefaultModelOnMachine({
      flyApiToken: args.flyApiToken,
      flyAppName: args.flyAppName,
      machineId: machine.id,
      llmModel,
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
    openaiApiKey: v.optional(v.string()),
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
    openaiApiKey: v.optional(v.string()),
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

async function approveTelegramPairingOnMachine(args: {
  flyApiToken: string;
  flyAppName: string;
  machineId: string;
  telegramPairingCode: string;
}) {
  const pairingCode = args.telegramPairingCode.trim();
  if (!pairingCode) {
    throw new Error("TELEGRAM_PAIRING_CODE is required");
  }
  const command = `cd /app && node ./openclaw.mjs pairing approve telegram ${shellSingleQuote(pairingCode)}`;
  const execResponse = (await flyRequest({
    endpoint: `/apps/${args.flyAppName}/machines/${args.machineId}/exec`,
    token: args.flyApiToken,
    method: "POST",
    body: { command: ["sh", "-lc", command] },
  })) as { exit_code?: number; stderr?: string };
  if (typeof execResponse?.exit_code === "number" && execResponse.exit_code !== 0) {
    throw new Error(
      `pairing approve failed with exit code ${execResponse.exit_code}${
        execResponse.stderr ? `: ${execResponse.stderr}` : ""
      }`,
    );
  }
}

export const approveTelegramPairing = action({
  args: {
    machineDocId: v.id("agentMachines"),
    flyApiToken: v.string(),
    flyAppName: v.string(),
    telegramPairingCode: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const machine: any = await ctx.runQuery(internal.storage.getMachineRecord, {
      machineDocId: args.machineDocId,
    });
    if (!machine?.machineId) {
      throw new Error("Machine id not available");
    }
    await approveTelegramPairingOnMachine({
      flyApiToken: args.flyApiToken,
      flyAppName: args.flyAppName,
      machineId: machine.machineId,
      telegramPairingCode: args.telegramPairingCode,
    });
    await ctx.runMutation(internal.storage.patchMachineRecord, {
      machineDocId: args.machineDocId,
      lastWakeAt: Date.now(),
      lastActivityAt: Date.now(),
      lifecycleMode: "running",
    });
    return null;
  },
});

export const approveTelegramPairingWithStoredSecrets = action({
  args: {
    machineDocId: v.id("agentMachines"),
    flyAppName: v.string(),
    telegramPairingCode: v.string(),
    secretsEncryptionKey: v.string(),
    flyApiToken: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const machine: any = await ctx.runQuery(internal.storage.getMachineRecord, {
      machineDocId: args.machineDocId,
    });
    if (!machine?.machineId || !machine.userId || !machine.tenantId) {
      throw new Error("Machine record missing identity or machine id");
    }
    const secrets = await getSecretsForAgent(ctx, {
      tenantId: machine.tenantId,
      userId: machine.userId,
      secretsEncryptionKey: args.secretsEncryptionKey,
    });
    const flyApiToken = optionalValue(secrets?.flyApiToken) ?? optionalValue(args.flyApiToken);
    if (!flyApiToken) {
      throw new Error("Stored flyApiToken not found for this agent");
    }
    await approveTelegramPairingOnMachine({
      flyApiToken,
      flyAppName: args.flyAppName,
      machineId: machine.machineId,
      telegramPairingCode: args.telegramPairingCode,
    });
    await ctx.runMutation(internal.storage.patchMachineRecord, {
      machineDocId: args.machineDocId,
      lastWakeAt: Date.now(),
      lastActivityAt: Date.now(),
      lifecycleMode: "running",
    });
    return null;
  },
});

export const provisionAgentMachineWithStoredSecrets = action({
  args: {
    userId: v.string(),
    tenantId: v.string(),
    flyAppName: v.string(),
    secretsEncryptionKey: v.string(),
    flyApiToken: v.optional(v.string()),
    image: v.optional(v.string()),
    region: v.optional(v.string()),
    memoryMB: v.optional(v.number()),
    bridgeUrl: v.optional(v.string()),
    llmApiKey: v.optional(v.string()),
    openaiApiKey: v.optional(v.string()),
    telegramBotToken: v.optional(v.string()),
    openclawGatewayToken: v.optional(v.string()),
    llmModel: v.optional(v.string()),
    serviceId: v.optional(v.string()),
    serviceKey: v.optional(v.string()),
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
  handler: async (ctx, args) => {
    const secrets = await getSecretsForAgent(ctx, {
      tenantId: args.tenantId,
      userId: args.userId,
      secretsEncryptionKey: args.secretsEncryptionKey,
    });
    const flyApiToken = optionalValue(secrets?.flyApiToken) ?? optionalValue(args.flyApiToken);
    if (!flyApiToken) {
      throw new Error("Stored flyApiToken not found for this agent");
    }
    return await provisionMachine(ctx, {
      ...args,
      flyApiToken,
      llmApiKey: optionalValue(secrets?.llmApiKey) ?? optionalValue(args.llmApiKey),
      openaiApiKey: optionalValue(secrets?.openaiApiKey) ?? optionalValue(args.openaiApiKey),
      telegramBotToken: optionalValue(secrets?.telegramBotToken) ?? optionalValue(args.telegramBotToken),
      openclawGatewayToken:
        optionalValue(secrets?.openclawGatewayToken) ?? optionalValue(args.openclawGatewayToken),
    });
  },
});

export const recreateAgentFromLatestSnapshotWithStoredSecrets = action({
  args: {
    userId: v.string(),
    tenantId: v.string(),
    flyAppName: v.string(),
    secretsEncryptionKey: v.string(),
    flyApiToken: v.optional(v.string()),
    image: v.optional(v.string()),
    region: v.optional(v.string()),
    memoryMB: v.optional(v.number()),
    bridgeUrl: v.optional(v.string()),
    llmApiKey: v.optional(v.string()),
    openaiApiKey: v.optional(v.string()),
    telegramBotToken: v.optional(v.string()),
    openclawGatewayToken: v.optional(v.string()),
    llmModel: v.optional(v.string()),
    serviceId: v.optional(v.string()),
    serviceKey: v.optional(v.string()),
    appKey: v.optional(v.string()),
    allowedSkillsJson: v.optional(v.string()),
    allowedSkills: v.optional(v.array(v.string())),
  },
  returns: v.object({
    machineDocId: v.id("agentMachines"),
    machineId: v.string(),
    volumeId: v.string(),
  }),
  handler: async (ctx, args) => {
    const secrets = await getSecretsForAgent(ctx, {
      tenantId: args.tenantId,
      userId: args.userId,
      secretsEncryptionKey: args.secretsEncryptionKey,
    });
    const flyApiToken = optionalValue(secrets?.flyApiToken) ?? optionalValue(args.flyApiToken);
    if (!flyApiToken) {
      throw new Error("Stored flyApiToken not found for this agent");
    }
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
      flyApiToken,
      llmApiKey: optionalValue(secrets?.llmApiKey) ?? optionalValue(args.llmApiKey),
      openaiApiKey: optionalValue(secrets?.openaiApiKey) ?? optionalValue(args.openaiApiKey),
      telegramBotToken: optionalValue(secrets?.telegramBotToken) ?? optionalValue(args.telegramBotToken),
      openclawGatewayToken:
        optionalValue(secrets?.openclawGatewayToken) ?? optionalValue(args.openclawGatewayToken),
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

export const startAgentMachineWithStoredSecrets = action({
  args: {
    machineDocId: v.id("agentMachines"),
    flyAppName: v.string(),
    secretsEncryptionKey: v.string(),
    flyApiToken: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const machine: any = await ctx.runQuery(internal.storage.getMachineRecord, {
      machineDocId: args.machineDocId,
    });
    if (!machine?.tenantId || !machine?.userId) {
      throw new Error("Machine record missing identity fields");
    }
    const secrets = await getSecretsForAgent(ctx, {
      tenantId: machine.tenantId,
      userId: machine.userId,
      secretsEncryptionKey: args.secretsEncryptionKey,
    });
    const flyApiToken = optionalValue(secrets?.flyApiToken) ?? optionalValue(args.flyApiToken);
    if (!flyApiToken) {
      throw new Error("Stored flyApiToken not found for this agent");
    }
    if (!machine?.machineId) {
      throw new Error("Machine id not available");
    }
    await flyRequest({
      endpoint: `/apps/${args.flyAppName}/machines/${machine.machineId}/start`,
      token: flyApiToken,
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

export const stopAgentMachineWithStoredSecrets = action({
  args: {
    machineDocId: v.id("agentMachines"),
    flyAppName: v.string(),
    secretsEncryptionKey: v.string(),
    flyApiToken: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const machine: any = await ctx.runQuery(internal.storage.getMachineRecord, {
      machineDocId: args.machineDocId,
    });
    if (!machine?.tenantId || !machine?.userId) {
      throw new Error("Machine record missing identity fields");
    }
    const secrets = await getSecretsForAgent(ctx, {
      tenantId: machine.tenantId,
      userId: machine.userId,
      secretsEncryptionKey: args.secretsEncryptionKey,
    });
    const flyApiToken = optionalValue(secrets?.flyApiToken) ?? optionalValue(args.flyApiToken);
    if (!flyApiToken) {
      throw new Error("Stored flyApiToken not found for this agent");
    }
    if (!machine?.machineId) {
      throw new Error("Machine id not available");
    }
    await flyRequest({
      endpoint: `/apps/${args.flyAppName}/machines/${machine.machineId}/stop`,
      token: flyApiToken,
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

export const deprovisionAgentMachineWithStoredSecrets = action({
  args: {
    machineDocId: v.id("agentMachines"),
    flyAppName: v.string(),
    secretsEncryptionKey: v.string(),
    flyApiToken: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const machine: any = await ctx.runQuery(internal.storage.getMachineRecord, {
      machineDocId: args.machineDocId,
    });
    if (!machine?.tenantId || !machine?.userId) {
      throw new Error("Machine record missing identity fields");
    }
    const secrets = await getSecretsForAgent(ctx, {
      tenantId: machine.tenantId,
      userId: machine.userId,
      secretsEncryptionKey: args.secretsEncryptionKey,
    });
    const flyApiToken = optionalValue(secrets?.flyApiToken) ?? optionalValue(args.flyApiToken);
    if (!flyApiToken) {
      throw new Error("Stored flyApiToken not found for this agent");
    }
    if (machine.machineId) {
      await flyRequest({
        endpoint: `/apps/${args.flyAppName}/machines/${machine.machineId}`,
        token: flyApiToken,
        method: "DELETE",
      });
    }
    if (machine.flyVolumeId) {
      await flyRequest({
        endpoint: `/apps/${args.flyAppName}/volumes/${machine.flyVolumeId}`,
        token: flyApiToken,
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

export const createAgentSnapshotWithStoredSecrets = action({
  args: {
    machineDocId: v.id("agentMachines"),
    flyAppName: v.string(),
    secretsEncryptionKey: v.string(),
    flyApiToken: v.optional(v.string()),
  },
  returns: v.object({
    snapshotId: v.id("agentSnapshots"),
    flyVolumeSnapshotId: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const machine: any = await ctx.runQuery(internal.storage.getMachineRecord, {
      machineDocId: args.machineDocId,
    });
    if (!machine?.tenantId || !machine?.userId) {
      throw new Error("Machine record missing identity fields");
    }
    const secrets = await getSecretsForAgent(ctx, {
      tenantId: machine.tenantId,
      userId: machine.userId,
      secretsEncryptionKey: args.secretsEncryptionKey,
    });
    const flyApiToken = optionalValue(secrets?.flyApiToken) ?? optionalValue(args.flyApiToken);
    if (!flyApiToken) {
      throw new Error("Stored flyApiToken not found for this agent");
    }
    return await createBackupSnapshotForMachine(ctx, {
      machineDocId: args.machineDocId,
      flyApiToken,
      flyAppName: args.flyAppName,
    });
  },
});
