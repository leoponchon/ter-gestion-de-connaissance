import dotenv from "dotenv";

dotenv.config();

export default {
  token: process.env.DISCORD_TOKEN,
  intents: ["Guilds", "GuildMessages", "MessageContent"],

  openRouterApiKey: process.env.OPENROUTER_API_KEY,
  openRouterBaseUrl: "https://openrouter.ai/api/v1",
  defaultModel: "openai/gpt-4o-mini",

  maxTokens: 1950,
  temperature: 0.3,
};
