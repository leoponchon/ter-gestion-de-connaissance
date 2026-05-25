import admins from "../../utils/admins.js";

export default {
  command: {
    name: "removeadmin",
    description: "Supprime un administrateur via mention",
    options: [
      {
        name: "user",
        type: 6,
        description: "Utilisateur à retirer des admins",
        required: true
      }
    ]
  },
  adminOnly: true,
  async execute(interaction) {
    const user = interaction.options.getUser("user");
    if (!user) return interaction.reply({ content: "Utilisateur invalide.", ephemeral: true });

    const result = await admins.removeAdmin(user.id);
    if (!result.success) return interaction.reply({ content: `Erreur suppression admin: ${result.error}`, ephemeral: true });

    return interaction.reply({ content: `Utilisateur <@${user.id}> retiré de la liste des administrateurs.`, ephemeral: true });
  }
};
