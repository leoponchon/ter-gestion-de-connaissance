import fs from "fs";
import conversations from "../utils/conversations.js";
import { continueToolCall } from "../utils/openrouter.js";
import { TOOLS, TOOL_FUNCTIONS } from "../utils/jdm.js";
import config from "../config.js";

// Évite les doublons
const processingMessages = new Set();

// File d'attente globale
let isProcessing = false;
const messageQueue = [];

// Prompt système
const SYSTEM_PROMPT = fs.readFileSync("src/system-prompt.txt", "utf-8");

// Traite un message
async function processMessage(message) {
  const userId = message.author.id;
  const userMessage = message.content.trim();

  console.log("\n" + "=".repeat(50));
  console.log(`[MSG] From ${message.author.username}: "${userMessage}"`);

  const history = conversations.getHistory(userId);

  try {
    let messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history,
      { role: "user", content: userMessage }
    ];

    let finalResponse;

    // Boucle pour gérer les appels d'outils
    let maxIterations = 5;
    while (maxIterations-- > 0) {
      const response = await continueToolCall(messages, TOOLS, config.temperature);

      console.log("[LLM] Response:", {
        hasContent: !!response.content,
        toolCalls: response.tool_calls?.length || 0
      });

      // Ajouter la réponse de l'assistant
      messages.push({
        role: "assistant",
        content: response.content,
        tool_calls: response.tool_calls
      });

      // Si pas de tool calls, c'est fini
      if (!response.tool_calls || response.tool_calls.length === 0) {
        finalResponse = response.content;
        break;
      }

      // Exécuter chaque outil
      for (const toolCall of response.tool_calls) {
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments);

        console.log(`[Tool] Calling: ${toolName} with`, toolArgs);

        let toolResult;
        if (toolName === "search_jdm_term") {
          toolResult = await TOOL_FUNCTIONS.search_jdm_term(toolArgs.term);
        } else if (toolName === "get_jdm_relations") {
          toolResult = await TOOL_FUNCTIONS.get_jdm_relations(
            toolArgs.termName,
            toolArgs.direction || "both",
            toolArgs.relationType || null,
            toolArgs.limit || 100
          );
        } else if (toolName === "get_relation_types") {
          toolResult = await TOOL_FUNCTIONS.get_relation_types();
        } else {
          toolResult = { success: false, error: "Tool inconnu" };
        }

        console.log(`[Tool] Result:`, {
          success: toolResult.success,
          term: toolResult.term,
          outgoingCount: toolResult.outgoing?.length || 0,
          typesCount: toolResult.types?.length || 0
        });

        // Ajouter le résultat de l'outil
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(toolResult)
        });
      }
    }

    if (!finalResponse) {
      finalResponse = "Désolé, je n'ai pas pu générer une réponse.";
    }

    conversations.addMessage(userId, "user", userMessage);
    conversations.addMessage(userId, "assistant", finalResponse);

    // Limite Discord
    if (finalResponse.length > 2000) {
      finalResponse = finalResponse.slice(0, 1950) + "\n\n... *(tronqué)*";
    }

    console.log("\n[SEND] Sending to Discord...");
    await message.reply(finalResponse);
    console.log("[OK] Message sent!\n");
  } catch (error) {
    console.error("\n[ERR] Error:", error.message);
    console.error(error.stack);
    await message.reply("Désolé, une erreur est survenue: " + error.message);
  }
}

// Traite la file d'attente
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

export default function messageCreateHandler(discordClient) {
  discordClient.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    const userMessage = message.content.trim();
    if (!userMessage) return;

    // Anti-doublon
    const messageKey = `${message.channelId}-${message.id}`;
    if (processingMessages.has(messageKey)) return;
    processingMessages.add(messageKey);

    // Ajouter à la file d'attente
    messageQueue.push({ message, messageKey });

    console.log(`[QUEUE] Added to queue (position ${messageQueue.length})`);

    // Démarrer le traitement si pas déjà en cours
    processQueue().catch(err => {
      console.error("[ERR] Queue error:", err);
      isProcessing = false;
    });
  });
}
