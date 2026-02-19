import { voteRelation } from "../utils/supabase.js";

export default function interactionCreateHandler(discordClient) {
  discordClient.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    
    const parts = interaction.customId.split('_');
    if (parts[0] !== 'vote') return;

    const direction = parts[1]; 
    const relationId = parts[2];
    const voterId = interaction.user.id;
    const weight = direction === 'up' ? 1 : -1;

    try {      
      const result = await voteRelation(relationId, voterId, weight);
      
      if (!result.success) {
        return await interaction.reply({ 
          content: result.error, 
          flags: 64
        });
      }
      
      await interaction.reply({ 
        content: "Vote enregistré ! Merci pour ton retour.", 
        flags: 64
      });

      await interaction.message.edit({ components: [] });

    } catch (error) {
      console.error("Erreur vote:", error);
      await interaction.reply({ content: "Une erreur est survenue lors du vote.", ephemeral: true });
    }
  });
}