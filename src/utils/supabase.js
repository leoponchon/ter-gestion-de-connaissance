import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);

const RELATION_SELECT = `
    id,
    discord_id,
    terme_source,
    type_relation,
    terme_cible,
    est_vrai,
    contexte_annotation,
    statut,
    weight,
    proposer_trust_score,
    created_at,
    users ( trust_score )
`;

function clampLimit(limit, defaultValue = 20, max = 100) {
  const parsed = Number(limit);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultValue;
  }

  return Math.min(Math.trunc(parsed), max);
}

function isNotFoundError(error) {
  return error?.code === "PGRST116";
}

function buildTermSearchFilter(term) {
  return `terme_source.ilike.%${term}%,terme_cible.ilike.%${term}%`;
}

export async function getUserByDiscordId(discordId) {
  const { data, error } = await supabase
    .from("users")
    .select("discord_id, trust_score, created_at")
    .eq("discord_id", discordId)
    .maybeSingle();

  if (error) {
    throw new Error(`Erreur lors de la lecture de l'utilisateur: ${error.message}`);
  }

  return data;
}

/**
 * Vérifie si un utilisateur existe dans la base, sinon le crée avec 50% de confiance.
 */
export async function ensureUserExists(discordId) {
  const existingUser = await getUserByDiscordId(discordId);
  if (existingUser) return existingUser;

  const { data: newUser, error: insertError } = await supabase
    .from("users")
    .insert([{ discord_id: discordId, trust_score: 0.5 }])
    .select("discord_id, trust_score, created_at")
    .single();

  if (insertError) {
    console.error("Erreur lors de la création de l'utilisateur :", insertError.message);
    return null;
  }

  return newUser;
}

/**
 * Met à jour le score de confiance d'un utilisateur.
 */
export async function updateTrustScore(discordId, delta) {
  const user = await getUserByDiscordId(discordId);
  if (!user) return;

  // Limite le score entre 0 et 1
  const newScore = Math.max(0, Math.min(1, user.trust_score + delta));

  const { error } = await supabase
    .from("users")
    .update({ trust_score: newScore })
    .eq("discord_id", discordId);

  if (error) {
    console.error("Erreur lors de la mise à jour du trust_score :", error.message);
  }
}

export async function listRelations(filters = {}) {
  const {
    status,
    term,
    discordId,
    relationType,
    limit = 20,
  } = filters;

  let query = supabase
    .from("relations")
    .select(RELATION_SELECT)
    .order("created_at", { ascending: false })
    .limit(clampLimit(limit));

  if (status) query = query.eq("statut", status);
  if (discordId) query = query.eq("discord_id", discordId);
  if (relationType) query = query.eq("type_relation", relationType);
  if (term) query = query.or(buildTermSearchFilter(term));

  const { data, error } = await query;

  if (error) {
    throw new Error(`Erreur lors de la lecture des relations: ${error.message}`);
  }

  return data ?? [];
}

export async function getRelationById(relationId) {
  const { data, error } = await supabase
    .from("relations")
    .select(RELATION_SELECT)
    .eq("id", relationId)
    .maybeSingle();

  if (error) {
    throw new Error(`Erreur lors de la lecture de la relation: ${error.message}`);
  }

  return data;
}

export async function listVotes(filters = {}) {
  const { relationId, discordId, limit = 50 } = filters;

  let query = supabase
    .from("validate")
    .select("id, relation_id, discord_id, vote, created_at")
    .order("created_at", { ascending: false })
    .limit(clampLimit(limit, 50, 200));

  if (relationId) query = query.eq("relation_id", relationId);
  if (discordId) query = query.eq("discord_id", discordId);

  const { data, error } = await query;

  if (error) {
    throw new Error(`Erreur lors de la lecture des votes: ${error.message}`);
  }

  return data ?? [];
}

export async function hasUserVoted(relationId, userId) {
  try {
    const { data, error } = await supabase
      .from("validate")
      .select("id")
      .eq("relation_id", relationId)
      .eq("discord_id", userId)
      .maybeSingle();

    if (error) return false;
    return data !== null;
  } catch (error) {
    return false;
  }
}

export async function getPendingKnowledgeForTerm(term) {
  console.log(`[DB] Recherche en cours pour le mot-clé: ${term}`);

  const { data, error } = await supabase
    .from("relations")
    .select(RELATION_SELECT)
    .eq("statut", "pending")
    .or(buildTermSearchFilter(term))
    .order("trust_score", { foreignTable: "users", ascending: true })
    .limit(1);

  if (error) {
    console.error("[DB ERR] Erreur recherche pending:", error.message);
    return null;
  }

  if (data && data.length > 0) {
    console.log(`[DB] Info trouvée ! Sujet: ${data[0].terme_source}`);
    return data[0];
  }

  return null;
}

const VOTE_MAX = 10;

/**
 * Retourne le nombre de votes restants pour une relation (max 10).
 * Calcul : 10 - nombre de votes distincts déjà enregistrés
 */
export async function getVotesRemaining(relationId) {
  const votes = await listVotes({ relationId, limit: VOTE_MAX });
  // Compter les votes uniques (un par utilisateur)
  const uniqueVoters = new Set(votes.map(v => v.discord_id)).size;
  return Math.max(0, VOTE_MAX - uniqueVoters);
}

