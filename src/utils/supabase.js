import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

/**
 * Vérifie si un utilisateur existe dans la base, sinon le crée avec 50% de confiance.
 */
export async function ensureUserExists(discordId) {

    let { data: user, error } = await supabase
        .from('users')
        .select('discord_id, trust_score')
        .eq('discord_id', discordId)
        .single();

    // S'il n'existe pas, on l'ajoute
    if (!user) {
        const { data: newUser, error: insertError } = await supabase
            .from('users')
            .insert([{ discord_id: discordId, trust_score: 0.5 }])
            .select()
            .single();

        if (insertError) {
            console.error("Erreur lors de la création de l'utilisateur :", insertError.message);
            return null;
        }
        return newUser;
    }

    return user;
}

export async function getPendingKnowledgeForTerm(term) {
    console.log(`[DB] Recherche en cours pour le mot-clé: ${term}`);

    const { data, error } = await supabase
        .from('relations')
        .select(`
            *,
            users ( trust_score )
        `)
        .eq('statut', 'pending')
        .or(`terme_source.ilike.%${term}%,terme_cible.ilike.%${term}%`)
        // Correction : on trie sur trust_score qui est dans la table users
        .order('trust_score', { foreignTable: 'users', ascending: true })
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
export async function voteRelation(relationId, voterId, weight) {
    try {        
        const { data: rel, error: relErr } = await supabase
            .from('relations')
            .select('id')
            .eq('id', relationId)
            .single();

        if (relErr || !rel) return { success: false, error: "Relation introuvable." };

        // Sécurité : Pas d'auto-vote à de commenter quand on fait la démo 
        /*    if (rel.user_id === voterId) {
               return { success: false, error: "Tu ne peux pas valider ta propre information !" };
           } */
        
        const { error: voteErr } = await supabase
            .from('validate')
            .insert([
                {
                    relation_id: relationId,
                    discord_id: voterId,
                    vote: weight
                }
            ]);

        // Si voteErr existe, c'est probablement que l'utilisateur a déjà voté (contrainte Unique)
        if (voteErr) {
            return { success: false, error: "Tu as déjà voté pour cette information." };
        }

        return { success: true };
    } catch (error) {
        console.error("Erreur voteRelation:", error);
        return { success: false, error: "Erreur technique lors du vote." };
    }
}

/**
 * Ajoute une nouvelle connaissance proposée par un utilisateur dans la table relations.
 */
export async function addProposition(discordId, source, relation, cible, estVrai, contexte = null) {
    const { data, error } = await supabase
        .from('relations')
        .insert([{
            discord_id: discordId,
            terme_source: source,
            type_relation: relation,
            terme_cible: cible,
            est_vrai: estVrai,
            contexte_annotation: contexte,
            statut: 'pending'
        }])
        .select();

    if (error) {
        console.error("Erreur lors de l'ajout de la proposition :", error.message);
        return null;
    }
    return data;


}