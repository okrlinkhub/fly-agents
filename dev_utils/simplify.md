Architettura finale:


	linkhub-w4 (Convex Host)
	├── Componente: @okrlinkhub/agent-bridge
	│   └── HTTP Action: /agent/execute (auth, policy, permessi)
	├── Componente: @okrlinkhub/fly-agents
	│   └── Provisioning macchine + env vars
	└── HTTP Action host: /webhook/telegram (wake + forward)
	
	Fly.io Machine
	├── OpenClaw (Go runtime)
	│   └── Skill: linkhub-bridge/ (cartella standard OpenClaw)
	│       ├── SKILL.md
	│       └── scripts/fetch_context.js ← Eseguito on-demand da OpenClaw
	└── Volume /data (persistenza)

Cosa fa lo script:


1. OpenClaw decide di usare la skill (basato su prompt o trigger)

2. Esegue node scripts/fetch_context.js "{userId}" "{message}"

3. Lo script fa fetch a Convex, stampa JSON su stdout

4. OpenClaw cattura stdout e lo usa come contesto

5. Processo muore, nessun overhead

Implementazione concreta (senza sidecar, senza npm lib)


1. SKILL.md (formato OpenClaw standard)


	---
	name: linkhub-context
	version: 1.0.0
	description: Recupera contesto OKR da LinkHub W4
	tools:
	  - name: fetch_okr_context
	    description: Ottieni dati OKR e memorie rilevanti
	    parameters:
	      userId: string
	      message: string
	---
	
	# LinkHub Context Provider
	
	Usa questa skill per arricchire le risposte con dati utente da LinkHub.

2. scripts/fetch_context.js (eseguito da OpenClaw)


	#!/usr/bin/env node
	
	// Chiamato da OpenClaw: node fetch_context.js <userId> <message>
	const userId = process.argv[2];
	const message = process.argv[3];
	
	// Config da env (passati da fly-agents al provision)
	const CONVEX_URL = process.env.AGENT_BRIDGE_URL; // https://linkhub-w4.convex.site
	const SERVICE_ID = process.env.OPENCLAW_SERVICE_ID;
	const SERVICE_KEY = process.env.OPENCLAW_SERVICE_KEY;
	
	// Chiamata diretta a Convex (agent-bridge component)
	fetch(`${CONVEX_URL}/agent/execute`, {
	  method: 'POST',
	  headers: {
	    'Content-Type': 'application/json',
	    'X-Agent-Service-Id': SERVICE_ID,
	    'X-Agent-Service-Key': SERVICE_KEY,
	  },
	  body: JSON.stringify({
	    functionKey: 'getOkrContext',
	    args: { userId, message, tenantId: process.env.TENANT_ID }
	  })
	})
	.then(res => {
	  if (!res.ok) throw new Error(`HTTP ${res.status}`);
	  return res.json();
	})
	.then(data => {
	  // Output su stdout (OpenClaw cattura questo)
	  console.log(JSON.stringify(data));
	  process.exit(0);
	})
	.catch(err => {
	  console.error(JSON.stringify({ error: err.message }));
	  process.exit(1);
	});

3. Dockerfile minimale (senza npm install, solo Node)


	FROM openclaw/openclaw:latest
	
	# Installa solo Node (niente npm install di librerie esterne)
	RUN apt-get update && apt-get install -y nodejs
	
	# Copia la skill OpenClaw nella directory skills/
	COPY skills/linkhub-bridge /app/skills/linkhub-bridge
	RUN chmod +x /app/skills/linkhub-bridge/scripts/*.js
	
	# Entrypoint standard OpenClaw (nessun sidecar)
	ENTRYPOINT ["openclaw", "run", "--character", "/data/character.json"]

4. fly-agents passa le env correte

Nel componente fly-agents, quando crei la Machine:


	env: {
	  AGENT_BRIDGE_URL: "https://linkhub-w4.convex.site",
	  OPENCLAW_SERVICE_ID: serviceId,  // Generato da te
	  OPENCLAW_SERVICE_KEY: serviceKey, // Generato da te
	  TENANT_ID: tenantId,
	  // ... altre config
	}

agent-bridge-client: eliminato o ridotto a docs?


Opzione A (elimina): Lo script usa fetch nativo Node. Nessuna dipendenza npm. Più semplice, meno manutenzione.