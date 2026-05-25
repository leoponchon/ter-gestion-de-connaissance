import fs from "fs";
import conversations from "./conversations.js";
import { continueToolCall } from "./openrouter.js";
import { TOOLS, TOOL_FUNCTIONS } from "./jdm.js";
import { addProposition, getPendingKnowledgeForTerm, hasUserVoted } from "./supabase.js";
import { generateDynamicTrap } from "./dynamicTraps.js";
import { logSession } from "./logger.js";
import config from "../config.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { formatValidationStatement } from "./formatValidationStatement.js";

const SYSTEM_PROMPT = fs.readFileSync("src/system-prompt.txt", "utf-8");

function normalizeText(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function isWhyQuestion(text) {
  const t = normalizeText(text);
  return (
    t.startsWith("pourquoi ") ||
    t.includes(" pourquoi ") ||
    t.startsWith("why ")
  );
}

function isAffirmation(text) {
  const t = normalizeText(text);
  if (!t || t.endsWith("?")) return false;

  const affirmativePatterns = [
    " est ",
    " a ",
    " contient ",
    " fait ",
    " se trouve ",
    " appartient ",
    " existe ",
    " peut ",
    " doit ",
    " n'est pas ",
    " ne ",
    " pas un ",
    " pas une ",
    " pas de "
  ];

  return affirmativePatterns.some(pattern => t.includes(pattern));
}

export function detectTopic(text) {
  const cleaned = text
    .replace(/[?!.,;:()"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Explicit patterns first
  const patterns = [
    /pourquoi\s+(?:un|une|le|la|les|l')?\s*([a-zA-ZÀ-ÿ0-9\- ]+?)\s+(?:est|a|fait|peut|se trouve)/i,
    /parle[- ]?moi\s+(?:de|du|des|de la|de l')\s+([a-zA-ZÀ-ÿ0-9\- ]+)/i,
    /infos?\s+sur\s+([a-zA-ZÀ-ÿ0-9\- ]+)/i,
    /(?:connais|parler?|discuter?|sujet|thème)\s+(?:du?|de la?|des?|l')?\s*([a-zA-ZÀ-ÿ0-9\- ]+)/i,
    /(?:un|une|le|la|les|l')\s*([a-zA-ZÀ-ÿ0-9\- ]+?)\s+(?:est|a|fait|peut|contient|se trouve|mesure|pèse|vole|nage)/i,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match?.[1]) {
      const topic = match[1].trim();
      if (topic.length > 2) return topic;
    }
  }

  // Fallback: extract the most prominent noun-like token
  // Skip stopwords and short tokens, take the longest remaining candidate
  const stopwords = new Set([
    "le", "la", "les", "un", "une", "des", "du", "de", "d", "a", "au", "aux",
    "et", "ou", "mais", "donc", "or", "ni", "car", "que", "qui", "quoi", "dont",
    "comment", "pourquoi", "parce", "salut", "bonjour", "dis", "moi", "toi",
    "lui", "elle", "nous", "vous", "ils", "elles", "ce", "cet", "cette", "ça",
    "est", "sont", "était", "avait", "fait", "peut", "avoir", "être", "vrai",
    "faux", "non", "oui", "pas", "plus", "très", "bien", "mal", "tout", "rien"
  ]);

  const tokens = cleaned
    .toLowerCase()
    .match(/[a-zà-ÿ0-9][a-zà-ÿ0-9\- ]*[a-zà-ÿ0-9]/g) || [];

  const candidates = tokens
    .map(t => t.trim())
    .filter(t => t.length >= 4 && !stopwords.has(t));

  if (candidates.length === 0) return null;

  // Prefer multi-word phrases, then longest single token
  const multiWord = candidates.filter(t => t.includes(" "));
  if (multiWord.length > 0) return multiWord[0];

  return candidates.sort((a, b) => b.length - a.length)[0];
}

function detectWhyClaim(text) {
  const cleaned = text.replace(/[?]/g, "").trim();
  const match = cleaned.match(
    /pourquoi\s+(?:un|une|le|la|les|l')?\s*([a-zA-ZÀ-ÿ0-9\- ]+?)\s+est\s+([a-zA-ZÀ-ÿ0-9\- ]+)/i
  );
  if (!match) return null;
  return {
    subject: match[1].trim(),
    property: match[2].trim()
  };
}

/**
 * Traite la demande de l'utilisateur, interroge le LLM, 
 * gère la base de données et prépare les messages Discord.
 */
export async function processUserRequest(userId, userName, userMessage) {
  const history = conversations.getHistory(userId);
  const previousTopic = conversations.getTopic(userId);
  const detectedTopic = detectTopic(userMessage);

  // Recherche de connaissances en attente (n-grams)
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

  for (let i = 0; i < tokens.length - 2; i++) addCandidate(`${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`);
  for (let i = 0; i < tokens.length - 1; i++) addCandidate(`${tokens[i]} ${tokens[i + 1]}`);
  tokens.forEach(token => addCandidate(token));

  let pendingInfo = null;
  for (const candidate of candidates) {
    if (candidate.length < 4) continue;
    pendingInfo = await getPendingKnowledgeForTerm(candidate);
    if (!pendingInfo && candidate.endsWith('s')) {
      pendingInfo = await getPendingKnowledgeForTerm(candidate.slice(0, -1));
    }
    if (pendingInfo) break;
  }

  // Préparation du contexte LLM
  let messages = [{ role: "system", content: SYSTEM_PROMPT }];

  if (previousTopic && !detectedTopic) {
    messages.push({
      role: "system",
      content: `CONTEXTE DE SUJET : l'utilisateur parlait récemment de "${previousTopic}". Garde le même thème sauf si l'utilisateur change clairement de sujet.`
    });
  }

  if (isWhyQuestion(userMessage)) {
    messages.push({
      role: "system",
      content: `MODE EXPLICATION : l'utilisateur pose une question de type "pourquoi". Tu dois privilégier une explication causale ou déductive en t'appuyant sur JeuxDeMots avec une chaîne de raisonnement explicite. Utilise en priorité r_isa, r_carac, r_lieu, r_agent, r_patient, r_has_part si pertinent.`
    });
    
    if (detectWhyClaim(userMessage)) {
      messages.push({
        role: "system",
        content: `QUESTION ANALYSÉE : sujet probable = "${whyInfo.subject}", propriété probable = "${whyInfo.property}". Vérifie d'abord si cette propriété existe directement, sinon cherche une chaîne d'inférence.`
      });
    }
  }

  if (isAffirmation(userMessage)) {
    messages.push({
      role: "system",
      content: "L'utilisateur a fait une affirmation déclarative. Vérifie sa crédibilité comme indiqué dans la section de vérification de crédibilité. Si elle est plausible ou confirmée, traite-la comme une information à extraire et expose le cas échéant un bloc [KNOWLEDGE]."
    });
  }

  messages.push(...history);
  messages.push({ role: "user", content: userMessage });

  // Ici c'est uniquement si le bot trouve dans la base de donnée une relation
  if (pendingInfo) {
    messages.push({
      role: "system",
      content: `INSTRUCTION DE VALIDATION : Quelqu'un a affirmé que "${pendingInfo.terme_source} ${pendingInfo.type_relation} ${pendingInfo.terme_cible}". 
          Réponds à l'utilisateur normalement, sans poser de question de validation. La validation sera envoyée séparément.`
    });
  }

  let finalResponse = "";
  let maxIterations = 10;

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
      await new Promise(r => setTimeout(r, 2000));
    }
  } catch (error) {
    console.error("[LLM] Erreur appel LLM:", error.message);
    finalResponse = "Je suis un peu limite côté réponse en ce moment. On continue quand même.";
  }

  // Extraction de NOUVELLES connaissances
  const knowledgeMatch = finalResponse.match(/\[KNOWLEDGE\]([\s\S]*?)\[\/KNOWLEDGE\]/i);
  if (!pendingInfo && knowledgeMatch) {
    try {
      const extraction = JSON.parse(knowledgeMatch[1]);
      await addProposition(userId, extraction.source, extraction.relation, extraction.cible, extraction.estVrai, extraction.contexte);
    } catch (e) {
      console.error("[DB] Erreur JSON:", e.message);
    }
  }
  if (knowledgeMatch) {
    finalResponse = finalResponse.replace(/\[KNOWLEDGE\]([\s\S]*?)\[\/KNOWLEDGE\]/g, "").trim();
  }

  // Préparation du composant additionnel (piège ou validation)
  let additionalComponent = null;
  let additionalContent = null;
  
  const isTrap = Math.random() < 0.15;

  if (isTrap) {
    const trap = await generateDynamicTrap();
    if (trap) {
    additionalComponent = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`votetrap_vrai_${trap.reponse_attendue}_${trap.id}`).setLabel("C'est vrai").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`votetrap_faux_${trap.reponse_attendue}_${trap.id}`).setLabel("C'est faux").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`votetrap_skip_${trap.reponse_attendue}_${trap.id}`).setLabel('Je ne sais pas').setStyle(ButtonStyle.Secondary)
    );
    const statement = formatValidationStatement(trap.terme_source, trap.type_relation, trap.terme_cible);
      additionalContent = `D'ailleurs, pour verifier... On m'a affirme que **${statement}**. Tu valides ?`;
    }
  } else if (pendingInfo && !pendingInfoVoted) {
    additionalComponent = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`vote_up_${pendingInfo.id}`).setLabel("C'est vrai").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`vote_down_${pendingInfo.id}`).setLabel("C'est faux").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`vote_skip_${pendingInfo.id}`).setLabel('Je ne sais pas').setStyle(ButtonStyle.Secondary)
    );
    const statement = formatValidationStatement(pendingInfo.terme_source, pendingInfo.type_relation, pendingInfo.terme_cible);
    const safeStatement = statement.replace(/\br_[a-z0-9_>]+\b/gi, "").replace(/\s{2,}/g, " ").trim();
    additionalContent = `D'ailleurs, à ce sujet, quelqu'un a dit que **${safeStatement}**. Tu en penses quoi, c'est correct ?`;
  }

  // Enregistrement dans les logs de la session
  console.log("[TOPIC] detectedTopic:", detectedTopic);
  console.log("[TOPIC] previousTopic:", previousTopic);
  logSession(userId, userName, userMessage, finalResponse, detectedTopic);

  return {
    content: finalResponse,
    additionalContent,
    additionalComponent,
    detectedTopic
  };
}
