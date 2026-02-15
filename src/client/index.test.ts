import { describe, expect, test } from "vitest";
import { exposeApi } from "./index.js";
import { anyApi, type ApiFromModules } from "convex/server";
import { components, initConvexTest } from "./setup.test.js";

export const { listAgentMachinesByTenant, updateAllowedSkills } = exposeApi(
  components.flyAgents,
  {
  auth: async (ctx, _operation) => {
    return (await ctx.auth.getUserIdentity())?.subject ?? "anonymous";
  },
},
);

const testApi = (
  anyApi as unknown as ApiFromModules<{
    "index.test": {
      listAgentMachinesByTenant: typeof listAgentMachinesByTenant;
      updateAllowedSkills: typeof updateAllowedSkills;
    };
  }>
)["index.test"];

describe("client tests", () => {
  test("should be able to use client", async () => {
    const t = initConvexTest().withIdentity({
      subject: "user1",
    });
    const machines = await t.query(testApi.listAgentMachinesByTenant, {
      tenantId: "tenant-1",
    });
    expect(machines).toHaveLength(0);
  });
});
