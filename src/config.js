import dotenv from "dotenv";

dotenv.config();

export default {
  token: process.env.DISCORD_TOKEN,
  intents: ["Guilds", "GuildMessages", "MessageContent"],

  openRouterApiKey: process.env.OPENROUTER_API_KEY,
  openRouterBaseUrl: "https://openrouter.ai/api/v1",
  defaultModel: "qwen/qwen3.6-plus-preview:free",

  maxTokens: 1950,
  temperature: 0.3,
};
