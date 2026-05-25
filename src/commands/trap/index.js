import { generateDynamicTrap } from "../../utils/dynamicTraps.js";
import { formatValidationStatement } from "../../utils/formatValidationStatement.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

export default {
  command: {
    name: "trap",
    description: "Pose une question a l'utilisateur sur le sujet de sa connaissance"
  },
  async execute(interaction) {
    try {
      await interaction.deferReply();
    } catch (err) {
      if (err.code === 10062) return;
      throw err;
    }

    const trap = await generateDynamicTrap();
    if (trap) {
      const trapActionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`votetrap_vrai_${trap.reponse_attendue}_${trap.id}`).setLabel("C'est vrai").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`votetrap_faux_${trap.reponse_attendue}_${trap.id}`).setLabel("C'est faux").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`votetrap_skip_${trap.reponse_attendue}_${trap.id}`).setLabel('Je ne sais pas').setStyle(ButtonStyle.Secondary)
      );
      const statement = formatValidationStatement(trap.terme_source, trap.type_relation, trap.terme_cible);

      await interaction.editReply({
        content: `**Question de contrôle** : ${statement} ?`,
        components: [trapActionRow]
      });
    } else {
      await interaction.editReply({ content: `Erreur : impossible de générer de nouvelles questions de contrôle pour le moment.` });
    }
  }
};
