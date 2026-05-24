import { voteRelation, updateTrustScore, ensureUserExists, listRelations } from "../utils/supabase.js";
import { processUserRequest } from "../utils/brain.js";
import conversations from "../utils/conversations.js";
import { TRAPS } from "../utils/traps.js";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { EmbedBuilder, AttachmentBuilder } from "discord.js";

const execAsync = promisify(exec);
const startupTime = new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" });

export default function interactionCreateHandler(discordClient) {
  discordClient.on("interactionCreate", async (interaction) => {
    try {
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
            } catch (err) {}
          }

          return interaction.reply({
            content: `🤖 Dernière mise à jour du code : **${lastUpdate}**\n🔄 Dernier redémarrage du bot : **${startupTime}**`
          });
        }

        if (interaction.commandName === "help") {
          const helpEmbed = new EmbedBuilder()
            .setColor("#2b2d31")
            .setTitle("🧠 Aide & Informations sur le Bot")
            .setDescription("Ce bot est un **Chatbot de Gestion de Connaissances** connecté à l'API **JeuDeMots**. Son but est de collecter, valider et organiser des connaissances de manière collaborative.")
            .addFields(
              {
                name: "✨ Fonctionnalités principales",
                value: "• **Discussion Naturelle :** Parlez-lui normalement, il vous répondra.\n• **Collecte :** Apprenez-lui de nouvelles choses, il les enregistrera pour vérification.\n• **Validation :** Lorsqu'il aborde un sujet connu, il peut vous demander de valider les informations partagées par d'autres utilisateurs via des boutons interactifs.\n• **Déduction logique :** Il est capable de déduire de nouvelles relations (transitivité, typage, etc.)."
              },
              {
                name: "🛠️ Commandes disponibles",
                value: "`/help` : Affiche ce message d'aide.\n`/maj` : Affiche la date de la dernière mise à jour du code et l'heure de son dernier redémarrage."
              }
            )
            .setFooter({ text: "Bot de Gestion de Connaissances (TER)" });

          return interaction.reply({ embeds: [helpEmbed] });
        }

        if (interaction.commandName === "trust") {
          const targetUser = interaction.user;
          const dbUser = await ensureUserExists(targetUser.id);

          return interaction.reply({
            content: `Ton score de fiabilité actuel est de **${(dbUser.trust_score * 100).toFixed(0)}%** (${dbUser.trust_score.toFixed(2)})`
          });
        }

        if (interaction.commandName === "chat") {
          const userMessage = interaction.options.getString("question");
          if (!userMessage) return interaction.reply({ content: "Vous n'avez pas posé de question.", flags: 64 });

          const userId = interaction.user.id;
          const userName = interaction.user.username;

          try {
            await interaction.deferReply();
          } catch (err) {
            if (err.code === 10062) return;
            throw err;
          }

          await ensureUserExists(userId);

          try {
            const result = await processUserRequest(userId, userName, userMessage);

            const replyMessage = await interaction.editReply({
              content: `💬 Discussion démarrée sur : **"${userMessage}"**`
            });

            const thread = await replyMessage.startThread({
              name: `Discussion avec ${interaction.user.username}`,
              autoArchiveDuration: 60,
            });

            const payload = { content: result.content.length > 2000 ? result.content.slice(0, 1950) + "..." : result.content };
            await thread.send(payload);

            if (result.additionalContent && result.additionalComponent) {
              await thread.send({
                content: result.additionalContent,
                components: [result.additionalComponent]
              });
            }

            conversations.addMessage(userId, "user", userMessage);
            conversations.addMessage(userId, "assistant", result.content);

            if (result.detectedTopic) {
              conversations.setTopic(userId, result.detectedTopic);
            }
          } catch (error) {
            console.error("Erreur /chat:", error);
            if (error.code === 10062) return;
            await interaction.editReply({ content: "Erreur lors de la génération de la réponse: " + error.message });
          }

          return;
        }

        if (interaction.commandName === "export") {
          try {
            await interaction.deferReply();
          } catch (err) {
            if (err.code === 10062) return;
            throw err;
          }

          try {
            const relations = await listRelations({ limit: 5000 });

            let markdownContent = "# Export des Relations Locales (Supabase)\n\n";
            markdownContent += "Généré le : " + new Date().toLocaleString("fr-FR") + "\n\n";
            markdownContent += "| ID | Source | Type Relation | Cible | Est Vrai | Statut |\n";
            markdownContent += "|---|---|---|---|---|---|\n";

            relations.forEach(rel => {
              const vraiFaux = rel.est_vrai ? "Vrai" : "Faux";
              markdownContent += `| ${rel.id} | ${rel.terme_source} | ${rel.type_relation} | ${rel.terme_cible} | ${vraiFaux} | ${rel.statut} |\n`;
            });

            const exportPath = path.join(process.cwd(), "logs", "relations_export.md");

            if (!fs.existsSync(path.dirname(exportPath))) {
              fs.mkdirSync(path.dirname(exportPath), { recursive: true });
            }

            fs.writeFileSync(exportPath, markdownContent, "utf8");

            const attachment = new AttachmentBuilder(exportPath, { name: "relations_locales.md" });

            await interaction.editReply({
              content: `✅ Voici l'export de toutes les relations stockées localement (${relations.length} relations).`,
              files: [attachment]
            });
          } catch (error) {
            console.error("Erreur lors de l'export:", error);
            if (error.code === 10062) return;
            await interaction.editReply({ content: "Erreur lors de la génération de l'export: " + error.message });
          }

          return;
        }

        return;
      }

      if (!interaction.isButton()) return;

      if (interaction.customId === "votetrap_skip_trap") {
        await interaction.reply({ content: "Vous avez ignoré la question de contrôle." });
        await interaction.message.edit({ components: [] });
        return;
      }

      if (interaction.customId.startsWith("votetrap_")) {
        const parts = interaction.customId.split("_");
        const vote = parts[1];
        const trapId = parts[2];
        const voterId = interaction.user.id;

        const trap = TRAPS.find(t => t.id === trapId);
        if (!trap) {
          return interaction.reply({ content: "Erreur : Piège introuvable." });
        }

        const delta = vote === trap.reponse_attendue ? 0.05 : -0.15;
        await updateTrustScore(voterId, delta);

        const messageContent = vote === trap.reponse_attendue
          ? "✅ Bonne réponse ! C'était une question de contrôle. Ton score de fiabilité a augmenté."
          : "❌ Raté ! C'était une question de contrôle. Ton score de fiabilité a diminué pour éviter le spam.";

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

        await interaction.reply({ content: "Vote enregistré ! Merci pour ton retour." });
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