/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    lib: {
      approveTelegramPairing: FunctionReference<
        "action",
        "internal",
        {
          flyApiToken: string;
          flyAppName: string;
          machineDocId: string;
          telegramPairingCode: string;
        },
        null,
        Name
      >;
      approveTelegramPairingWithStoredSecrets: FunctionReference<
        "action",
        "internal",
        {
          flyApiToken?: string;
          flyAppName: string;
          machineDocId: string;
          secretsEncryptionKey: string;
          telegramPairingCode: string;
        },
        null,
        Name
      >;
      clearAgentSecrets: FunctionReference<
        "mutation",
        "internal",
        { tenantId: string; userId: string },
        null,
        Name
      >;
      createAgentSnapshot: FunctionReference<
        "action",
        "internal",
        { flyApiToken: string; flyAppName: string; machineDocId: string },
        { flyVolumeSnapshotId?: string; snapshotId: string },
        Name
      >;
      createAgentSnapshotWithStoredSecrets: FunctionReference<
        "action",
        "internal",
        {
          flyApiToken?: string;
          flyAppName: string;
          machineDocId: string;
          secretsEncryptionKey: string;
        },
        { flyVolumeSnapshotId?: string; snapshotId: string },
        Name
      >;
      deprovisionAgentMachine: FunctionReference<
        "action",
        "internal",
        { flyApiToken: string; flyAppName: string; machineDocId: string },
        null,
        Name
      >;
      deprovisionAgentMachineWithStoredSecrets: FunctionReference<
        "action",
        "internal",
        {
          flyApiToken?: string;
          flyAppName: string;
          machineDocId: string;
          secretsEncryptionKey: string;
        },
        null,
        Name
      >;
      getAgentMachine: FunctionReference<
        "query",
        "internal",
        { machineDocId: string },
        null | {
          _creationTime: number;
          _id: string;
          allowedSkills: Array<string>;
          appKey: string;
          bridgeUrl: string;
          flyVolumeId?: string;
          lastActivityAt?: number;
          lastError?: string;
          lastWakeAt?: number;
          latestSnapshotId?: string;
          lifecycleMode?: "running" | "hibernated";
          machineId?: string;
          memoryMB: number;
          region: string;
          serviceId: string;
          serviceKey: string;
          status:
            | "provisioning"
            | "running"
            | "stopped"
            | "hibernated"
            | "error"
            | "deleted";
          tenantId: string;
          userId: string;
        },
        Name
      >;
      getAgentSecretsMeta: FunctionReference<
        "query",
        "internal",
        { tenantId: string; userId: string },
        null | {
          hasFlyApiToken: boolean;
          hasLlmApiKey: boolean;
          hasOpenaiApiKey: boolean;
          hasOpenclawGatewayToken: boolean;
          hasTelegramBotToken: boolean;
          tenantId: string;
          updatedAt: number;
          userId: string;
        },
        Name
      >;
      listAgentMachinesByTenant: FunctionReference<
        "query",
        "internal",
        { tenantId: string },
        Array<{
          _creationTime: number;
          _id: string;
          allowedSkills: Array<string>;
          appKey: string;
          bridgeUrl: string;
          flyVolumeId?: string;
          lastActivityAt?: number;
          lastError?: string;
          lastWakeAt?: number;
          latestSnapshotId?: string;
          lifecycleMode?: "running" | "hibernated";
          machineId?: string;
          memoryMB: number;
          region: string;
          serviceId: string;
          serviceKey: string;
          status:
            | "provisioning"
            | "running"
            | "stopped"
            | "hibernated"
            | "error"
            | "deleted";
          tenantId: string;
          userId: string;
        }>,
        Name
      >;
      provisionAgentMachine: FunctionReference<
        "action",
        "internal",
        {
          allowedSkills?: Array<string>;
          allowedSkillsJson?: string;
          appKey?: string;
          bridgeUrl?: string;
          flyApiToken: string;
          flyAppName: string;
          image?: string;
          llmApiKey?: string;
          llmModel?: string;
          memoryMB?: number;
          openaiApiKey?: string;
          openclawGatewayToken: string;
          region?: string;
          restoreFromLatestSnapshot?: boolean;
          serviceId?: string;
          serviceKey?: string;
          telegramBotToken?: string;
          tenantId: string;
          userId: string;
        },
        { machineDocId: string; machineId: string; volumeId: string },
        Name
      >;
      provisionAgentMachineWithStoredSecrets: FunctionReference<
        "action",
        "internal",
        {
          allowedSkills?: Array<string>;
          allowedSkillsJson?: string;
          appKey?: string;
          bridgeUrl?: string;
          flyApiToken?: string;
          flyAppName: string;
          image?: string;
          llmApiKey?: string;
          llmModel?: string;
          memoryMB?: number;
          openaiApiKey?: string;
          openclawGatewayToken?: string;
          region?: string;
          restoreFromLatestSnapshot?: boolean;
          secretsEncryptionKey: string;
          serviceId?: string;
          serviceKey?: string;
          telegramBotToken?: string;
          tenantId: string;
          userId: string;
        },
        { machineDocId: string; machineId: string; volumeId: string },
        Name
      >;
      recreateAgentFromLatestSnapshot: FunctionReference<
        "action",
        "internal",
        {
          allowedSkills?: Array<string>;
          allowedSkillsJson?: string;
          appKey?: string;
          bridgeUrl?: string;
          flyApiToken: string;
          flyAppName: string;
          image?: string;
          llmApiKey?: string;
          llmModel?: string;
          memoryMB?: number;
          openaiApiKey?: string;
          openclawGatewayToken: string;
          region?: string;
          serviceId?: string;
          serviceKey?: string;
          telegramBotToken?: string;
          tenantId: string;
          userId: string;
        },
        { machineDocId: string; machineId: string; volumeId: string },
        Name
      >;
      recreateAgentFromLatestSnapshotWithStoredSecrets: FunctionReference<
        "action",
        "internal",
        {
          allowedSkills?: Array<string>;
          allowedSkillsJson?: string;
          appKey?: string;
          bridgeUrl?: string;
          flyApiToken?: string;
          flyAppName: string;
          image?: string;
          llmApiKey?: string;
          llmModel?: string;
          memoryMB?: number;
          openaiApiKey?: string;
          openclawGatewayToken?: string;
          region?: string;
          secretsEncryptionKey: string;
          serviceId?: string;
          serviceKey?: string;
          telegramBotToken?: string;
          tenantId: string;
          userId: string;
        },
        { machineDocId: string; machineId: string; volumeId: string },
        Name
      >;
      startAgentMachine: FunctionReference<
        "action",
        "internal",
        { flyApiToken: string; flyAppName: string; machineDocId: string },
        null,
        Name
      >;
      startAgentMachineWithStoredSecrets: FunctionReference<
        "action",
        "internal",
        {
          flyApiToken?: string;
          flyAppName: string;
          machineDocId: string;
          secretsEncryptionKey: string;
        },
        null,
        Name
      >;
      stopAgentMachine: FunctionReference<
        "action",
        "internal",
        { flyApiToken: string; flyAppName: string; machineDocId: string },
        null,
        Name
      >;
      stopAgentMachineWithStoredSecrets: FunctionReference<
        "action",
        "internal",
        {
          flyApiToken?: string;
          flyAppName: string;
          machineDocId: string;
          secretsEncryptionKey: string;
        },
        null,
        Name
      >;
      touchAgentActivity: FunctionReference<
        "mutation",
        "internal",
        { machineDocId: string },
        null,
        Name
      >;
      updateAllowedSkills: FunctionReference<
        "mutation",
        "internal",
        { allowedSkills: Array<string>; machineDocId: string },
        null,
        Name
      >;
      upsertAgentSecrets: FunctionReference<
        "mutation",
        "internal",
        {
          flyApiToken?: string;
          llmApiKey?: string;
          openaiApiKey?: string;
          openclawGatewayToken?: string;
          secretsEncryptionKey: string;
          telegramBotToken?: string;
          tenantId: string;
          userId: string;
        },
        {
          hasFlyApiToken: boolean;
          hasLlmApiKey: boolean;
          hasOpenaiApiKey: boolean;
          hasOpenclawGatewayToken: boolean;
          hasTelegramBotToken: boolean;
          tenantId: string;
          updatedAt: number;
          userId: string;
        },
        Name
      >;
    };
  };
