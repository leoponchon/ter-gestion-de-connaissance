import { voteRelation } from "../utils/supabase.js";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";

const execAsync = promisify(exec);

export default function interactionCreateHandler(discordClient) {
  discordClient.on("interactionCreate", async (interaction) => {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "maj") {
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
          content: `🤖 Dernière mise à jour du code : **${lastUpdate}**` //, 
          // flags: 64 si on veut le mettre éphémère le mesage
        });
      }
      return;
    }

    if (!interaction.isButton()) return;

    const parts = interaction.customId.split("_");
    if (parts[0] !== "vote") return;

    const direction = parts[1];
    const relationId = parts[2];
    const voterId = interaction.user.id;
    const weight = direction === "up" ? 1 : -1;

    try {
      const result = await voteRelation(relationId, voterId, weight);

      if (!result.success) {
        if (interaction.replied || interaction.deferred) {
          return await interaction.followUp({
            content: result.error,
            flags: 64
          });
        }

        return await interaction.reply({
          content: result.error,
          flags: 64
        });
      }

      await interaction.reply({
        content: "Vote enregistré ! Merci pour ton retour.",
        flags: 64
      });

      await interaction.message.edit({ components: [] });

    } catch (error) {
      console.error("Erreur vote:", error);

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: "Une erreur est survenue lors du vote.",
          flags: 64
        });
      } else {
        await interaction.reply({
          content: "Une erreur est survenue lors du vote.",
          flags: 64
        });
      }
    }
  });
}