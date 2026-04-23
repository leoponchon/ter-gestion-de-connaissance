import {
  addProposition,
  ensureUserExists,
  getPendingKnowledgeForTerm,
  getRelationById,
  getUserByDiscordId,
  listRelations,
  listVotes,
  voteRelation,
} from "../../utils/supabase.js";

const trustScoreSchema = {
  type: "object",
  properties: {
    trust_score: { type: ["number", "null"] },
  },
};

const userSchema = {
  type: "object",
  required: ["discord_id"],
  properties: {
    discord_id: { type: "string" },
    trust_score: { type: ["number", "null"] },
    created_at: { type: ["string", "null"], format: "date-time" },
  },
};

const relationSchema = {
  type: "object",
  required: [
    "id",
    "discord_id",
    "terme_source",
    "type_relation",
    "terme_cible",
    "statut",
  ],
  properties: {
    id: { type: "string" },
    discord_id: { type: "string" },
    terme_source: { type: "string" },
    type_relation: { type: "string" },
    terme_cible: { type: "string" },
    est_vrai: { type: ["boolean", "null"] },
    contexte_annotation: { type: ["string", "null"] },
    statut: { type: ["string", "null"] },
    created_at: { type: ["string", "null"], format: "date-time" },
    users: {
      anyOf: [
        trustScoreSchema,
        { type: "array", items: trustScoreSchema },
        { type: "null" },
      ],
    },
  },
};

const voteSchema = {
  type: "object",
  required: ["id", "relation_id", "discord_id", "vote"],
  properties: {
    id: { type: "string" },
    relation_id: { type: "string" },
    discord_id: { type: "string" },
    vote: { type: "integer", enum: [-1, 1] },
    created_at: { type: ["string", "null"], format: "date-time" },
  },
};

const errorSchema = {
  type: "object",
  required: ["error"],
  properties: {
    error: { type: "string" },
  },
};

function describeResponse(description, schema) {
  return {
    description,
    ...schema,
  };
}

