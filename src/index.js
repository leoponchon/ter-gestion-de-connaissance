import { Client } from "discord.js";
import config from "./config.js";
import readyHandler from "./events/ready.js";
import messageCreateHandler from "./events/messageCreate.js";
import interactionCreateHandler from "./events/interactionCreate.js";
import { buildApiServer } from "./api/server.js";

const client = new Client({ intents: config.intents });

readyHandler(client);
messageCreateHandler(client);
interactionCreateHandler(client);

const host = process.env.HOST || "0.0.0.0";
const port = parseInt(process.env.PORT || "8080", 10);

async function start() {
  console.log("Initialisation...\n");

  const apiServer = await buildApiServer({ client });
  await apiServer.listen({ host, port });
  console.log(`API Fastify disponible sur http://${host}:${port}`);
  console.log(`Documentation Redoc disponible sur http://${host}:${port}/docs`);

  await client.login(config.token);

  const shutdown = async (signal) => {
    console.log(`\n${signal} recu, arret en cours...`);

    try {
      await apiServer.close();
    } catch (error) {
      console.error("Erreur fermeture API:", error.message);
    }

    try {
      client.destroy();
    } catch (error) {
      console.error("Erreur fermeture Discord:", error.message);
    }

    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

start().catch((error) => {
  console.error("Echec du demarrage:", error);
  process.exit(1);
});
