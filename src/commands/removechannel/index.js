import allowedChannels from "../../utils/allowedChannels.js";

export default {
  command: {
    name: "removechannel",
    description: "Supprime un salon de la liste des salons autorisés.",
    options: [
      {
        name: "channel",
        type: 7,
        description: "Salon ou thread à retirer",
        required: true
      }
    ]
  },
  adminOnly: true,
  async execute(interaction) {
    const channel = interaction.options.getChannel("channel");
    if (!channel) {
      return interaction.reply({ content: "Salon invalide.", ephemeral: true });
    }

    const result = await allowedChannels.removeChannel(channel.id);
    if (!result.success) {
      return interaction.reply({ content: `Erreur lors de la suppression du salon : ${result.error || "erreur inconnue"}`, ephemeral: true });
    }

    if (!result.removed) {
      return interaction.reply({ content: `Le salon <#${channel.id}> n'était pas dans la liste des salons autorisés.`, ephemeral: true });
    }

    return interaction.reply({ content: `Salon <#${channel.id}> supprimé de la liste des salons autorisés.`, ephemeral: true });
  }
};
