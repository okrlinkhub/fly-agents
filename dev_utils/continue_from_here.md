# Continuazione E2E OpenClaw + Fly.io + Telegram

## Stato attuale (checkpoint)

### Completato
- `fly-agents` ripulito dal template `comments/translate`.
- API lifecycle implementate in `fly-agents` (provision/start/stop/deprovision/list/get/update skills).
- `openclaw-okr-image` aggiornato:
  - `Dockerfile` usa `ghcr.io/openclaw/openclaw:latest`.
  - install runtime Node.
  - copia skill `skills/linkhub-bridge/`.
- Skill script `fetch_context.js` aggiornato:
  - rimosso functionKey inesistente `getOkrContext`.
  - usa functionKey reali del bridge:
    - `users.me`
    - `objectives.getAllForCurrentUser`
    - `initiatives.getAllForCurrentUser`
    - opzionale `initiatives.getImpactDetails` (se `OPENCLAW_INITIATIVE_ID` presente).
  - usa header strict + `Authorization: Bearer <jwt>`.
- `entrypoint.sh` migrato da modalità legacy `--character` a CLI nuova:
  - avvio via `node /app/openclaw.mjs gateway run ...`.
  - bootstrap automatico config minima `/data/openclaw/config.json` con `gateway.mode=local`.
- Build immagine locale riuscita: `linkhub-agents:openclaw-okr-v1`.
- Smoke test script standalone (bypass entrypoint) riuscito.

### Verifiche bridge host (`linkhub-w4`)
- Route bridge attive:
  - `POST /agent/execute`
  - `GET /agent/functions`
- Config bridge con authMode user per function key sopra.

## Blocco corrente

Errore in avvio gateway:

- `gateway mode local requires auth`
- Serve impostare auth gateway con token/password.

In pratica la CLI richiede una di queste:
- `OPENCLAW_GATEWAY_TOKEN` (consigliato),
- oppure flag `--token`,
- oppure password mode.

## Cosa fare alla ripartenza (ordine operativo)

### 1) Avvio gateway con token (sblocca il blocco attuale)
Usare un token di test robusto (staging):

```bash
docker run --rm -it \
  -p 3000:3000 \
  -e AGENT_BRIDGE_URL="https://woozy-retriever-951.convex.site" \
  -e OPENCLAW_SERVICE_ID="openclaw-prod" \
  -e OPENCLAW_SERVICE_KEY="<SERVICE_KEY>" \
  -e OPENCLAW_GATEWAY_BIND="lan" \
  -e OPENCLAW_GATEWAY_PORT="3000" \
  -e OPENCLAW_GATEWAY_TOKEN="<RANDOM_LONG_TOKEN>" \
  linkhub-agents:openclaw-okr-v1
```

Atteso: gateway parte senza errore auth.

### 2) Validare config bootstrap sul volume
Controllare che esista:
- `/data/openclaw/config.json`
- con `gateway.mode=local`

### 3) Smoke test skill standalone (bypass entrypoint)
Questo resta il test più affidabile per la parte bridge:

```bash
docker run --rm \
  --entrypoint node \
  -e AGENT_BRIDGE_URL="https://woozy-retriever-951.convex.site" \
  -e OPENCLAW_SERVICE_ID="openclaw-prod" \
  -e OPENCLAW_SERVICE_KEY="<SERVICE_KEY>" \
  -e OPENCLAW_APP_KEY="linkhub-w4" \
  -e OPENCLAW_USER_JWT="<JWT_VALIDO_CONVEX>" \
  linkhub-agents:openclaw-okr-v1 \
  /app/skills/linkhub-bridge/scripts/fetch_context.js "user123" "Ciao"
```

Atteso: JSON aggregato con `user/objectives/initiatives`.

### 4) Verificare bridge direttamente con curl

```bash
curl -sS "https://woozy-retriever-951.convex.site/agent/functions"
```

```bash
curl -sS -X POST "https://woozy-retriever-951.convex.site/agent/execute" \
  -H "Content-Type: application/json" \
  -H "X-Agent-Service-Id: openclaw-prod" \
  -H "X-Agent-Service-Key: <SERVICE_KEY>" \
  -H "X-Agent-App: linkhub-w4" \
  -H "Authorization: Bearer <JWT_VALIDO_CONVEX>" \
  -d '{"functionKey":"users.me","args":{}}'
```

### 5) Procedere con test E2E Telegram
- Avviare machine Fly con immagine aggiornata e stesse env.
- Inviare messaggio Telegram al bot.
- Verificare:
  - log container OpenClaw,
  - log Convex bridge (`/agent/execute`),
  - risposta finale sul canale Telegram.

## Nota su `.env.local`
- Tenere solo variabili `KEY=VALUE`.
- Non inserire comandi shell nel file.

## Sicurezza (da fare)
- Rotare segreti esposti durante i test:
  - `OPENAI_API_KEY`
  - `OPENCLAW_SERVICE_KEY`
  - `TELEGRAM_BOT_TOKEN`
- Spostare i segreti in env management Fly/Convex e non committarli.
