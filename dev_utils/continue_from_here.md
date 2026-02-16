# Continuazione E2E OpenClaw + Fly.io + Telegram

## Stato attuale (checkpoint)

### Completato
- `fly-agents` ripulito dal template `comments/translate`.
- API lifecycle implementate in `fly-agents` (provision/start/stop/deprovision/list/get/update skills).
- Provisioning aggiornato per passare il token auth gateway:
  - aggiunto arg opzionale `openclawGatewayToken` in `src/component/lib.ts`;
  - fallback su env server-side `OPENCLAW_GATEWAY_TOKEN`;
  - inoltro su macchina Fly in `env.OPENCLAW_GATEWAY_TOKEN`.
- API pubblica aggiornata per propagare il nuovo argomento:
  - `src/client/index.ts` (`provisionAgentMachine`);
  - `example/convex/example.ts` (`provisionAgent`).
- Corretto naming volume Fly in provisioning:
  - ora solo `lowercase alphanumeric + _`, max 30;
  - evita errore Fly su nome volume non valido.
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
- Gateway avviato con token: OK (log: listening on ws://0.0.0.0:3000).
- Convex env impostate su deployment dev:
  - `AGENT_BRIDGE_URL`
  - `OPENCLAW_SERVICE_ID`
  - `OPENCLAW_SERVICE_KEY`
  - `OPENCLAW_GATEWAY_TOKEN`
  - `OPENCLAW_APP_KEY`
- App Fly verificata: `linkhub-agents` esiste, owner `linkhub`, non ancora lanciata con machine funzionante.

### Verifiche bridge host (`linkhub-w4`)
- Route bridge attive:
  - `POST /agent/execute`
  - `GET /agent/functions`
- Config bridge con authMode user per function key sopra.

## Blocco corrente

Il blocco `gateway mode local requires auth` e' stato risolto con `OPENCLAW_GATEWAY_TOKEN`.

Nuovo blocco attuale:
- provisioning Fly via API fallisce su immagine non trovata:
  - `MANIFEST_UNKNOWN`
  - `manifest unknown`
  - `unknown tag=openclaw-okr-v1`
- in pratica il tag `registry.fly.io/linkhub-agents:openclaw-okr-v1` non risulta pubblicato correttamente sul registry Fly.

Nota operativa:
- i push Docker/Fly partono e caricano molti layer, ma restano in retry su pochi layer e non pubblicano il manifest finale.

## Cosa fare alla ripartenza (ordine operativo)

Shortcut:
- disponibile script `dev_utils/resume.sh` per rilanciare rapidamente publish + provisioning + logs.
- uso:
  - `bash dev_utils/resume.sh`
  - `bash dev_utils/resume.sh --publish-only`
  - `bash dev_utils/resume.sh --skip-publish`

### 1) Sbloccare il publish immagine su Fly Registry (blocco principale)

Verifiche rapide:

```bash
fly auth whoami
fly status -a linkhub-agents
docker image ls | rg 'linkhub-agents|openclaw-okr-v1'
```

Push esplicito (prima scelta):

```bash
fly auth docker
docker tag linkhub-agents:openclaw-okr-v1 registry.fly.io/linkhub-agents:openclaw-okr-v1
docker push registry.fly.io/linkhub-agents:openclaw-okr-v1
```

Se resta bloccato su retry layer:
- rilanciare `docker push` subito (spesso completa al secondo tentativo),
- in alternativa cambiare tag (es. `openclaw-okr-v2`) e ritentare,
- verificare anche da rete diversa/VPN off (possibile problema trasporto layer).

Controllo risultato atteso:
- il provisioning non deve piu' restituire `manifest unknown`.

### 2) Provisioning macchina Fly via Convex (una volta pubblicato il tag)

```bash
TOKEN=$(fly tokens create deploy -a linkhub-agents -x 24h -j | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);console.log(j.token || j.Token || j.access_token || '')});")

npx convex run example:provisionAgent "{
  \"userId\":\"user123\",
  \"tenantId\":\"linkhub-w4\",
  \"flyApiToken\":\"$TOKEN\",
  \"flyAppName\":\"linkhub-agents\",
  \"bridgeUrl\":\"https://determined-kudu-49.convex.site\",
  \"serviceId\":\"openclaw-prod\",
  \"serviceKey\":\"<SERVICE_KEY>\",
  \"appKey\":\"linkhub-w4\",
  \"openclawGatewayToken\":\"<GATEWAY_TOKEN>\",
  \"image\":\"registry.fly.io/linkhub-agents:openclaw-okr-v1\"
}"
```

Atteso:
- output con `machineDocId`, `machineId`, `volumeId`.

### 3) Validare startup OpenClaw sulla machine Fly

```bash
fly logs -a linkhub-agents
```

Atteso nei log:
- gateway in ascolto,
- nessun errore auth gateway.

### 4) Validare config bootstrap sul volume

Via SSH (opzionale ma utile):

```bash
fly ssh console -a linkhub-agents -s <machineId> -C 'cat /data/openclaw/config.json'
```

Controllare che esista:
- `/data/openclaw/config.json`
- con `gateway.mode=local`

### 5) Smoke test skill standalone (bypass entrypoint)
Questo resta il test più affidabile per la parte bridge:

```bash
docker run --rm \
  --entrypoint node \
  -e AGENT_BRIDGE_URL="https://determined-kudu-49.convex.site" \
  -e OPENCLAW_SERVICE_ID="openclaw-prod" \
  -e OPENCLAW_SERVICE_KEY="<SERVICE_KEY>" \
  -e OPENCLAW_APP_KEY="linkhub-w4" \
  -e OPENCLAW_USER_JWT="<JWT_VALIDO_CONVEX>" \
  linkhub-agents:openclaw-okr-v1 \
  /app/skills/linkhub-bridge/scripts/fetch_context.js "user123" "Ciao"
```

Atteso: JSON aggregato con `user/objectives/initiatives`.

### 6) Verificare bridge direttamente con curl

```bash
curl -sS "https://determined-kudu-49.convex.site/agent/functions"
```

```bash
curl -sS -X POST "https://determined-kudu-49.convex.site/agent/execute" \
  -H "Content-Type: application/json" \
  -H "X-Agent-Service-Id: openclaw-prod" \
  -H "X-Agent-Service-Key: <SERVICE_KEY>" \
  -H "X-Agent-App: linkhub-w4" \
  -H "Authorization: Bearer <JWT_VALIDO_CONVEX>" \
  -d '{"functionKey":"users.me","args":{}}'
```

### 7) Procedere con test E2E Telegram
- Avviare machine Fly con immagine aggiornata e stesse env.
- Inviare messaggio Telegram al bot.
- Verificare:
  - log container OpenClaw,
  - log Convex bridge (`/agent/execute`),
  - risposta finale sul canale Telegram.

### 8) Ridurre costo model (post-sblocco deploy)

Osservazione:
- nei log compare `agent model: anthropic/claude-opus-4-6` (default costoso).

Azione:
- impostare model piu' economico in config runtime OpenClaw (`/data/openclaw/config.json`) o tramite env supportata dall'immagine usata.
- opzioni tipiche:
  - `openai/gpt-4.1-mini`
  - `anthropic/claude-3-5-haiku-latest`

## Nota su `.env.local`
- Tenere solo variabili `KEY=VALUE`.
- Non inserire comandi shell nel file.

## Sicurezza (da fare)
- Rotare segreti esposti durante i test:
  - `OPENAI_API_KEY`
  - `OPENCLAW_SERVICE_KEY`
  - `TELEGRAM_BOT_TOKEN`
- Spostare i segreti in env management Fly/Convex e non committarli.

## Aggiornamento operativo (2026-02-16)
- Publish immagine sbloccato tramite remote builder Fly:
  - `fly deploy --build-only --push --app linkhub-agents`
  - tag pubblicato: `registry.fly.io/linkhub-agents:deployment-01KHJ8TTCFGBZX0Y9CYKAKP22M`
  - digest usato in esecuzione: `sha256:86eabea28a2c38cbf9b572c246bebf4426f5cfd8aff93bfdd4bddc48951fb457`
- Provisioning Convex riuscito con immagine remota:
  - `machineDocId`: `j578q0ae8gy387px79ncrn035x818gp3`
  - `machineId`: `3d8de391c4d618`
  - `volumeId`: `vol_v3lxdl7eom67xqxv`
- Root cause restart Fly Doctor identificata:
  - non env mancanti (presenti nella machine config),
  - ma OOM V8 (`Reached heap limit`) con `memory_mb=512`.
- Mitigazione applicata sulla machine esistente:
  - upgrade a `memory_mb=2048`,
  - env `NODE_OPTIONS=--max-old-space-size=1536`.
- Stato attuale verificato:
  - machine `3d8de391c4d618` in `started`,
  - gateway avviato (`listening on ws://0.0.0.0:3000`),
  - bootstrap config presente su volume (`/data/openclaw/config.json` con `gateway.mode=local`),
  - smoke test bridge OK:
    - `GET /agent/functions` OK,
    - `POST /agent/execute` (`users.me`) OK con `success:true`.

### Hardening applicato nel codice
- Default provisioning memoria aumentata:
  - `src/component/lib.ts`: `memoryMB` default da `512` a `2048`.
- Script di ripartenza aggiornato:
  - `dev_utils/resume.sh` ora accetta `MEMORY_MB` (default `2048`) e lo passa a `example:provisionAgent`.

### Prossimo passo immediato
- Eseguire E2E Telegram:
  - lasciare la machine attiva,
  - inviare un messaggio reale al bot,
  - monitorare in parallelo:
    - `fly logs -a linkhub-agents`
    - log bridge Convex su `/agent/execute`
    - risposta finale su Telegram.

## Aggiornamento operativo (2026-02-16, sessione "macchina clean da zero")

### Obiettivo della sessione
Ricreare tutto da zero come primo onboarding utente, con nuova machine pulita su Fly, pairing Telegram, e chiusura test E2E.

### Stato raggiunto (fatto)
- Cleanup completo eseguito:
  - deprovision di tutti i record Convex storici del tenant.
  - `fly machine list -a linkhub-agents` -> nessuna machine residua.
- Nuova immagine pubblicata via remote builder:
  - `registry.fly.io/linkhub-agents:deployment-01KHJDP5H0ANGBZJTTJGZXRRB9`
- Secret app-level impostato:
  - `TELEGRAM_BOT_TOKEN` su app `linkhub-agents` (non solo su singola machine).
- Nuova machine pulita creata via `example:provisionAgent`:
  - `machineDocId`: `j5763gcz57w1s3gws2enthe3qd818w75`
  - `machineId`: `683269df435328`
  - `volumeId`: `vol_vpgnq9qx0p869xev`
- Gateway e provider Telegram verificati nei log:
  - `listening on ws://0.0.0.0:3000`
  - `[telegram] [default] starting provider (@LH_MarcoBot)`
- Pairing request trovata su volume:
  - `/data/openclaw/state/credentials/telegram-pairing.json` conteneva il code `5YTM9KFX`.
- Approvazione manuale riuscita (workaround):
  - popolato allowlist: `/data/openclaw/state/credentials/telegram-default-allowFrom.json`
  - `allowFrom` contiene `8246761447`.
- Hardening runtime applicato in codice:
  - `src/component/lib.ts` aggiornato per nuove machine:
    - `OPENCLAW_STATE_DIR=/data/openclaw/state`
    - `OPENCLAW_CONFIG_PATH=/data/openclaw/config.json`
    - `OPENCLAW_HOME=/data/openclaw`
    - `autostop: false` (prima era `true`).
- Hardening applicato anche alla machine corrente:
  - `fly machine update ... --autostop=off --autostart`
  - env persistenti sopra allineate sulla machine.

### Problema strutturale emerso (pairing)
- Il bot genera correttamente il pairing code e lo salva su `/data/openclaw/state/...`.
- Il comando CLI `openclaw pairing approve` risulta incoerente/inaffidabile su questa immagine:
  - spesso non vede pending request appena generate oppure va in hang.
- Per non bloccare l'E2E, e' stato usato workaround manuale su file state (pairing rimosso + allowFrom aggiunto), con esito positivo.

### Nuovo blocco attuale (ultimo)
Il bot ora riceve i messaggi ma fallisce prima della risposta con errore provider:
- `No API key found for provider "anthropic"`
- path segnalato: `/data/openclaw/state/agents/main/agent/auth-profiles.json`

Dettagli diagnostici gia' verificati:
- `OPENAI_API_KEY` e' presente nell'env del processo `openclaw-gateway`.
- config globale e' stata aggiornata con:
  - `agents.defaults.model.primary = openai/gpt-5-mini`
  - file: `/data/openclaw/config.json`
- nonostante questo, nei log il gateway continua a mostrare:
  - `agent model: anthropic/claude-opus-4-6`
- quindi il runtime usa un override/session-state interno (non il default globale).

### Cosa manca per chiudere l'E2E (prossima sessione)
1) Forzare il model effettivo usato da `agent:main:main` su provider disponibile (`openai/*`) **oppure** fornire una credenziale anthropic valida.
2) Inviare un messaggio Telegram reale e verificare risposta completa (non solo pairing).
3) Validare che il bot risponda in modo stabile dopo restart machine (con autostop disabilitato).

