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
        {
          _creationTime: number;
          _id: string;
          allowedSkills: Array<string>;
          appKey: string;
          bridgeUrl: string;
          flyVolumeId?: string;
          lastError?: string;
          lastWakeAt?: number;
          machineId?: string;
          memoryMB: number;
          region: string;
          serviceId: string;
          serviceKey: string;
          status: "deleted" | "error" | "provisioning" | "running" | "stopped";
          tenantId: string;
          userId: string;
        } | null,
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
          lastError?: string;
          lastWakeAt?: number;
          machineId?: string;
          memoryMB: number;
          region: string;
          serviceId: string;
          serviceKey: string;
          status: "deleted" | "error" | "provisioning" | "running" | "stopped";
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
          appKey?: string;
          bridgeUrl?: string;
          flyApiToken: string;
          flyAppName: string;
          image?: string;
          memoryMB?: number;
          region?: string;
          serviceId?: string;
          serviceKey?: string;
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
      updateAllowedSkills: FunctionReference<
        "mutation",
        "internal",
        { allowedSkills: Array<string>; machineDocId: string },
        null,
        Name
      >;
    };
  };
