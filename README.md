# Convex Fly Agents

[![npm version](https://badge.fury.io/js/@okrlinkhub%2Ffly-agents.svg)](https://badge.fury.io/js/@okrlinkhub%2Ffly-agents)

`@okrlinkhub/fly-agents` is a Convex component for provisioning and managing
Fly.io machines dedicated to OpenClaw agents.

The component is focused on:

- machine lifecycle (`provision`, `start`, `stop`, `deprovision`);
- metadata and status tracking in Convex;
- propagation of runtime environment (bridge URL, service credentials, skill
  whitelist).

## Installation

```sh
npm install @okrlinkhub/fly-agents
```

Enable the component in `convex/convex.config.ts`:

```ts
import { defineApp } from "convex/server";
import flyAgents from "@okrlinkhub/fly-agents/convex.config.js";

const app = defineApp();
app.use(flyAgents);

export default app;
```

## API Surface

Main component functions (`components.flyAgents.lib.*`):

- `provisionAgentMachine`
- `startAgentMachine`
- `stopAgentMachine`
- `deprovisionAgentMachine`
- `listAgentMachinesByTenant`
- `getAgentMachine`
- `updateAllowedSkills`

## Example

```ts
import { action } from "./_generated/server";
import { components } from "./_generated/api";
import { v } from "convex/values";

export const provision = action({
  args: {
    userId: v.string(),
    tenantId: v.string(),
    flyApiToken: v.string(),
    flyAppName: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.runAction(components.flyAgents.lib.provisionAgentMachine, args);
  },
});
```

See more example usage in [example.ts](./example/convex/example.ts).

## Local Development

```sh
npm i
npm run dev
```
