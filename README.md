# Convex Fly Agents

[![npm version](https://badge.fury.io/js/@okrlinkhub%2Ffly-agents.svg)](https://badge.fury.io/js/@okrlinkhub%2Ffly-agents)

`@okrlinkhub/fly-agents` is a Convex component for provisioning and managing
Fly.io machines dedicated to OpenClaw agents.

The component is focused on:

- machine lifecycle (`provision`, `start`, `stop`, `deprovision`);
- metadata and status tracking in Convex;
- propagation of runtime environment (bridge URL, service credentials, skill
  whitelist).

Required runtime values for OpenClaw provisioning:

- `LLM_MODEL` (must not be `gpt-5-mini`)
- `LLM_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `AGENT_BRIDGE_URL`
- `ALLOWED_SKILLS_JSON`
- `OPENCLAW_APP_KEY`
- `TENANT_ID`
- `USER_ID`
- `OPENCLAW_SERVICE_ID`
- `OPENCLAW_SERVICE_KEY`
- `OPENCLAW_GATEWAY_TOKEN`
- `AGENT_SECRETS_ENCRYPTION_KEY` (required if using stored-secrets APIs)

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
- `recreateAgentFromLatestSnapshot`
- `startAgentMachine`
- `stopAgentMachine`
- `deprovisionAgentMachine`
- `touchAgentActivity`
- `createAgentSnapshot`
- `listAgentMachinesByTenant`
- `getAgentMachine`
- `updateAllowedSkills`
- `upsertAgentSecrets`
- `getAgentSecretsMeta`
- `clearAgentSecrets`
- `provisionAgentMachineWithStoredSecrets`
- `recreateAgentFromLatestSnapshotWithStoredSecrets`
- `startAgentMachineWithStoredSecrets`
- `stopAgentMachineWithStoredSecrets`
- `deprovisionAgentMachineWithStoredSecrets`
- `createAgentSnapshotWithStoredSecrets`
- `approveTelegramPairing`
- `approveTelegramPairingWithStoredSecrets`

Agent secrets are stored in component table `agentVmSecrets` and encrypted
at rest using `AGENT_SECRETS_ENCRYPTION_KEY`.

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
    llmModel: v.string(),
    llmApiKey: v.string(),
    telegramBotToken: v.string(),
    bridgeUrl: v.string(),
    allowedSkillsJson: v.string(),
    appKey: v.string(),
    serviceId: v.string(),
    serviceKey: v.string(),
    openclawGatewayToken: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.runAction(components.flyAgents.lib.provisionAgentMachine, args);
  },
});
```

See more example usage in [example.ts](./example/convex/example.ts).

## Post-Provisioning Steps (Telegram + Model)

After provisioning a new machine, run these operational steps before handing the
service to the end user.

### 1) Approve Telegram pairing code

When the user sends a Telegram pairing code, approve it on the target machine:

```sh
fly ssh console -a "<fly-app-name>" --machine "<machine-id>" -C "sh -lc 'cd /app && node ./openclaw.mjs pairing approve telegram <PAIRING_CODE>'"
```

Or via component action:

```ts
await ctx.runAction(components.flyAgents.lib.approveTelegramPairingWithStoredSecrets, {
  machineDocId,
  flyAppName: "your-fly-app",
  telegramPairingCode: "<PAIRING_CODE>",
});
```

Notes:

- Use `node ./openclaw.mjs ...` (the `openclaw` binary may not be in `PATH`).
- Replace `<PAIRING_CODE>` with the code received from the user.
- Run this command as a single-shot operation only (no parallel retries).

### Pairing safe flow (anti-concurrency)

To avoid gateway instability caused by concurrent pairing commands:

1. Run exactly one pairing command per machine at a time.
2. If a pairing command appears stuck, do not launch another one; restart the
   machine first.
3. Re-run a single pairing command only after the gateway is healthy again.

Quick checks:

```sh
# Gateway actually listening
fly logs -a "<fly-app-name>" --machine "<machine-id>" --no-tail

# Should include: [gateway] listening on ws://0.0.0.0:3000
```

### 2) Force the configured model on OpenClaw

With the current OpenClaw image, `LLM_MODEL` can be present in machine env but
the runtime may keep using a previously persisted default model. Force the model
right after provisioning:

```sh
fly ssh console -a "<fly-app-name>" --machine "<machine-id>" -C "sh -lc 'cd /app && node ./openclaw.mjs models set <LLM_MODEL>'"
```

Recommended model id format includes provider prefix, for example:

- `moonshotai/kimi-k2.5`

### 3) Verify effective model

```sh
fly ssh console -a "<fly-app-name>" --machine "<machine-id>" -C "sh -lc 'cd /app && node ./openclaw.mjs models status --plain'"
```

### Gateway startup note (image behavior)

If a new machine stays in `started` state but no `[gateway] listening ...` line
appears in logs, rebuild and deploy an image where `entrypoint.sh` does not force
`--dev` by default for `gateway run`.

- Default recommended: production startup without `--dev`.
- Optional dev mode: set `OPENCLAW_GATEWAY_DEV_MODE=true` only when needed.

Current hardened image behavior:

- Cleans `/tmp/openclaw` and `/tmp/openclaw-*` at each boot.
- Applies readiness watchdog on gateway startup.
- Fails fast if gateway does not bind in time (`OPENCLAW_STARTUP_TIMEOUT_SEC`,
  default `240`), so Fly restart policy can recover automatically.
- Uses TCP readiness checks with `grace_period=240s` to reduce false positives
  (`VM started` while gateway is still booting).

## Lifecycle model

The component does not perform automatic idle shutdowns. Machines stay active
until an explicit lifecycle action is called.

Use manual actions when needed:

- `startAgentMachine` / `startAgentMachineWithStoredSecrets`
- `stopAgentMachine` / `stopAgentMachineWithStoredSecrets`
- `deprovisionAgentMachine` / `deprovisionAgentMachineWithStoredSecrets`

Snapshots remain available as explicit operations (`createAgentSnapshot`,
`recreateAgentFromLatestSnapshot`) and are not tied to an automatic idle
sweeper.

### Gateway auth requirement (critical)

When binding gateway on `lan`, `OPENCLAW_GATEWAY_TOKEN` must be set on the
machine. If missing/empty, OpenClaw refuses to bind and the machine can look
"healthy" on Fly while the gateway is not actually serving traffic.

Expected failure logs when token is missing:

- `Refusing to bind gateway to lan without auth.`
- `Set gateway.auth.token/password (or OPENCLAW_GATEWAY_TOKEN/OPENCLAW_GATEWAY_PASSWORD) ...`

Quick fix:

```sh
fly machine update "<machine-id>" -a "<fly-app-name>" -e OPENCLAW_GATEWAY_TOKEN="<token>" --yes
```

### Version compatibility note

If logs show:

- `Config was last written by a newer OpenClaw (...)`

the runtime image version is older than the config/state writer and startup can
be unstable. Prefer running machines with a consistent OpenClaw version across
restarts and rebuilds.

## Local Development

```sh
npm i
npm run dev
```
