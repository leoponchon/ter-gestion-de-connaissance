/**
 * Système de pièges dynamiques
 * 
 * Génère des questions de contrôle à partir de :
 * 1. Relations vraies (weight > 1000 en BD ou JDM) → réponse attendue = "vrai"
 * 2. Relations fausses (inexistantes en BD et JDM) → réponse attendue = "faux"
 */

import { listRelations, getVotesRemaining } from "./supabase.js";
import { getJDMRelations } from "./jdm.js";

const RELATION_TYPES = [
  "r_isa",
  "r_has_part",
  "r_carac",
  "r_lieu",
  "r_syn",
  "r_anto",
  "r_agent",
  "r_patient",
  "r_object>mater",
  "r_telic_role",
];

/**
 * Récupère une relation vraie (weight > 1000) de la BD ou de JDM pour créer un piège vrai
 */
async function getTrueTrap() {
  try {
    // Essayer d'abord les relations acceptées en BD avec weight > 1000
    const acceptedRelations = await listRelations({
      status: "accepted",
      limit: 100,
    });

    const strongRelations = acceptedRelations.filter(
      (rel) => rel.weight > 1000
    );

    if (strongRelations.length > 0) {
      const trap = strongRelations[
        Math.floor(Math.random() * strongRelations.length)
      ];
      return {
        terme_source: trap.terme_source,
        type_relation: trap.type_relation,
        terme_cible: trap.terme_cible,
        reponse_attendue: "vrai",
        source: "db",
        weight: trap.weight,
      };
    }

    // Fallback : chercher une relation vraie dans JDM
    // Prendre un terme aléatoire et une de ses relations avec poids élevé
    const jdmSearchTerms = [
      "chat",
      "chien",
      "arbre",
      "voiture",
      "maison",
      "soleil",
      "eau",
      "feu",
      "terre",
      "air",
    ];

    const randomTerm =
      jdmSearchTerms[Math.floor(Math.random() * jdmSearchTerms.length)];

    const jdmData = await getJDMRelations(randomTerm, "both", null, 20);

    if (jdmData.success && jdmData.outgoing && jdmData.outgoing.length > 0) {
      // Filtrer les relations avec poids > 200 (confiance JDM)
      const strongJDMRelations = jdmData.outgoing.filter(
        (rel) => rel.weight > 200
      );

      if (strongJDMRelations.length > 0) {
        const jdmRel =
          strongJDMRelations[
            Math.floor(Math.random() * strongJDMRelations.length)
          ];
        return {
          terme_source: jdmRel.source,
          type_relation: jdmRel.relation,
          terme_cible: jdmRel.target,
          reponse_attendue: "vrai",
          source: "jdm",
          weight: jdmRel.weight,
        };
      }
    }

    // Fallback statique si rien ne marche
    return null;
  } catch (error) {
    console.error("[TRAPS] Erreur getTrueTrap:", error.message);
    return null;
  }
}

/**
 * Récupère une relation fausse (n'existe nulle part) pour créer un piège faux
 * Crée un piège en prenant 2 termes aléatoires et une relation aléatoire
 */
async function getFalseTrap() {
  try {
    const terms = [
      "chat",
      "chien",
      "arbre",
      "voiture",
      "maison",
      "soleil",
      "eau",
      "feu",
      "terre",
      "air",
      "nuage",
      "montagne",
      "rivière",
      "roche",
      "sable",
      "herbe",
      "fleur",
      "insecte",
      "oiseau",
      "poison",
      "couteau",
      "assiette",
      "fourchette",
      "cuillère",
      "chaise",
      "table",
      "mur",
      "fenêtre",
      "porte",
      "livre",
    ];

    const randomRelationType =
      RELATION_TYPES[Math.floor(Math.random() * RELATION_TYPES.length)];

    // Essayer plusieurs combinaisons jusqu'à trouver une inexistante
    for (let attempt = 0; attempt < 5; attempt++) {
      const source = terms[Math.floor(Math.random() * terms.length)];
      const target = terms[Math.floor(Math.random() * terms.length)];

      if (source === target) continue; // Éviter les auto-relations

      // Vérifier en BD (pending ou accepted)
      const dbRelations = await listRelations({
        status: "pending",
        term: source,
        limit: 100,
      });

      const existsInDB = dbRelations.some(
        (rel) =>
          rel.terme_source.toLowerCase() === source.toLowerCase() &&
          rel.type_relation === randomRelationType &&
          rel.terme_cible.toLowerCase() === target.toLowerCase()
      );

      if (existsInDB) continue;

      // Vérifier en JDM
      let existsInJDM = false;
      try {
        const jdmData = await getJDMRelations(source, "both", null, 50);
        if (jdmData.success) {
          const allRelations = [
            ...(jdmData.outgoing || []),
            ...(jdmData.incoming || []),
          ];
          existsInJDM = allRelations.some(
            (rel) =>
              rel.target.toLowerCase() === target.toLowerCase() &&
              rel.relation === randomRelationType
          );
        }
      } catch (e) {
        // Continuer même si JDM échoue
      }

      if (!existsInJDM) {
        // Trouvé une relation inexistante
        return {
          terme_source: source,
          type_relation: randomRelationType,
          terme_cible: target,
          reponse_attendue: "faux",
          source: "generated",
        };
      }
    }

    // Fallback : générer une relation aléatoire sans vérifier
    const source = terms[Math.floor(Math.random() * terms.length)];
    const target = terms[Math.floor(Math.random() * terms.length)];
    const relType =
      RELATION_TYPES[Math.floor(Math.random() * RELATION_TYPES.length)];

    return {
      terme_source: source,
      type_relation: relType,
      terme_cible: target,
      reponse_attendue: "faux",
      source: "generated_fallback",
    };
  } catch (error) {
    console.error("[TRAPS] Erreur getFalseTrap:", error.message);
    return null;
  }
}

/**
 * Génère un piège dynamique (60% vrais, 40% faux)
 * Utilise les relations de la BD et JDM
 */
export async function generateDynamicTrap() {
  try {
    const random = Math.random();

    if (random < 0.6) {
      // 60% de chances : piège vrai
      const trueTrap = await getTrueTrap();
      if (trueTrap) {
        return {
          ...trueTrap,
          id: `trap_true_${Date.now()}`,
        };
      }
    } else {
      // 40% de chances : piège faux
      const falseTrap = await getFalseTrap();
      if (falseTrap) {
        return {
          ...falseTrap,
          id: `trap_false_${Date.now()}`,
        };
      }
    }

    // Fallback : retourner null (pas de piège générés)
    return null;
  } catch (error) {
    console.error("[TRAPS] Erreur generateDynamicTrap:", error.message);
    return null;
  }
}
