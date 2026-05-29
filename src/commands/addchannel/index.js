import allowedChannels from "../../utils/allowedChannels.js";

export default {
  command: {
    name: "addchannel",
    description: "Ajoute un salon autorisé pour que le bot réponde aux mentions @channel.",
    options: [
      {
        name: "channel",
        type: 7,
        description: "Salon ou thread à autoriser",
        required: true
      }
    ]
  },
  adminOnly: true,
  async execute(interaction) {
    const channel = interaction.options.getChannel("channel");
    if (!channel) {
      return interaction.reply({ content: "Salon invalide." });
    }

    const result = await allowedChannels.addChannel(channel.id);
    if (!result.success) {
      return interaction.reply({ content: `Erreur lors de l'ajout du salon : ${result.error || "erreur inconnue"}` });
    }

    if (result.alreadyExists) {
      return interaction.reply({ content: `Le salon <#${channel.id}> est déjà autorisé.` });
    }

    return interaction.reply({ content: `Salon <#${channel.id}> ajouté à la liste des salons autorisés.` });
  }
};
