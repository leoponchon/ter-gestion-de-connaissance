import allowedChannels from "../../utils/allowedChannels.js";

export default {
  command: {
    name: "listchannels",
    description: "Affiche la liste des salons autorisés pour les réponses du bot.",
  },
  adminOnly: true,
  async execute(interaction) {
    const channels = await allowedChannels.listChannels();
    if (!channels || channels.length === 0) {
      return interaction.reply({ content: "Aucun salon autorisé n'a encore été configuré.", ephemeral: true });
    }

    const mentions = channels.map((id) => `<#${id}>`).join("\n");
    return interaction.reply({ content: `Salons autorisés :\n${mentions}`, ephemeral: true });
  }
};
