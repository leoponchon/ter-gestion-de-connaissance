import { Client } from "discord.js";
import http from "http";
import config from "./config.js";
import readyHandler from "./events/ready.js";
import messageCreateHandler from "./events/messageCreate.js";
import interactionCreateHandler from "./events/interactionCreate.js";


const client = new Client({ intents: config.intents });

readyHandler(client);
messageCreateHandler(client);
interactionCreateHandler(client);

console.log("Initialisation...\n");
client.login(config.token);

// Serveur HTTP pour garder le bot actif sur Render
const port = parseInt(process.env.PORT) || 8080;
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Bot is running\n");
});

server.listen(port, () => {
  console.log(
    `Serveur HTTP sur le port ${port} pour que Render ne fasse pas un timed out`,
  );
});

// Arrêt propre du bot avec Ctrl+C
process.on("SIGINT", () => {
  console.log("\nArret...");
  client.destroy();
  server.close();
  process.exit(0);
});
