import conversations from "../utils/conversations.js";
import { ensureUserExists } from "../utils/supabase.js";
import { processUserRequest, detectTopic } from "../utils/brain.js";

const processingMessages = new Set();
let isProcessing = false;
const messageQueue = [];

async function processMessage(message) {
  const userId = message.author.id;
  const userMessage = message.content.trim();
  
  console.log("\n" + "=".repeat(50));
  console.log(`[MSG] From ${message.author.username}: "${userMessage}"`);

  await ensureUserExists(userId);

  try {
    const result = await processUserRequest(userId, userMessage);
    
    const payload = { content: result.content.length > 2000 ? result.content.slice(0, 1950) + "..." : result.content };
    await message.reply(payload);
    
    if (result.additionalContent && result.additionalComponent) {
      await message.channel.send({
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
    console.error("\n[ERR] Error:", error.message);
    await message.channel.send("Erreur: " + error.message);
  }
}

async function processQueue() {
  if (isProcessing || messageQueue.length === 0) return;
  isProcessing = true;
  while (messageQueue.length > 0) {
    const { message, messageKey } = messageQueue.shift();
    await processMessage(message);
    processingMessages.delete(messageKey);
  }
  isProcessing = false;
}

const channels = [1469129042258169949n, 1472937819537412290n];

export default function messageCreateHandler(discordClient) {
  discordClient.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    // Le message est valide s'il vient d'un salon autorisé, OU d'un thread de ce salon, OU d'un thread créé par le bot
    const isThread = message.channel.isThread();
    // En JS, les ID venant de Discord.js sont des strings, mais `channels` contient des BigInts. On compare prudemment.
    const parentIdBigInt = isThread && message.channel.parentId ? BigInt(message.channel.parentId) : null;
    const channelIdBigInt = BigInt(message.channel.id);
    
    const isAllowedChannel = channels.includes(channelIdBigInt) || (isThread && channels.includes(parentIdBigInt));
    const isBotThread = isThread && message.channel.ownerId === discordClient.user.id;

    if (!isAllowedChannel && !isBotThread) return;

    const userMessage = message.content.trim();
    if (!userMessage) return;

    const messageKey = `${message.channelId}-${message.id}`;
    if (processingMessages.has(messageKey)) return;
    processingMessages.add(messageKey);

    messageQueue.push({ message, messageKey });

    console.log(`[QUEUE] Added to queue (position ${messageQueue.length})`);

    processQueue().catch(err => {
      console.error("[ERR] Queue error:", err);
      isProcessing = false;
    });
  });
}