/**
 * Calcule et met à jour le poids final d'une relation après qu'elle ait 10 votes.
 * Retourne la relation finalisée ou null si erreur.
 */
export async function finalizeRelationAfterVotes(relationId) {
  try {
    const relation = await getRelationById(relationId);
    if (!relation) return null;

    const votes = await listVotes({ relationId, limit: VOTE_MAX });
    const uniqueVoters = new Set(votes.map(v => v.discord_id)).size;

    // Ne finaliser que si 10 votants uniques
    if (uniqueVoters < VOTE_MAX) {
      return null;
    }

    let scoreTotal = 0;
    const votesMap = {};

    for (const vote of votes) {
      const voter = await getUserByDiscordId(vote.discord_id);
      const voterTrust = voter?.trust_score || 0.5;
      votesMap[vote.discord_id] = vote.vote * voterTrust;
    }

    scoreTotal = Object.values(votesMap).reduce((a, b) => a + b, 0);

    const avgScore = scoreTotal / uniqueVoters;
    let finalWeight = 0;

    if (avgScore > 0.2) {
      finalWeight = Math.floor(avgScore * 500);
    } else if (avgScore < -0.2) {
      finalWeight = Math.floor(avgScore * 100);
    } else {
      finalWeight = 0;
    }

    let newStatus = "pending";
    if (avgScore > 0.2) {
      newStatus = "accepted";
    } else if (avgScore < -0.2) {
      newStatus = "rejected";
    }

    // Mettre à jour la relation
    const { data, error } = await supabase
      .from("relations")
      .update({
        weight: finalWeight,
        statut: newStatus,
      })
      .eq("id", relationId)
      .select(RELATION_SELECT);

    if (error) {
      console.error("Erreur finalizeRelationAfterVotes:", error.message);
      return null;
    }

    console.log(`[DB] Relation ${relationId} finalisée: statut=${newStatus}, weight=${finalWeight}`);
    return data?.[0] || null;
  } catch (error) {
    console.error("Erreur finalizeRelationAfterVotes:", error);
    return null;
  }
}

export async function voteRelation(relationId, voterId, weight) {
  try {
    const relation = await getRelationById(relationId);
    if (!relation) {
      return { success: false, error: "Relation introuvable." };
    }

    const { error: voteErr } = await supabase
      .from("validate")
      .insert([
        {
          relation_id: relationId,
          discord_id: voterId,
          vote: weight,
        },
      ]);

    if (voteErr) {
      return { success: false, error: "Tu as déjà voté pour cette information." };
    }

    // Vérifier si la relation doit être finalisée (10 votants)
    const votesRemaining = await getVotesRemaining(relationId);
    const finalized = await finalizeRelationAfterVotes(relationId);

    return {
      success: true,
      votesRemaining,
      finalized: finalized !== null,
      finalizedRelation: finalized,
    };
  } catch (error) {
    console.error("Erreur voteRelation:", error);
    return { success: false, error: "Erreur technique lors du vote." };
  }
}


// Normalise les différentes façons d'exprimer vrai/faux/maybe en une valeur standardisée.
function normalizeEstVraiValue(value) {
  if (value == null) return null;
  const normalized = String(value).trim().toLowerCase();

  if (normalized === "true" || normalized === "vrai") return "true";
  if (normalized === "false" || normalized === "faux") return "false";
  if (normalized === "maybe" || normalized === "peut-etre" || normalized === "peut-être" || normalized === "probablement" || normalized === "possible") return "maybe";

  return null;
}

/**
 * Ajoute une nouvelle connaissance proposée par un utilisateur dans la table relations.
 * Vérifie d'abord que l'utilisateur a un trust_score >= 0.7.
 */
export async function addProposition(
  discordId,
  source,
  relation,
  cible,
  estVrai,
  contexte = null,
) {
  // Vérifier trust_score >= 0.7
  const user = await getUserByDiscordId(discordId);
  if (!user || user.trust_score < 0.7) {
    console.warn(`[DB] Utilisateur ${discordId} n'a pas assez de confiance (${user?.trust_score || 0}). Minimum: 0.7`);
    return { success: false, error: "Ton score de fiabilité est insuffisant pour proposer des relations. (Minimum: 0.7)" };
  }

  const normalizedEstVrai = normalizeEstVraiValue(estVrai);

  const { data, error } = await supabase
    .from("relations")
    .insert([
      {
        discord_id: discordId,
        terme_source: source,
        type_relation: relation,
        terme_cible: cible,
        est_vrai: normalizedEstVrai,
        contexte_annotation: contexte,
        statut: "pending",
        weight: 0,
        proposer_trust_score: user.trust_score,
      },
    ])
    .select(RELATION_SELECT);

  if (error) {
    console.error("Erreur lors de l'ajout de la proposition :", error.message);
    return { success: false, error: error.message };
  }

  return { success: true, data: data };
}

export async function getSupabaseHealth() {
  const { error } = await supabase
    .from("users")
    .select("discord_id", { count: "exact", head: true });

  if (error && !isNotFoundError(error)) {
    throw new Error(`Connexion Supabase indisponible: ${error.message}`);
  }

  return { ok: true };
}