### Strategia consigliata alla ripartenza (piu' veloce)
Approccio pragmatico: mantenere modello anthropic e aggiungere solo la chiave mancante per chiudere il test.
- Opzione A (consigliata per chiudere E2E subito): impostare `ANTHROPIC_API_KEY` sulla machine/app e riprovare messaggio Telegram.
- Opzione B: continuare a investigare override del model sessione (`agent:main:main`) per far prendere `openai/gpt-5-mini`.

### Comandi rapidi di ripartenza
```bash
# stato machine
fly machine status 683269df435328 -a linkhub-agents

# log live (telegram + diagnostica)
fly logs -a linkhub-agents --machine 683269df435328

# env visibili dal processo gateway
fly ssh console -a linkhub-agents -C 'sh -lc "PID=$(ps aux | awk \"/openclaw-gateway/{print \\$2; exit}\"); tr \"\\0\" \"\\n\" </proc/$PID/environ | sed -n \"/OPENCLAW_/p;/OPENAI_API_KEY/p;/ANTHROPIC_API_KEY/p\""'
```

### Nota importante
- La base infrastrutturale ora e' sana (provisioning clean, gateway up, telegram provider up, pairing path corretto su volume).
- Il blocco residuo non e' piu' Fly/provisioning/pairing, ma solo autenticazione provider modello al momento dell'inferenza agente.
