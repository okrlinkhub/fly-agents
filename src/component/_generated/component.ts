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
      createAgentSnapshot: FunctionReference<
        "action",
        "internal",
        { flyApiToken: string; flyAppName: string; machineDocId: string },
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
      startAgentMachine: FunctionReference<
        "action",
        "internal",
        { flyApiToken: string; flyAppName: string; machineDocId: string },
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
      sweepIdleAgentsAndSnapshot: FunctionReference<
        "action",
        "internal",
        {
          dryRun?: boolean;
          flyApiToken: string;
          flyAppName: string;
          idleMinutes?: number;
          limit?: number;
        },
        { errors: number; hibernated: number; scanned: number },
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
    };
  };
