import fs from "fs";
import conversations from "../utils/conversations.js";
import { continueToolCall } from "../utils/openrouter.js";
import { TOOLS, TOOL_FUNCTIONS } from "../utils/jdm.js";
import { ensureUserExists, addProposition, getPendingKnowledgeForTerm } from "../utils/supabase.js"; // Tout est ici maintenant
import config from "../config.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

const processingMessages = new Set();
let isProcessing = false;
const messageQueue = [];

const SYSTEM_PROMPT = fs.readFileSync("src/system-prompt.txt", "utf-8");

function chooseArticleForTarget(target) {
  const trimmed = target.trim();
  const lower = trimmed.toLowerCase();

  if (
    lower.startsWith("un ") ||
    lower.startsWith("une ") ||
    lower.startsWith("des ") ||
    lower.startsWith("le ") ||
    lower.startsWith("la ") ||
    lower.startsWith("les ") ||
    lower.startsWith("l'")
  ) {
    return { article: "", target: trimmed };
  }

  const article = lower.endsWith("e") ? "une" : "un";
  return { article, target: trimmed };
}

function formatValidationStatement(source, relation, target) {
  switch (relation) {
    case "r_has_part":
      return `${source} a ${target}`;
    case "r_isa": {
      const { article, target: cleanTarget } = chooseArticleForTarget(target);
      return article ? `${source} est ${article} ${cleanTarget}` : `${source} est ${cleanTarget}`;
    }
    case "r_hypo":
      return `${target} est un type de ${source}`;
    case "r_lieu":
      return `${source} est dans ${target}`;
    case "r_agent":
      return `${source} est fait par ${target}`;
    case "r_patient":
      return `${source} agit sur ${target}`;
    case "r_carac":
      return `${source} est ${target}`;
    case "r_syn":
      return `${source} est un synonyme de ${target}`;
    case "r_anto":
      return `${source} est un contraire de ${target}`;
    case "r_object>mater":
      return `${source} est fait de ${target}`;
    case "r_telic_role":
      return `${source} sert a ${target}`;
    case "r_instr":
      return `${source} s'utilise avec ${target}`;
    case "r_associated":
      return `${source} est associe a ${target}`;
    default:
      return `${source} a ${target}`;
  }
}

