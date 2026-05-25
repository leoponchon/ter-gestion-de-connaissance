import { voteRelation, updateTrustScore, ensureUserExists, listRelations } from "../utils/supabase.js";
import { processUserRequest } from "../utils/brain.js";
import conversations from "../utils/conversations.js";
import { generateDynamicTrap } from "../utils/dynamicTraps.js";
import { formatValidationStatement } from "../utils/formatValidationStatement.js";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import admins from "../utils/admins.js";
import { EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

const execAsync = promisify(exec);
const startupTime = new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" });

export default function interactionCreateHandler(discordClient) {
  discordClient.on("interactionCreate", async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        // route to loaded command modules
        const cmdModule = discordClient.commands && discordClient.commands.get(interaction.commandName);
        if (!cmdModule) {
          return interaction.reply({ content: "Commande inconnue.", ephemeral: true }).catch(() => {});
        }

        // admin-only guard
        if (cmdModule.adminOnly) {
          const allowed = await admins.isAdmin(interaction.user.id);
          if (!allowed) {
            return interaction.reply({ content: "Accès refusé : commande réservée aux administrateurs.", ephemeral: true }).catch(() => {});
          }
        }

        try {
          await cmdModule.execute(interaction, discordClient);
        } catch (err) {
          console.error(`Erreur exécution commande ${interaction.commandName}:`, err);
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: "Une erreur est survenue lors de l'exécution de la commande." }).catch(() => {});
          } else {
            await interaction.reply({ content: "Une erreur est survenue lors de l'exécution de la commande." }).catch(() => {});
          }
        }

        return;
      }

      if (!interaction.isButton()) return;

      if (interaction.customId.startsWith("votetrap_")) {
        const parts = interaction.customId.split("_");
        const vote = parts[1];
        const reponseAttendue = parts[2];
        const voterId = interaction.user.id;

        if (vote === "skip") {
          await interaction.reply({ content: `Pas de problème ! La bonne réponse était : **${reponseAttendue === "vrai" ? "C'est vrai ✅" : "C'est faux ❌"}**.` });
          await interaction.message.edit({ components: [] });
          return;
        }

        const isCorrect = vote === reponseAttendue;
        const delta = isCorrect ? 0.05 : -0.15;
        await updateTrustScore(voterId, delta);

        const messageContent = isCorrect
          ? `✅ Bonne réponse ! C'était bien **${reponseAttendue === "vrai" ? "vrai" : "faux"}**. Ton score de fiabilité a augmenté.`
          : `❌ Raté ! La bonne réponse était **${reponseAttendue === "vrai" ? "vrai" : "faux"}**. Ton score de fiabilité a diminué.`;

        await interaction.reply({ content: messageContent });
        await interaction.message.edit({ components: [] });
        return;
      }

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
            return await interaction.followUp({ content: result.error });
          }
          return await interaction.reply({ content: result.error });
        }

        // Vote accepté
        let replyMessage = "Vote enregistré ! Merci pour ton retour.";

        if (result.votesRemaining !== undefined && result.votesRemaining > 0) {
          replyMessage += `\n\nIl reste **${result.votesRemaining}** validation(s) avant que cette information soit finalisée.`;
        } else if (result.finalized && result.finalizedRelation) {
          const finalRel = result.finalizedRelation;
          const statusEmoji = finalRel.statut === "accepted" ? "✅" : "❌";
          const statusText = finalRel.statut === "accepted" ? "VALIDÉE" : "REJETÉE";
          replyMessage += `\n\n${statusEmoji} Information maintenant **${statusText}** !\nPoids final: **${finalRel.weight}**`;
        }

        await interaction.reply({ content: replyMessage });
        await interaction.message.edit({ components: [] });
      } catch (error) {
        console.error("Erreur vote:", error);
        if (error.code === 10062) return;
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: "Une erreur est survenue lors du vote." });
        } else {
          await interaction.reply({ content: "Une erreur est survenue lors du vote." });
        }
      }
    } catch (error) {
      if (error.code === 10062) {
        console.warn("[INTERACTION] Expired interaction, ignoring.");
        return;
      }
      console.error("[INTERACTION] Unhandled error:", error);
    }
  });
}