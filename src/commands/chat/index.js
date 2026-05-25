import { processUserRequest } from "../../utils/brain.js";
import conversations from "../../utils/conversations.js";
import { ensureUserExists } from "../../utils/supabase.js";

export default {
  command: {
    name: "chat",
    description: "Engage une conversation avec le bot",
    options: [
      {
        name: "question",
        type: 3,
        description: "La question que tu veux poser",
        required: true
      }
    ]
  },
  async execute(interaction) {
    const userMessage = interaction.options.getString("question");
    if (!userMessage) return interaction.reply({ content: "Vous n'avez pas posé de question.", flags: 64 });

    const userId = interaction.user.id;
    const userName = interaction.user.username;

    try {
      await interaction.deferReply();
    } catch (err) {
      if (err.code === 10062) return;
      throw err;
    }

    await ensureUserExists(userId);

    try {
      const result = await processUserRequest(userId, userName, userMessage);

      const replyMessage = await interaction.editReply({
        content: `💬 Discussion démarrée sur : **"${userMessage}"**`
      });

      const thread = await replyMessage.startThread({
        name: `Discussion avec ${interaction.user.username}`,
        autoArchiveDuration: 60,
      });

      const payload = { content: result.content.length > 2000 ? result.content.slice(0, 1950) + "..." : result.content };
      await thread.send(payload);

      if (result.additionalContent && result.additionalComponent) {
        await thread.send({
          content: result.additionalContent,
          components: [result.additionalComponent]
        });
      }

      conversations.addMessage(userId, "user", userMessage);
      conversations.addMessage(userId, "assistant", result.content);

      if (result.detectedTopic) {
        conversations.setTopic(userId, result.detectedTopic);
      }
    } catch (error) {
      console.error("Erreur /chat:", error);
      if (error.code === 10062) return;
      await interaction.editReply({ content: "Erreur lors de la génération de la réponse: " + error.message });
    }
  }
};
