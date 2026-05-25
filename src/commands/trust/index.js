import { ensureUserExists } from "../../utils/supabase.js";

export default {
  command: {
    name: "trust",
    description: "Indique ton score de fiabilité"
  },
  async execute(interaction) {
    const targetUser = interaction.user;
    const dbUser = await ensureUserExists(targetUser.id);

    return interaction.reply({
      content: `Ton score de fiabilité actuel est de **${(dbUser.trust_score * 100).toFixed(0)}%** (${dbUser.trust_score.toFixed(2)})`
    });
  }
};
