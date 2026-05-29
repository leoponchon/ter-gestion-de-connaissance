import { EmbedBuilder } from "discord.js";

export default {
  command: {
    name: "help",
    description: "Affiche l'aide et explique le fonctionnement du bot"
  },
  async execute(interaction) {
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
          value: "`/help` : Affiche ce message d'aide.\n`/maj` : Affiche la date de la dernière mise à jour du code et l'heure de son dernier redémarrage.\n`/addchannel` : Ajoute un salon autorisé.\n`/removechannel` : Supprime un salon autorisé.\n`/listchannels` : Affiche la liste des salons autorisés."
        }
      )
      .setFooter({ text: "Bot de Gestion de Connaissances (TER)" });

    return interaction.reply({ embeds: [helpEmbed] });
  }
};
