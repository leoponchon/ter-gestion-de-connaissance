import admins from "../../../utils/admins.js";

export default {
  command: {
    name: "addadmin",
    description: "Ajoute un administrateur via mention",
    options: [
      {
        name: "user",
        type: 6, // USER
        description: "Utilisateur à ajouter comme admin",
        required: true
      }
    ]
  },
  adminOnly: true,
  async execute(interaction) {
    const user = interaction.options.getUser("user");
    if (!user) return interaction.reply({ content: "Utilisateur invalide.",  });

    const result = await admins.addAdmin(user.id);
    if (!result.success) return interaction.reply({ content: `Erreur ajout admin: ${result.error}`,  });

    return interaction.reply({ content: `Utilisateur <@${user.id}> ajouté à la liste des administrateurs.` });
  }
};
