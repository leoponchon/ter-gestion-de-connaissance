import admins from "../../utils/admins.js";

export default {
  command: {
    name: "listadmins",
    description: "Affiche la liste des administrateurs"
  },
  adminOnly: true,
  async execute(interaction) {
    const list = await admins.listAdmins();
    if (!list || list.length === 0) return interaction.reply({ content: "Aucun administrateur configuré.", ephemeral: true });

    const mentions = list.map(id => `<@${id}>`).join("\n");
    return interaction.reply({ content: `Liste des administrateurs :\n${mentions}`, ephemeral: true });
  }
};
