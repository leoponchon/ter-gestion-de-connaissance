import { fetchOutgoingRelations, fetchIncomingRelations, RELATION_TYPE_IDS, fetchRelationTypes } from "./jdm.js";

// ========== CONSTANTES ==========

// Relations transitives
const TRANSITIVE_RELATIONS = ["r_isa", "r_has_part", "r_lieu"];

// Profondeur max pour éviter les boucles infinies
const MAX_DEPTH = 3;
const MAX_SYNONYMS = 5;
const MAX_HYPO = 5;

// ========== HELPERS ==========

/**
 * Cherche si la relation directe (A r B) existe dans JDM.
 * Retourne l'objet relation trouvé ou null.
 */
async function findDirectRelation(source, relationType, target) {
  try {
    const typeId = RELATION_TYPE_IDS[relationType];
    if (typeId === undefined) return null;

    const data = await fetchOutgoingRelations(source, 200, [typeId]);
    const relations = data.relations || [];
    const nodes = {};
    (data.nodes || []).forEach(n => nodes[n.id] = n);

    for (const rel of relations) {
      const targetNode = nodes[rel.node2];
      if (targetNode && targetNode.name.toLowerCase() === target.toLowerCase()) {
        return {
          source,
          relation: relationType,
          target: targetNode.name,
          weight: rel.w
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Récupère les cibles d'une relation sortante pour un terme donné.
 * Ex: getOutgoingTargets("souris", "r_isa") → ["rongeur", "animal", ...]
 */
async function getOutgoingTargets(term, relationType, limit = 50) {
  try {
    const typeId = RELATION_TYPE_IDS[relationType];
    if (typeId === undefined) return [];

    const data = await fetchOutgoingRelations(term, limit, [typeId]);
    const nodes = {};
    (data.nodes || []).forEach(n => nodes[n.id] = n);

    return (data.relations || [])
      .filter(r => r.w > 0) // Poids positif uniquement
      .sort((a, b) => b.w - a.w)
      .map(r => ({
        name: nodes[r.node2]?.name,
        weight: r.w
      }))
      .filter(r => r.name);
  } catch {
    return [];
  }
}

/**
 * Récupère les sources d'une relation entrante pour un terme donné.
 * Ex: getIncomingSources("animal", "r_isa") → ["chat", "chien", ...]
 */
async function getIncomingSources(term, relationType, limit = 50) {
  try {
    const typeId = RELATION_TYPE_IDS[relationType];
    if (typeId === undefined) return [];

    const data = await fetchIncomingRelations(term, limit, [typeId]);
    const nodes = {};
    (data.nodes || []).forEach(n => nodes[n.id] = n);

    return (data.relations || [])
      .filter(r => r.w > 0)
      .sort((a, b) => b.w - a.w)
      .map(r => ({
        name: nodes[r.node1]?.name,
        weight: r.w
      }))
      .filter(r => r.name);
  } catch {
    return [];
  }
}

/**
 * Vérifie si un terme est polysémique (a des formes terme>sens).
 */
async function checkPolysemy(term) {
  try {
    const data = await fetchOutgoingRelations(term, 100, [RELATION_TYPE_IDS["r_associated"]]);
    const nodes = {};
    (data.nodes || []).forEach(n => nodes[n.id] = n);

    const senses = [];
    for (const node of Object.values(nodes)) {
      if (node.name && node.name.includes(">") && node.name.toLowerCase().startsWith(term.toLowerCase() + ">")) {
        senses.push(node.name);
      }
    }

    // Aussi chercher via les raffinements
    if (senses.length === 0) {
      const allData = await fetchOutgoingRelations(term, 200, null);
      const allNodes = {};
      (allData.nodes || []).forEach(n => allNodes[n.id] = n);

      for (const node of Object.values(allNodes)) {
        if (node.name && node.name.includes(">") && node.name.toLowerCase().startsWith(term.toLowerCase() + ">")) {
          senses.push(node.name);
        }
      }
    }

    return senses.length > 1 ? senses : [];
  } catch {
    return [];
  }
}

// ========== RÈGLES D'INFÉRENCE ==========

/**
 * 1. TRIANGLE LOGIQUE
 * Cherche C tel que: A is_a C ET C r B
 * Si trouvé → A r B est plausible par héritage.
 */
async function inferByTriangle(source, relationType, target) {
  console.log(`[INFER] Triangle logique: ${source} ${relationType} ${target} ?`);

  // Trouver les parents de A via is_a
  const parents = await getOutgoingTargets(source, "r_isa", 20);

  for (const parent of parents) {
    // Vérifier polysémie du concept intermédiaire
    const senses = await checkPolysemy(parent.name);
    if (senses.length > 0) {
      // Si polysémique, tester chaque sens
      let foundForAnySense = false;
      for (const sense of senses) {
        const rel = await findDirectRelation(sense, relationType, target);
        if (rel) {
          console.log(`[INFER] ✓ Triangle: ${source} is_a ${parent.name} (sens: ${sense}) → ${sense} ${relationType} ${target}`);
          return {
            found: true,
            method: "triangle_logique",
            explanation: `${source} est un(e) ${parent.name} (sens: ${sense}), et ${sense} ${relationType} ${target}`,
            chain: [
              { source, relation: "r_isa", target: parent.name, weight: parent.weight },
              { source: sense, relation: relationType, target, weight: rel.weight }
            ]
          };
        }
      }
      if (!foundForAnySense) continue;
    } else {
      // Concept non polysémique, vérification directe
      const rel = await findDirectRelation(parent.name, relationType, target);
      if (rel) {
        console.log(`[INFER] ✓ Triangle: ${source} is_a ${parent.name} → ${parent.name} ${relationType} ${target}`);
        return {
          found: true,
          method: "triangle_logique",
          explanation: `${source} est un(e) ${parent.name}, et ${parent.name} ${relationType} ${target}`,
          chain: [
            { source, relation: "r_isa", target: parent.name, weight: parent.weight },
            { source: parent.name, relation: relationType, target, weight: rel.weight }
          ]
        };
      }
    }
  }

  return null;
}

/**
 * 2. TRANSITIVITÉ
 * Pour r_isa, r_has_part, r_lieu:
 * Si A r B et B r C → A r C
 */
async function inferByTransitivity(source, relationType, target, depth = 0, visited = new Set()) {
  if (!TRANSITIVE_RELATIONS.includes(relationType)) return null;
  if (depth >= MAX_DEPTH) return null;
  if (visited.has(source.toLowerCase())) return null;

  console.log(`[INFER] Transitivité (profondeur ${depth}): ${source} ${relationType} ${target} ?`);
  visited.add(source.toLowerCase());

  // Trouver les intermédiaires: A r ?
  const intermediates = await getOutgoingTargets(source, relationType, 30);

  for (const mid of intermediates) {
    if (visited.has(mid.name.toLowerCase())) continue;

    // Vérifier si l'intermédiaire a directement la relation vers target
    const directRel = await findDirectRelation(mid.name, relationType, target);
    if (directRel) {
      console.log(`[INFER] ✓ Transitivité: ${source} ${relationType} ${mid.name} → ${mid.name} ${relationType} ${target}`);
      return {
        found: true,
        method: "transitivite",
        explanation: `${source} ${relationType} ${mid.name}, et ${mid.name} ${relationType} ${target}`,
        chain: [
          { source, relation: relationType, target: mid.name, weight: mid.weight },
          { source: mid.name, relation: relationType, target, weight: directRel.weight }
        ]
      };
    }

    // Récursion: chercher plus loin
    if (depth < MAX_DEPTH - 1) {
      const deeper = await inferByTransitivity(mid.name, relationType, target, depth + 1, visited);
      if (deeper) {
        deeper.chain.unshift({ source, relation: relationType, target: mid.name, weight: mid.weight });
        deeper.explanation = `${source} ${relationType} ${mid.name}, puis ${deeper.explanation}`;
        return deeper;
      }
    }
  }

  return null;
}

/**
 * 3. SCHÉMA AGENT / ACTION
 * Si A est l'agent d'un processus P, et P est l'action du verbe V,
 * alors A peut V.
 */
async function inferByAgentAction(source, target) {
  console.log(`[INFER] Agent/Action: ${source} peut ${target} ?`);

  // Chercher les actions/processus dont source est l'agent (via r_agent entrant)
  // source --r_agent--> processus (outgoing)
  const agentOf = await getOutgoingTargets(source, "r_agent", 20);

  for (const process of agentOf) {
    const processName = process.name.toLowerCase();
    const targetLower = target.toLowerCase();

    // Vérifier si le processus correspond au verbe/action cible
    // Ex: "jardinage" correspond à "jardiner"
    if (
      processName.includes(targetLower) ||
      targetLower.includes(processName) ||
      processName.replace("age", "er") === targetLower ||
      processName.replace("tion", "er") === targetLower ||
      processName.replace("ment", "er") === targetLower
    ) {
      console.log(`[INFER] ✓ Agent/Action: ${source} est agent de ${process.name} → peut ${target}`);
      return {
        found: true,
        method: "agent_action",
        explanation: `${source} est l'agent du processus "${process.name}", donc ${source} peut ${target}`,
        chain: [
          { source, relation: "r_agent", target: process.name, weight: process.weight }
        ]
      };
    }
  }

  // Approche inverse: chercher les processus dont le nom est proche de la cible
  // et vérifier si la source est un agent de ce processus
  const possibleProcesses = [
    target,
    target.replace("er", "age"),
    target.replace("er", "tion"),
    target.replace("er", "ment")
  ];

  for (const processName of possibleProcesses) {
    const agents = await getIncomingSources(processName, "r_agent", 20);
    for (const agent of agents) {
      if (agent.name.toLowerCase() === source.toLowerCase()) {
        console.log(`[INFER] ✓ Agent/Action (inverse): ${source} est agent de ${processName}`);
        return {
          found: true,
          method: "agent_action",
          explanation: `${source} est l'agent du processus "${processName}", donc ${source} peut ${target}`,
          chain: [
            { source, relation: "r_agent", target: processName, weight: agent.weight }
          ]
        };
      }
    }
  }

  return null;
}

/**
 * 4. INFÉRENCE PAR SYNONYMIE
 * Si A ≈ A' et/ou B ≈ B', et A' r B' est vrai, alors A r B.
 */
async function inferBySynonymy(source, relationType, target) {
  console.log(`[INFER] Synonymie: ${source} ${relationType} ${target} ?`);

  // Synonymes de source
  const sourceSyns = await getOutgoingTargets(source, "r_syn", MAX_SYNONYMS);
  // Synonymes de target
  const targetSyns = await getOutgoingTargets(target, "r_syn", MAX_SYNONYMS);

  // Tester source' r target
  for (const syn of sourceSyns) {
    const rel = await findDirectRelation(syn.name, relationType, target);
    if (rel) {
      console.log(`[INFER] ✓ Synonymie: ${source} ≈ ${syn.name}, et ${syn.name} ${relationType} ${target}`);
      return {
        found: true,
        method: "synonymie",
        explanation: `${source} est synonyme de ${syn.name}, et ${syn.name} ${relationType} ${target}`,
        chain: [
          { source, relation: "r_syn", target: syn.name, weight: syn.weight },
          { source: syn.name, relation: relationType, target, weight: rel.weight }
        ]
      };
    }
  }

  // Tester source r target'
  for (const syn of targetSyns) {
    const rel = await findDirectRelation(source, relationType, syn.name);
    if (rel) {
      console.log(`[INFER] ✓ Synonymie: ${target} ≈ ${syn.name}, et ${source} ${relationType} ${syn.name}`);
      return {
        found: true,
        method: "synonymie",
        explanation: `${target} est synonyme de ${syn.name}, et ${source} ${relationType} ${syn.name}`,
        chain: [
          { source: target, relation: "r_syn", target: syn.name, weight: syn.weight },
          { source, relation: relationType, target: syn.name, weight: rel.weight }
        ]
      };
    }
  }

  // Tester source' r target'
  for (const sSyn of sourceSyns) {
    for (const tSyn of targetSyns) {
      const rel = await findDirectRelation(sSyn.name, relationType, tSyn.name);
      if (rel) {
        console.log(`[INFER] ✓ Synonymie croisée: ${sSyn.name} ${relationType} ${tSyn.name}`);
        return {
          found: true,
          method: "synonymie",
          explanation: `${source} ≈ ${sSyn.name} et ${target} ≈ ${tSyn.name}, et ${sSyn.name} ${relationType} ${tSyn.name}`,
          chain: [
            { source, relation: "r_syn", target: sSyn.name, weight: sSyn.weight },
            { source: target, relation: "r_syn", target: tSyn.name, weight: tSyn.weight },
            { source: sSyn.name, relation: relationType, target: tSyn.name, weight: rel.weight }
          ]
        };
      }
    }
  }

  return null;
}

/**
 * 5. INFÉRENCE PAR HYPONYMIE
 * Si B' est un hyponyme de B (B' is_a B), et A r B' est vrai, alors A r B.
 * Ou: si A' est un hyperonyme de A, et A' r B est vrai, alors A r B.
 */
async function inferByHyponymy(source, relationType, target) {
  console.log(`[INFER] Hyponymie: ${source} ${relationType} ${target} ?`);

  // Chercher les hyponymes de target (concepts plus spécifiques)
  // hyponyme is_a target (incoming r_isa sur target)
  const hypos = await getIncomingSources(target, "r_isa", MAX_HYPO);

  for (const hypo of hypos) {
    const rel = await findDirectRelation(source, relationType, hypo.name);
    if (rel) {
      console.log(`[INFER] ✓ Hyponymie: ${source} ${relationType} ${hypo.name}, et ${hypo.name} is_a ${target}`);
      return {
        found: true,
        method: "hyponymie",
        explanation: `${source} ${relationType} ${hypo.name}, et ${hypo.name} est un type de ${target}`,
        chain: [
          { source, relation: relationType, target: hypo.name, weight: rel.weight },
          { source: hypo.name, relation: "r_isa", target, weight: hypo.weight }
        ]
      };
    }
  }

  // Chercher les hyperonymes de source (A is_a A') et vérifier A' r B
  const hyperonyms = await getOutgoingTargets(source, "r_isa", MAX_HYPO);

  for (const hyper of hyperonyms) {
    const rel = await findDirectRelation(hyper.name, relationType, target);
    if (rel) {
      console.log(`[INFER] ✓ Hyperonymie: ${source} is_a ${hyper.name}, et ${hyper.name} ${relationType} ${target}`);
      return {
        found: true,
        method: "hyponymie",
        explanation: `${source} est un(e) ${hyper.name}, et ${hyper.name} ${relationType} ${target}`,
        chain: [
          { source, relation: "r_isa", target: hyper.name, weight: hyper.weight },
          { source: hyper.name, relation: relationType, target, weight: rel.weight }
        ]
      };
    }
  }

  return null;
}

// ========== FONCTION PRINCIPALE ==========

/**
 * Tente de vérifier/inférer la relation (source relationType target).
 * Applique dans l'ordre :
 *  1. Vérification directe
 *  2. Triangle logique
 *  3. Transitivité
 *  4. Synonymie
 *  5. Hyponymie
 *  6. Agent/Action
 *
 * Retourne un objet structuré avec le résultat.
 */
export async function inferRelation(source, relationType, target) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`[INFER] Début inférence: "${source}" ${relationType} "${target}"`);
  console.log(`${"=".repeat(60)}`);

  // === 1. Vérification directe ===
  const direct = await findDirectRelation(source, relationType, target);
  if (direct) {
    console.log(`[INFER] ✓ Relation directe trouvée (poids: ${direct.weight})`);
    return {
      success: true,
      found: true,
      source,
      relation: relationType,
      target,
      method: "direct",
      explanation: `La relation est directement présente dans JeuxDeMots avec un poids de ${direct.weight}.`,
      weight: direct.weight,
      chain: [direct]
    };
  }

  console.log(`[INFER] Relation directe non trouvée. Tentative d'inférence...`);

  // === 2. Triangle logique ===
  const triangle = await inferByTriangle(source, relationType, target);
  if (triangle) {
    return { success: true, ...triangle, source, relation: relationType, target };
  }

  // === 3. Transitivité ===
  const transitive = await inferByTransitivity(source, relationType, target);
  if (transitive) {
    return { success: true, ...transitive, source, relation: relationType, target };
  }

  // === 4. Synonymie ===
  const synonym = await inferBySynonymy(source, relationType, target);
  if (synonym) {
    return { success: true, ...synonym, source, relation: relationType, target };
  }

  // === 5. Hyponymie ===
  const hyponymy = await inferByHyponymy(source, relationType, target);
  if (hyponymy) {
    return { success: true, ...hyponymy, source, relation: relationType, target };
  }

  // === 6. Agent/Action (si applicable) ===
  if (relationType === "r_agent" || !relationType || relationType === "peut") {
    const agentAction = await inferByAgentAction(source, target);
    if (agentAction) {
      return { success: true, ...agentAction, source, relation: "r_agent", target };
    }
  }

  // === Rien trouvé ===
  console.log(`[INFER] ✗ Aucune inférence possible pour "${source}" ${relationType} "${target}"`);
  return {
    success: true,
    found: false,
    source,
    relation: relationType,
    target,
    method: null,
    explanation: `Aucune relation directe ni inférence possible entre "${source}" et "${target}" pour la relation ${relationType}. La base ne permet pas de conclure.`,
    chain: []
  };
}

/**
 * Vérifie la crédibilité d'un énoncé utilisateur.
 * Essaie de vérifier que l'affirmation est plausible via inférence.
 */
export async function checkCredibility(source, relationType, target) {
  const result = await inferRelation(source, relationType, target);

  if (result.found) {
    return {
      ...result,
      credible: true,
      credibilityExplanation: `L'énoncé "${source} ${relationType} ${target}" est crédible. ${result.explanation}`
    };
  }

  return {
    ...result,
    credible: false,
    credibilityExplanation: `L'énoncé "${source} ${relationType} ${target}" ne peut pas être vérifié par inférence.`
  };
}

export { checkPolysemy };