export default async function supabaseRoutes(app) {
  app.get(
    "/api/users/:discordId",
    {
      schema: {
        tags: ["Supabase"],
        summary: "Lire un utilisateur",
        description: "Retourne un utilisateur de la table users a partir de son identifiant Discord.",
        params: {
          type: "object",
          required: ["discordId"],
          properties: {
            discordId: { type: "string" },
          },
        },
        response: {
          200: describeResponse("Utilisateur trouve", userSchema),
          404: describeResponse("Utilisateur introuvable", errorSchema),
          500: describeResponse("Erreur serveur lors de la lecture de l'utilisateur", errorSchema),
        },
      },
    },
    async (request, reply) => {
      try {
        const user = await getUserByDiscordId(request.params.discordId);
        if (!user) {
          return reply.code(404).send({ error: "Utilisateur introuvable." });
        }

        return user;
      } catch (error) {
        return reply.code(500).send({ error: error.message });
      }
    },
  );

  app.post(
    "/api/users/:discordId/ensure",
    {
      schema: {
        tags: ["Supabase"],
        summary: "Creer l'utilisateur s'il n'existe pas",
        description: "Reutilise la logique actuelle du bot pour garantir l'existence d'un utilisateur dans users.",
        params: {
          type: "object",
          required: ["discordId"],
          properties: {
            discordId: { type: "string" },
          },
        },
        response: {
          200: describeResponse("Utilisateur existant ou cree avec succes", userSchema),
          500: describeResponse("Erreur serveur lors de la creation ou lecture de l'utilisateur", errorSchema),
        },
      },
    },
    async (request, reply) => {
      try {
        const user = await ensureUserExists(request.params.discordId);
        if (!user) {
          return reply.code(500).send({ error: "Impossible de creer ou lire l'utilisateur." });
        }

        return user;
      } catch (error) {
        return reply.code(500).send({ error: error.message });
      }
    },
  );

  app.get(
    "/api/relations",
    {
      schema: {
        tags: ["Supabase"],
        summary: "Lister les relations",
        description: "Expose les relations stockees dans Supabase avec filtres sur le statut, le terme, le type et l'auteur.",
        querystring: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["pending", "accepted", "rejected"],
            },
            term: { type: "string" },
            discordId: { type: "string" },
            relationType: { type: "string" },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
          },
        },
        response: {
          200: describeResponse("Liste des relations retournee avec succes", {
            type: "object",
            required: ["items", "count"],
            properties: {
              items: { type: "array", items: relationSchema },
              count: { type: "integer" },
            },
          }),
          500: describeResponse("Erreur serveur lors de la lecture des relations", errorSchema),
        },
      },
    },
    async (request, reply) => {
      try {
        const items = await listRelations(request.query);
        return { items, count: items.length };
      } catch (error) {
        return reply.code(500).send({ error: error.message });
      }
    },
  );

  app.get(
    "/api/relations/:relationId",
    {
      schema: {
        tags: ["Supabase"],
        summary: "Lire une relation",
        description: "Retourne une relation unique depuis son identifiant.",
        params: {
          type: "object",
          required: ["relationId"],
          properties: {
            relationId: { type: "string" },
          },
        },
        response: {
          200: describeResponse("Relation trouvee", relationSchema),
          404: describeResponse("Relation introuvable", errorSchema),
          500: describeResponse("Erreur serveur lors de la lecture de la relation", errorSchema),
        },
      },
    },
    async (request, reply) => {
      try {
        const relation = await getRelationById(request.params.relationId);
        if (!relation) {
          return reply.code(404).send({ error: "Relation introuvable." });
        }

        return relation;
      } catch (error) {
        return reply.code(500).send({ error: error.message });
      }
    },
  );

  app.get(
    "/api/relations/pending/search",
    {
      schema: {
        tags: ["Supabase"],
        summary: "Chercher une relation pending par terme",
        description: "Reprend la logique de recherche de connaissance en attente utilisee par le bot Discord.",
        querystring: {
          type: "object",
          required: ["term"],
          properties: {
            term: { type: "string", minLength: 1 },
          },
        },
        response: {
          200: describeResponse("Relation pending trouvee ou resultat nul si aucune correspondance", {
            anyOf: [relationSchema, { type: "null" }],
          }),
          500: describeResponse("Erreur serveur lors de la recherche de relation pending", errorSchema),
        },
      },
    },
    async (request, reply) => {
      try {
        return await getPendingKnowledgeForTerm(request.query.term);
      } catch (error) {
        return reply.code(500).send({ error: error.message });
      }
    },
  );

  app.post(
    "/api/relations",
    {
      schema: {
        tags: ["Supabase"],
        summary: "Creer une proposition de relation",
        description: "Ajoute une relation proposee en statut pending dans la base Supabase.",
        body: {
          type: "object",
          required: ["discordId", "source", "relation", "cible", "estVrai"],
          properties: {
            discordId: { type: "string" },
            source: { type: "string" },
            relation: { type: "string" },
            cible: { type: "string" },
            estVrai: { type: "boolean" },
            contexte: { type: ["string", "null"] },
          },
        },
        response: {
          201: describeResponse("Proposition de relation creee avec succes", relationSchema),
          500: describeResponse("Erreur serveur lors de la creation de la proposition", errorSchema),
        },
      },
    },
    async (request, reply) => {
      try {
        const { discordId, source, relation, cible, estVrai, contexte } = request.body;
        const inserted = await addProposition(discordId, source, relation, cible, estVrai, contexte);

        if (!inserted?.[0]) {
          return reply.code(500).send({ error: "Impossible d'ajouter la relation." });
        }

        return reply.code(201).send(inserted[0]);
      } catch (error) {
        return reply.code(500).send({ error: error.message });
      }
    },
  );

  app.get(
    "/api/votes",
    {
      schema: {
        tags: ["Supabase"],
        summary: "Lister les votes",
        description: "Expose les votes stockes dans la table validate.",
        querystring: {
          type: "object",
          properties: {
            relationId: { type: "string" },
            discordId: { type: "string" },
            limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
          },
        },
        response: {
          200: describeResponse("Liste des votes retournee avec succes", {
            type: "object",
            required: ["items", "count"],
            properties: {
              items: { type: "array", items: voteSchema },
              count: { type: "integer" },
            },
          }),
          500: describeResponse("Erreur serveur lors de la lecture des votes", errorSchema),
        },
      },
    },
    async (request, reply) => {
      try {
        const items = await listVotes(request.query);
        return { items, count: items.length };
      } catch (error) {
        return reply.code(500).send({ error: error.message });
      }
    },
  );

  app.post(
    "/api/relations/:relationId/votes",
    {
      schema: {
        tags: ["Supabase"],
        summary: "Voter sur une relation",
        description: "Enregistre un vote pour une relation depuis la table validate.",
        params: {
          type: "object",
          required: ["relationId"],
          properties: {
            relationId: { type: "string" },
          },
        },
        body: {
          type: "object",
          required: ["discordId", "vote"],
          properties: {
            discordId: { type: "string" },
            vote: { type: "integer", enum: [-1, 1] },
          },
        },
        response: {
          200: describeResponse("Vote traite, avec succes ou refus metier explicite", {
            type: "object",
            required: ["success"],
            properties: {
              success: { type: "boolean" },
              error: { type: ["string", "null"] },
            },
          }),
          500: describeResponse("Erreur serveur lors de l'enregistrement du vote", errorSchema),
        },
      },
    },
    async (request, reply) => {
      try {
        const result = await voteRelation(
          request.params.relationId,
          request.body.discordId,
          request.body.vote,
        );

        if (!result.success) {
          return reply.code(200).send(result);
        }

        return result;
      } catch (error) {
        return reply.code(500).send({ error: error.message });
      }
    },
  );
}
