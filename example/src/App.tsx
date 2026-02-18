import "./App.css";
import { useAction, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { useState } from "react";

function App() {
  const [tenantId, setTenantId] = useState("linkhub-w4");
  const [userId, setUserId] = useState("user123");
  const [imageTag, setImageTag] = useState("");
  const [telegramBotToken, setTelegramBotToken] = useState("");
  const [selectedMachine, setSelectedMachine] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [showOnlyDeletedOrError, setShowOnlyDeletedOrError] = useState(false);
  const [output, setOutput] = useState("Ready");
  const machines = useQuery(api.example.listTenantMachines, { tenantId });
  const filteredMachines = (machines ?? []).filter((machine: { status: string }) => {
    if (!showOnlyDeletedOrError) {
      return true;
    }
    return !(machine.status === "deleted" || machine.status === "error");
  });

  const ensureUserAgent = useAction(api.example.ensureUserAgent);
  const startMyAgent = useAction(api.example.startMyAgent);
  const stopMyAgent = useAction(api.example.stopMyAgent);
  const getTelegramPairingCode = useAction(api.example.getTelegramPairingCode);
  const approveTelegramPairing = useAction(api.example.approveTelegramPairing);

  const runEnsure = async () => {
    setOutput("Provision/start in corso...");
    try {
      const result = await ensureUserAgent({
        userId,
        tenantId,
        image: imageTag.trim() || undefined,
        telegramBotToken: telegramBotToken.trim() || undefined,
      });
      setSelectedMachine(String(result.machineDocId));
      setOutput(JSON.stringify(result, null, 2));
    } catch (error) {
      setOutput(error instanceof Error ? error.message : "Errore provisioning");
    }
  };

  const runStart = async () => {
    if (!selectedMachine) return;
    setOutput("Start macchina in corso...");
    try {
      await startMyAgent({ machineDocId: selectedMachine });
      setOutput("Start completato");
    } catch (error) {
      setOutput(error instanceof Error ? error.message : "Errore start");
    }
  };

  const runStop = async () => {
    if (!selectedMachine) return;
    setOutput("Stop macchina in corso...");
    try {
      await stopMyAgent({ machineDocId: selectedMachine });
      setOutput("Stop completato");
    } catch (error) {
      setOutput(error instanceof Error ? error.message : "Errore stop");
    }
  };

  const runGetPairingCode = async () => {
    if (!selectedMachine) return;
    setOutput("Lettura pairing code...");
    try {
      const result = await getTelegramPairingCode({ machineDocId: selectedMachine });
      if (result.code) {
        setPairingCode(result.code);
      }
      if (!result.code) {
        setOutput(
          `Nessun pairing code attivo. requests=${result.requestCount}. Invia /start al bot, poi riprova Get Pairing Code.\n\n${result.raw}`,
        );
      } else {
        setOutput(JSON.stringify(result, null, 2));
      }
    } catch (error) {
      setOutput(error instanceof Error ? error.message : "Errore get pairing");
    }
  };

  const runApprovePairing = async () => {
    if (!selectedMachine || !pairingCode.trim()) return;
    setOutput("Approvo pairing...");
    try {
      const result = await approveTelegramPairing({
        machineDocId: selectedMachine,
        pairingCode: pairingCode.trim(),
      });
      setOutput(JSON.stringify(result, null, 2));
    } catch (error) {
      setOutput(error instanceof Error ? error.message : "Errore approve pairing");
    }
  };

  return (
    <div className="app-shell">
      <h1>Fly Agent Console</h1>
      <p className="subtitle">Provisioning, pairing Telegram, start/stop da UI</p>

      <div className="grid">
        <section className="panel">
          <h2>Provision</h2>
          <label>
            Tenant ID
            <input value={tenantId} onChange={(e) => setTenantId(e.target.value)} />
          </label>
          <label>
            User ID
            <input value={userId} onChange={(e) => setUserId(e.target.value)} />
          </label>
          <label>
            Image (opzionale)
            <input
              value={imageTag}
              onChange={(e) => setImageTag(e.target.value)}
              placeholder="registry.fly.io/linkhub-agents:deployment-..."
            />
          </label>
          <label>
            Telegram Bot Token (opzionale)
            <input
              value={telegramBotToken}
              onChange={(e) => setTelegramBotToken(e.target.value)}
              type="password"
              placeholder="123456:AA..."
            />
          </label>
          <button onClick={runEnsure}>Ensure User Agent</button>
        </section>

        <section className="panel">
          <h2>Machine Control</h2>
          <label>
            Machine Doc ID
            <input
              value={selectedMachine}
              onChange={(e) => setSelectedMachine(e.target.value)}
              placeholder="j57..."
            />
          </label>
          <div className="row">
            <button onClick={runStart}>Start</button>
            <button onClick={runStop}>Stop</button>
          </div>
          <label>
            Pairing code
            <input value={pairingCode} onChange={(e) => setPairingCode(e.target.value)} />
          </label>
          <div className="row">
            <button onClick={runGetPairingCode}>Get Pairing Code</button>
            <button onClick={runApprovePairing}>Approve Pairing</button>
          </div>
        </section>

        <section className="panel panel-wide">
          <h2>Machines</h2>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={showOnlyDeletedOrError}
              onChange={(e) => setShowOnlyDeletedOrError(e.target.checked)}
            />
            Mostra solo macchine attive
          </label>
          <ul className="machine-list">
            {filteredMachines.map((machine: { _id: string; status: string; machineId?: string }) => (
              <li key={machine._id}>
                <button className="machine-item" onClick={() => setSelectedMachine(String(machine._id))}>
                  <span>{String(machine._id)}</span>
                  <span>{machine.status}</span>
                  <span>{machine.machineId ?? "-"}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel panel-wide">
          <h2>Output</h2>
          <pre>{output}</pre>
        </section>
      </div>
    </div>
  );
}

export default App;
