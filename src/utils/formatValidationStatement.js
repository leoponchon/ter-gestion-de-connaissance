
function chooseArticleForTarget(target) {
    const trimmed = target.trim();
    const lower = trimmed.toLowerCase();
    if (
        lower.startsWith("un ") || lower.startsWith("une ") ||
        lower.startsWith("des ") || lower.startsWith("le ") ||
        lower.startsWith("la ") || lower.startsWith("les ") ||
        lower.startsWith("l'")
    ) {
        return { article: "", target: trimmed };
    }
    const article = lower.endsWith("e") ? "une" : "un";
    return { article, target: trimmed };
}


export function formatValidationStatement(source, relation, target) {
    switch (relation) {
        case "r_has_part": return `${source} a ${target}`;
        case "r_isa": {
            const { article, target: cleanTarget } = chooseArticleForTarget(target);
            return article ? `${source} est ${article} ${cleanTarget}` : `${source} est ${cleanTarget}`;
        }
        case "r_hypo": return `${target} est un type de ${source}`;
        case "r_lieu": return `${source} est dans ${target}`;
        case "r_agent": return `${source} est fait par ${target}`;
        case "r_patient": return `${source} agit sur ${target}`;
        case "r_carac": return `${source} est ${target}`;
        case "r_syn": return `${source} est un synonyme de ${target}`;
        case "r_anto": return `${source} est un contraire de ${target}`;
        case "r_object>mater": return `${source} est fait de ${target}`;
        case "r_telic_role": return `${source} sert a ${target}`;
        case "r_instr": return `${source} s'utilise avec ${target}`;
        case "r_associated": return `${source} est associe a ${target}`;
        default: return `${source} a ${target}`;
    }
}