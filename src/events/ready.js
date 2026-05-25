import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

async function loadCommandsFromDir(commandsPath) {
  const cmds = [];
  const map = new Map();

  if (!fs.existsSync(commandsPath)) return { cmds, map };

  const entries = await fs.promises.readdir(commandsPath, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const indexPath = path.join(commandsPath, entry.name, "index.js");
    if (!fs.existsSync(indexPath)) continue;
    try {
      const mod = await import(pathToFileURL(indexPath).href);
      const exported = mod.default || mod;
      if (!exported || !exported.command) continue;
      cmds.push(exported.command);
      map.set(exported.command.name, exported);
    } catch (err) {
      console.warn(`Impossible de charger la commande ${entry.name}:`, err.message);
    }
  }

  return { cmds, map };
}

export default function readyHandler(client) {
  client.once("clientReady", async () => {
    console.log(`${client.user.tag} prêt à discuter !`);
    client.user.setActivity("Discute avec les utilisateurs !");

    try {
      const commandsPath = path.join(process.cwd(), "src", "commands");
      const { cmds, map } = await loadCommandsFromDir(commandsPath);

      // store commands map on client for interaction handler
      client.commands = map;

      if (cmds.length > 0 && client.application) {
        await client.application.commands.set(cmds);
        console.log(`Commandes slash enregistrées (${cmds.length}).`);
      } else {
        console.log("Aucune commande slash trouvée à enregistrer.");
      }
    } catch (error) {
      console.error("Erreur lors de l'enregistrement des commandes:", error);
    }
  });
}
