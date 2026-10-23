/* Mostra il sito a qualcuno, gratis, senza server: avvia il sito su questo
   computer e lo apre su internet con un tunnel Cloudflare temporaneo.
     npm run condividi
   L'indirizzo (https://….trycloudflare.com) cambia a ogni avvio e vale
   finché il computer resta acceso. Con il tunnel il sito è raggiungibile da
   chiunque: il server rifiuta di partire se il PIN è ancora quello vecchio. */

import { spawn, spawnSync } from "node:child_process";

const porta = process.env.PORT || "3000";
const suWindows = process.platform === "win32";

if (spawnSync("cloudflared", ["--version"], { stdio: "ignore", shell: suWindows }).status !== 0) {
  console.error("Manca cloudflared.");
  console.error("  Windows:  winget install Cloudflare.cloudflared");
  console.error("  Termux:   pkg install cloudflared");
  console.error("  macOS:    brew install cloudflared");
  process.exit(1);
}

const sito = spawn(process.execPath, ["--env-file-if-exists=.env", "server/server.js"], {
  stdio: "inherit", env: { ...process.env, PORT: porta, HOST: "127.0.0.1", TUNNEL: "1" }
});

const tunnel = spawn("cloudflared", ["tunnel", "--no-autoupdate", "--url", `http://localhost:${porta}`], {
  stdio: ["ignore", "pipe", "pipe"], shell: suWindows
});

sito.on("exit", codice => {
  if (codice) console.error("Il sito non è partito: vedi il messaggio qui sopra.");
  tunnel.kill();
  process.exit(codice ?? 0);
});

let mostrato = false;
const cerca = blocco => {
  const indirizzo = String(blocco).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (indirizzo && !mostrato) {
    mostrato = true;
    console.log(`\n  Sito pubblico:  ${indirizzo[0]}\n  Pannello:       ${indirizzo[0]}/admin\n\n  Ctrl+C per chiudere tutto.\n`);
  }
};
tunnel.stdout.on("data", cerca);
tunnel.stderr.on("data", cerca);

const chiudi = () => { tunnel.kill(); sito.kill(); };
process.on("SIGINT", chiudi);
process.on("SIGTERM", chiudi);
