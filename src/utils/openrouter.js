import axios from "axios";
import config from "../config.js";

// Appel OpenRouter avec retry
async function callAPI(messages, temperature, tools = null) {
  const maxRetries = 3;
  let lastError;

  const requestBody = {
    model: config.defaultModel,
    messages,
    max_tokens: config.maxTokens,
    temperature,
  };

  if (tools && tools.length > 0) {
    requestBody.tools = tools;
    requestBody.tool_choice = "auto";
  }

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await axios.post(
        `${config.openRouterBaseUrl}/chat/completions`,
        requestBody,
        {
          headers: {
            Authorization: `Bearer ${config.openRouterApiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://discord.com",
            "X-Title": "Discord AI Bot",
          },
          timeout: 30000,
        }
      );

      console.log(`[OpenRouter] Status: ${response.status}`);
      console.log(`[OpenRouter] Choices:`, response.data?.choices?.length);

      // Certains modèles retournent juste le contenu sans objet message imbriqué
      const choice = response.data?.choices?.[0];
      if (!choice) {
        console.error("[OpenRouter] Response invalide:", JSON.stringify(response.data, null, 2));
        throw new Error("Réponse API invalide - pas de choice");
      }

      // Gérer les différents formats de réponse
      if (choice.message) {
        return choice.message;
      } else if (choice.text || choice.content) {
        // Fallback pour les modèles qui ne supportent pas le format complet
        return { content: choice.text || choice.content || "", tool_calls: null };
      } else {
        console.error("[OpenRouter] Format non supporté:", choice);
        throw new Error("Format de réponse non supporté");
      }
    } catch (error) {
      lastError = error;
      if (error.response?.status === 429) {
        const waitTime = Math.pow(2, attempt) * 1000;
        console.log(`[OpenRouter] Rate limit, retry ${attempt + 1}/${maxRetries} (${waitTime}ms)`);
        await new Promise(r => setTimeout(r, waitTime));
      } else if (error.response?.status === 400 || !error.response?.status) {
        console.error("[OpenRouter] Error:", error.response?.data || error.message);
        throw error;
      }
    }
  }

  throw lastError || new Error("Échec après " + maxRetries + " tentatives");
}

// Pour les appels avec outils (incluant les tool_results)
export async function continueToolCall(messages, tools, temperature = null) {
  return await callAPI(messages, temperature ?? config.temperature, tools);
}
