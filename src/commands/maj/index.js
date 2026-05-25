import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
const execAsync = promisify(exec);

export default {
  command: {
    name: "maj",
    description: "Indique la date de la dernière mise à jour du bot"
  },
  adminOnly: true,
  async execute(interaction) {
    let lastUpdate = "Inconnue";
    try {
    const { stdout } = await execAsync("git log -1 --format='%cd' --date=format:'%d/%m/%Y à %H:%M:%S'");
    lastUpdate = stdout.trim();
    } catch (e) {
    try {
        const stats = await fs.promises.stat("package.json");
        lastUpdate = stats.mtime.toLocaleString("fr-FR");
    } catch (err) { }
    }

    return interaction.reply({
        content: `🤖 Dernière mise à jour du code : **${lastUpdate}**\n🔄 Dernier redémarrage du bot : **${startupTime}**`
    });
  }
};
