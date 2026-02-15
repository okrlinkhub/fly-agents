# Fly Agents T3 - Istruzioni Semplificate

## Scope e boundary

Architettura finale:

- `linkhub-w4` (host Convex):
  - componente `@okrlinkhub/agent-bridge` per auth/policy su `/agent/execute`;
  - componente `@okrlinkhub/fly-agents` per provisioning/lifecycle Fly machines.
- `openclaw-okr-v1` (container su Fly):
  - usa skill nativa file-based (`SKILL.md`);
  - usa script on-demand `fetch_context.js` per chiamare il bridge via HTTP.

Decisioni non negoziabili:

- nessun sidecar;
- nessun package npm client dedicato al bridge dentro container;
- route HTTP definite nell'app host Convex, non nel componente `fly-agents`.

## Data model fly-agents

Tabella principale: `agentMachines`

Campi minimi:

- `userId`, `tenantId`
- `machineId`, `flyVolumeId`
- `status` (`provisioning | running | stopped | error | deleted`)
- `allowedSkills`
- `memoryMB`, `region`
- `bridgeUrl`, `serviceId`, `serviceKey`, `appKey`
- `lastWakeAt`, `lastError`

Indici minimi:

- `by_tenantId`
- `by_machineId`
- `by_userId_and_tenantId`

## API componente fly-agents

Funzioni pubbliche:

- `provisionAgentMachine`
- `startAgentMachine`
- `stopAgentMachine`
- `deprovisionAgentMachine`
- `listAgentMachinesByTenant`
- `getAgentMachine`
- `updateAllowedSkills`

Linee guida:

- chiamate Fly API solo in `action` Node;
- persistenza stato solo via query/mutation interne;
- default hardening skill whitelist:
  - `ALLOWED_SKILLS_JSON = ["linkhub-bridge"]`.

## Runtime skill OpenClaw

Struttura file nel container:

- `skills/linkhub-bridge/SKILL.md`
- `skills/linkhub-bridge/scripts/fetch_context.js`

Requisiti script:

- shebang obbligatorio: `#!/usr/bin/env node`;
- args richiesti: `userId`, `message`;
- env richieste:
  - `AGENT_BRIDGE_URL`
  - `OPENCLAW_SERVICE_ID`
  - `OPENCLAW_SERVICE_KEY`
  - `OPENCLAW_APP_KEY` (opzionale: se assente usare default hardcoded);
- headers richiesti verso bridge:
  - `X-Agent-Service-Id`
  - `X-Agent-Service-Key`
  - `X-Agent-App`
- output:
  - solo JSON su `stdout` in successo;
  - JSON errore su `stderr` con `exit(1)` in failure.

Pattern errore obbligatorio:

- se `res.ok === false`, includere body testuale:
  - `HTTP <status>: <body>`.

## Docker/OpenClaw bootstrap

### Dockerfile

Requisiti build:

- base `openclaw/openclaw:latest`;
- install Node runtime in modo compatibile:
  - Alpine: `apk add --no-cache nodejs npm`
  - Debian/Ubuntu: `apt-get update && apt-get install -y nodejs npm`
- validazione in build:
  - `node --version`
  - `npm --version`
- copia skill:
  - `COPY skills/ /app/skills/`
- permessi script:
  - `chmod +x /app/skills/linkhub-bridge/scripts/*.js`

### entrypoint.sh

Requisiti runtime:

- validare env minime (`AGENT_BRIDGE_URL`, `OPENCLAW_SERVICE_ID`, `OPENCLAW_SERVICE_KEY`);
- creare `/data/character.json` in modo idempotente;
- rispettare `ALLOWED_SKILLS_JSON` (default `["linkhub-bridge"]`);
- avviare OpenClaw senza processi secondari.

## Host integration (linkhub-w4)

In `convex/http.ts` mantenere attivo `agent-bridge`:

- `POST /agent/execute`
- `GET /agent/functions`

Note:

- se usi auth strict bridge, `X-Agent-App` e obbligatorio;
- in single-app puoi hardcodare `OPENCLAW_APP_KEY` nello script.

## Smoke test anti-fallimento build (obbligatorio stasera)

1. Build immagine.
2. Verifica runtime Node:

```sh
docker run --rm <image> node --version
```

3. Verifica script standalone:

```sh
docker run --rm \
  -e AGENT_BRIDGE_URL=https://<your-convex-site> \
  -e OPENCLAW_SERVICE_ID=test \
  -e OPENCLAW_SERVICE_KEY=secret \
  -e OPENCLAW_APP_KEY=linkhub-w4 \
  <image> \
  node /app/skills/linkhub-bridge/scripts/fetch_context.js "user123" "Ciao"
```

Esito atteso:

- stdout JSON valido;
- errore bridge -> stderr JSON e exit code non-zero;
- se compare HTML/404, URL bridge o route host sono errati.

## Definition of Done

- nessun riferimento a client npm bridge nel container;
- skill nativa `linkhub-bridge` presente e funzionante;
- fly-agents limita `ALLOWED_SKILLS_JSON` a whitelist verificata;
- provisioning/lifecycle macchine funzionante con stato persistito su Convex.