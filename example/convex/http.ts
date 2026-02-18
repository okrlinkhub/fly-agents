import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server.js";
import { api } from "./_generated/api.js";

const http = httpRouter();

http.route({
  path: "/agents/list",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const tenantId = url.searchParams.get("tenantId");
    
    if (!tenantId) {
      return new Response("Missing tenantId parameter", { status: 400 });
    }

    const machines = await ctx.runQuery(api.example.listTenantMachines, { tenantId });

    return new Response(
      JSON.stringify({ tenantId, count: machines.length, machines }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }),
});

export default http;