async function processMessage(message) {
  const userId = message.author.id;
  const userMessage = message.content.trim();
  let messageSent = false;

  console.log("\n" + "=".repeat(50));
  console.log(`[MSG] From ${message.author.username}: "${userMessage}"`);

  const dbUser = await ensureUserExists(userId);
  const history = conversations.getHistory(userId);

  try {
    //RECHERCHE DE CONNAISSANCES EN ATTENTE (n-grams)
    const normalizedMessage = userMessage.toLowerCase();
    const stopwords = new Set([
      "le", "la", "les", "un", "une", "des", "du", "de", "d", "a", "au", "aux",
      "et", "ou", "mais", "donc", "or", "ni", "car", "que", "qui", "quoi", "dont",
      "comment", "pourquoi", "parce", "parle", "parler", "connais", "connaitre",
      "moi", "toi", "lui", "elle", "nous", "vous", "ils", "elles", "ce", "cet", "cette"
    ]);
    const tokens = (normalizedMessage.match(/[a-z0-9]+/g) || [])
      .filter(t => t.length > 2)
      .filter(t => !stopwords.has(t));
    const candidates = [];
    const seen = new Set();

    const addCandidate = (value) => {
      if (!value || seen.has(value)) return;
      seen.add(value);
      candidates.push(value);
    };

    for (let i = 0; i < tokens.length - 2; i++) {
      addCandidate(`${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`);
    }
    for (let i = 0; i < tokens.length - 1; i++) {
      addCandidate(`${tokens[i]} ${tokens[i + 1]}`);
    }
    tokens.forEach(token => addCandidate(token));

    console.log("[DEBUG] Candidats de recherche :", candidates);

    let pendingInfo = null;

    for (const candidate of candidates) {
      if (candidate.length < 4) continue;
      pendingInfo = await getPendingKnowledgeForTerm(candidate);

      if (!pendingInfo && candidate.endsWith('s')) {
        pendingInfo = await getPendingKnowledgeForTerm(candidate.slice(0, -1));
      }

      if (pendingInfo) {
        console.log(`[VÉRIF] Match trouvé pour "${candidate}" !`);
        break;
      }
    }

    if (!pendingInfo) console.log("[DEBUG] Aucune info en attente trouvée pour ces mots-clés.");

    let messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history,
      { role: "user", content: userMessage }
    ];

    if (pendingInfo) {
      messages.push({
        role: "system",
        content: `INSTRUCTION DE VALIDATION : Quelqu'un a affirmé que "${pendingInfo.terme_source} ${pendingInfo.type_relation} ${pendingInfo.terme_cible}". 
            Réponds à l'utilisateur normalement, sans poser de question de validation. La validation sera envoyée séparément.`
      });
      console.log(`[VÉRIF] Info trouvée à faire valider : ${pendingInfo.terme_source}`);
    }

    let finalResponse = "";
    let maxIterations = 10;
    let llmFailed = false;

    try {
      while (maxIterations-- > 0) {
        const response = await continueToolCall(messages, TOOLS, config.temperature);
        if (response.content) finalResponse = response.content;

        if (!response.tool_calls || response.tool_calls.length === 0) break;

        messages.push({ role: "assistant", content: response.content || "", tool_calls: response.tool_calls });

        for (const toolCall of response.tool_calls) {
          const toolName = toolCall.function.name;
          const toolArgs = JSON.parse(toolCall.function.arguments);
          let toolResult;

          if (toolName === "search_jdm_term") toolResult = await TOOL_FUNCTIONS.search_jdm_term(toolArgs.term);
          else if (toolName === "get_jdm_relations") toolResult = await TOOL_FUNCTIONS.get_jdm_relations(toolArgs.termName, toolArgs.direction, toolArgs.relationType, toolArgs.limit);
          else if (toolName === "get_relation_types") toolResult = await TOOL_FUNCTIONS.get_relation_types();

          messages.push({ role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(toolResult) });
        }

        // Délai entre les itérations pour éviter le rate limit (429)
        await new Promise(r => setTimeout(r, 2000));
      }
    } catch (error) {
      llmFailed = true;
      console.error("[LLM] Erreur appel LLM:", error.message);
      finalResponse = "Je suis un peu limite cote reponse en ce moment. On continue quand meme.";
    }

    console.log("[TRACE] LLM termine. Preparation reponse...");

    //Extraction de NOUVELLES connaissances (uniquement si on ne valide pas deja)
    const knowledgeMatch = finalResponse.match(/\[KNOWLEDGE\]([\s\S]*?)\[\/KNOWLEDGE\]/i);
    if (!pendingInfo && knowledgeMatch) {
      try {
        const extraction = JSON.parse(knowledgeMatch[1]);
        await addProposition(userId, extraction.source, extraction.relation, extraction.cible, extraction.estVrai, extraction.contexte);
        console.log(`[DB] Nouvelle connaissance enregistrée (Pending) !`);
      } catch (e) {
        console.error("[DB] Erreur JSON:", e.message);
      }
    }
    if (knowledgeMatch) {
      finalResponse = finalResponse.replace(/\[KNOWLEDGE\]([\s\S]*?)\[\/KNOWLEDGE\]/g, "").trim();
    }

    //ENVOI DE LA RÉPONSE AVEC BOUTONS SI BESOIN
    console.log("[TRACE] Passage a l'envoi. messageSent:", messageSent);
    if (!messageSent) {
      const payload = { content: finalResponse.length > 2000 ? finalResponse.slice(0, 1950) + "..." : finalResponse };

      console.log(`[VÉRIF] Envoi reponse (boutons: ${pendingInfo ? "oui" : "non"})`);
      console.log("[VÉRIF] Payload components:", payload.components ? payload.components.length : 0);
      try {
        await message.reply(payload);
        console.log("[VÉRIF] Message reponse envoye.");
      } catch (sendError) {
        console.error("[VÉRIF] Erreur envoi reponse:", sendError.message);
      }
      messageSent = true;

      if (pendingInfo) {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`vote_up_${pendingInfo.id}`).setLabel('C\'est vrai').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`vote_down_${pendingInfo.id}`).setLabel('C\'est faux').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`vote_skip_${pendingInfo.id}`).setLabel('Je ne sais pas').setStyle(ButtonStyle.Secondary)
        );
        const statement = formatValidationStatement(
          pendingInfo.terme_source,
          pendingInfo.type_relation,
          pendingInfo.terme_cible
        );
        const safeStatement = statement.replace(/\br_[a-z0-9_>]+\b/gi, "").replace(/\s{2,}/g, " ").trim();
        await message.channel.send({
          content: `D'ailleurs, a ce sujet, quelqu'un a dit que **${safeStatement}**. Tu en penses quoi, c'est correct ?`,
          components: [row]
        });
      }

      conversations.addMessage(userId, "user", userMessage);
      conversations.addMessage(userId, "assistant", finalResponse);
    }

  } catch (error) {
    console.error("\n[ERR] Error:", error.message);
    if (!messageSent) await message.channel.send("Erreur: " + error.message);
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

// HANDLER
const channels = [1469129042258169949n, 1472937819537412290n];

export default function messageCreateHandler(discordClient) {
  discordClient.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (!channels.includes(message.channel.id)) return;

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
