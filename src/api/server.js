import Fastify from "fastify";
import swagger from "@fastify/swagger";
import supabaseRoutes from "./routes/supabaseRoutes.js";
import { getSupabaseHealth } from "../utils/supabase.js";

function buildRedocHtml() {
  return `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>TER API Docs</title>
    <style>
      body {
        margin: 0;
        padding: 0;
        font-family: Arial, sans-serif;
        background: #f7f7f5;
      }
    </style>
  </head>
  <body>
    <redoc spec-url="/openapi.json"></redoc>
    <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
  </body>
</html>`;
}

export async function buildApiServer({ client } = {}) {
  const app = Fastify({
    logger: true,
  });

  await app.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "TER Supabase API",
        version: "1.0.0",
        description:
          "API Fastify exposee devant Supabase pour lire et ecrire les donnees du projet Discord/JDM.",
      },
      jsonSchemaDialect: "https://spec.openapis.org/oas/3.1/dialect/base",
      servers: [
        {
          url: "/",
          description: "Serveur courant",
        },
      ],
    },
  });

  app.get(
    "/",
    {
      schema: {
        hide: true,
      },
    },
    async () => ({
      name: "TER Supabase API",
      docs: "/docs",
      openapi: "/openapi.json",
      health: "/health",
    }),
  );

  app.get(
    "/health",
    {
      schema: {
        tags: ["System"],
        summary: "Verifier l'etat du bot et de Supabase",
        response: {
          200: {
            type: "object",
            required: ["ok", "supabase", "discord"],
            properties: {
              ok: { type: "boolean" },
              supabase: {
                type: "object",
                required: ["ok"],
                properties: {
                  ok: { type: "boolean" },
                },
              },
              discord: {
                type: "object",
                required: ["ready"],
                properties: {
                  ready: { type: "boolean" },
                  userTag: { type: ["string", "null"] },
                },
              },
            },
          },
          500: {
            type: "object",
            required: ["ok", "error"],
            properties: {
              ok: { type: "boolean" },
              error: { type: "string" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const supabase = await getSupabaseHealth();

        return {
          ok: true,
          supabase,
          discord: {
            ready: client?.isReady?.() ?? false,
            userTag: client?.user?.tag ?? null,
          },
        };
      } catch (error) {
        return reply.code(500).send({
          ok: false,
          error: error.message,
        });
      }
    },
  );

  await app.register(supabaseRoutes);

  app.get(
    "/openapi.json",
    {
      schema: {
        hide: true,
      },
    },
    async () => app.swagger(),
  );

  app.get(
    "/docs",
    {
      schema: {
        hide: true,
      },
    },
    async (request, reply) => {
      reply.type("text/html; charset=utf-8");
      return buildRedocHtml();
    },
  );

  return app;
}
