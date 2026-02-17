import axios from "axios";

const JDM_API_BASE_URL = "https://jdm-api.demo.lirmm.fr";

// Mapping des types de relations (nom → ID)
export const RELATION_TYPE_IDS = {
  "r_has_part": 9,
  "r_isa": 6,
  "r_hypo": 8,
  "r_lieu": 15,
  "r_agent": 13,
  "r_patient": 14,
  "r_carac": 17,
  "r_syn": 5,
  "r_anto": 7,
  "r_object>mater": 50,
  "r_telic_role": 37,
  "r_instr": 16,
  "r_associated": 0,
};

// Cache des types de relations
let relationTypesCache = null;

// ========== API BRUTE JDM ==========

// Récupère et cache les types de relations
export async function fetchRelationTypes() {
  if (relationTypesCache) return relationTypesCache;

  try {
    const response = await axios.get(`${JDM_API_BASE_URL}/v0/relations_types`, { timeout: 10000 });
    relationTypesCache = {};
    response.data.forEach(type => relationTypesCache[type.id] = type.name);
    return relationTypesCache;
  } catch (error) {
    console.error("Erreur récupération types de relations:", error.message);
    return {};
  }
}

// Recherche un terme par son nom (API brute)
export async function fetchSearchTerm(term) {
  try {
    const response = await axios.get(`${JDM_API_BASE_URL}/v0/node_by_name/${encodeURIComponent(term)}`, { timeout: 10000 });
    return response.data;
  } catch (error) {
    throw new Error(`Impossible de rechercher le terme "${term}"`);
  }
}

// Récupère les relations sortantes (API brute)
export async function fetchOutgoingRelations(termName, limit = 20, typesIds = null) {
  try {
    const params = {};
    if (limit > 0) params.limit = limit;
    if (typesIds?.length > 0) params.types_ids = typesIds[0];

    const response = await axios.get(`${JDM_API_BASE_URL}/v0/relations/from/${encodeURIComponent(termName)}`, {
      params, timeout: 10000
    });
    return response.data;
  } catch (error) {
    throw new Error(`Impossible de récupérer les relations sortantes pour "${termName}"`);
  }
}

// Récupère les relations entrantes (API brute)
export async function fetchIncomingRelations(termName, limit = 20, typesIds = null) {
  try {
    const params = {};
    if (limit > 0) params.limit = limit;
    if (typesIds?.length > 0) params.types_ids = typesIds[0];

    const response = await axios.get(`${JDM_API_BASE_URL}/v0/relations/to/${encodeURIComponent(termName)}`, {
      params, timeout: 10000
    });
    return response.data;
  } catch (error) {
    throw new Error(`Impossible de récupérer les relations entrantes pour "${termName}"`);
  }
}

// ========== OUTILS POUR LLM (Function Calling) ==========

// Tool: Rechercher un terme dans JDM
export async function searchJDMTerm(term) {
  try {
    const result = await fetchSearchTerm(term);
    if (result?.id) {
      return {
        success: true,
        id: result.id,
        name: result.name || term,
        term: term,
        type: result.type,
        weight: result.w
      };
    }
    return {
      success: false,
      error: `Terme "${term}" non trouvé`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// Tool: Récupérer les relations d'un terme
export async function getJDMRelations(termName, direction = "both", relationType = null, limit = 100) {
  const typesIds = relationType && RELATION_TYPE_IDS[relationType]
    ? [RELATION_TYPE_IDS[relationType]]
    : null;

  try {
    const relationTypesMap = await fetchRelationTypes();

    // Récupérer l'ID du terme interrogé pour l'afficher
    let termInfo = null;
    try {
      const searchTerm = await fetchSearchTerm(termName);
      if (searchTerm?.id) {
        termInfo = {
          id: searchTerm.id,
          name: searchTerm.name || termName,
          type: searchTerm.type,
          weight: searchTerm.w
        };
      }
    } catch (e) {
      // Si la recherche échoue, on continue sans l'ID
      console.warn(`Impossible de récupérer l'ID du terme "${termName}":`, e.message);
    }

    const promises = [];
    let outgoingData = { nodes: [], relations: [] };
    let incomingData = { nodes: [], relations: [] };

    if (direction !== "incoming") {
      promises.push(fetchOutgoingRelations(termName, limit, typesIds));
    }
    if (direction !== "outgoing") {
      promises.push(fetchIncomingRelations(termName, limit, typesIds));
    }

    if (promises.length > 0) {
      const results = await Promise.all(promises);

      const nodesMap = {};
      results.forEach((data, i) => {
        const isOutgoing = direction === "incoming" ? false : (direction === "outgoing" ? true : i === 0);
        if (isOutgoing) outgoingData = data;
        else incomingData = data;
        (data.nodes || []).forEach(n => nodesMap[n.id] = n);
      });

      const enrich = (rel) => ({
        id: rel.id,
        sourceId: rel.node1,
        targetId: rel.node2,
        source: nodesMap[rel.node1]?.name,
        target: nodesMap[rel.node2]?.name,
        relation: relationTypesMap[rel.type] || `type_${rel.type}`,
        relationId: rel.type,
        weight: rel.w
      });

      const outgoing = (outgoingData.relations || []).map(enrich).sort((a, b) => b.weight - a.weight);
      const incoming = (incomingData.relations || []).map(enrich).sort((a, b) => b.weight - a.weight);

      return {
        success: true,
        term: termName,
        termId: termInfo?.id || null,
        termName: termInfo?.name || termName,
        termType: termInfo?.type || null,
        termWeight: termInfo?.weight || null,
        direction,
        relationType: relationType || "all",
        limit,
        outgoing,
        incoming,
        totalOutgoing: outgoingData.relations?.length || 0,
        totalIncoming: incomingData.relations?.length || 0
      };
    }

    return {
      success: false,
      error: "Aucune direction valide spécifiée"
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// Tool: Obtenir les types de relations disponibles
export async function getRelationTypes() {
  try {
    const types = await fetchRelationTypes();
    return {
      success: true,
      types: Object.entries(types).map(([id, name]) => ({ id: parseInt(id), name }))
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// ========== DÉFINITIONS DES OUTILS POUR L'API OpenAI ==========

export const TOOLS = [
  {
    type: "function",
    function: {
      name: "search_jdm_term",
      description: "Recherche un terme dans JeuxDeMots et retourne ses informations de base (id, nom, type, poids).",
      parameters: {
        type: "object",
        properties: {
          term: { type: "string", description: "Le terme exact à rechercher (conserve la casse originale)" }
        },
        required: ["term"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_jdm_relations",
      description: "Récupère les relations d'un terme JeuxDeMots. Retourne les données brutes avec poids, noms, types de relations.",
      parameters: {
        type: "object",
        properties: {
          termName: { type: "string", description: "Le nom exact du terme" },
          direction: {
            type: "string",
            enum: ["outgoing", "incoming", "both"],
            description: "Direction des relations (défaut: both)"
          },
          relationType: {
            type: "string",
            enum: Object.keys(RELATION_TYPE_IDS),
            description: "Type de relation à filtrer (ex: r_has_part, r_isa)"
          },
          limit: { type: "number", description: "Nombre max de résultats (défaut: 100, max: 2000)" }
        },
        required: ["termName"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_relation_types",
      description: "Retourne la liste de tous les types de relations disponibles dans JeuxDeMots.",
      parameters: { type: "object", properties: {} }
    }
  }
];

export const TOOL_FUNCTIONS = {
  search_jdm_term: searchJDMTerm,
  get_jdm_relations: getJDMRelations,
  get_relation_types: getRelationTypes
};
