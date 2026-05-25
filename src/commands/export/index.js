import { listRelations } from "../../utils/supabase.js";
import fs from "fs";
import path from "path";
import { AttachmentBuilder } from "discord.js";

export default {
  command: {
    name: "export",
    description: "Exporte toutes les relations locales de la base de données au format Markdown"
  },
  adminOnly: true,
  async execute(interaction) {
    try {
      await interaction.deferReply();
    } catch (err) {
      if (err.code === 10062) return;
      throw err;
    }

    try {
      const relations = await listRelations({ limit: 5000 });

      let markdownContent = "# Export des Relations Locales (Supabase)\n\n";
      markdownContent += "Généré le : " + new Date().toLocaleString("fr-FR") + "\n\n";
      markdownContent += "| ID | Source | Type Relation | Cible | Est Vrai | Statut |\n";
      markdownContent += "|---|---|---|---|---|---|\n";

      relations.forEach(rel => {
        let vraiFaux = "Faux";
        if (rel.est_vrai === "maybe") {
          vraiFaux = "Peut-être";
        } else if (rel.est_vrai === true || rel.est_vrai === "true") {
          vraiFaux = "Vrai";
        }
        markdownContent += `| ${rel.id} | ${rel.terme_source} | ${rel.type_relation} | ${rel.terme_cible} | ${vraiFaux} | ${rel.statut} |\n`;
      });

      const exportPath = path.join(process.cwd(), "logs", "relations_export.md");

      if (!fs.existsSync(path.dirname(exportPath))) {
        fs.mkdirSync(path.dirname(exportPath), { recursive: true });
      }

      fs.writeFileSync(exportPath, markdownContent, "utf8");

      const attachment = new AttachmentBuilder(exportPath, { name: "relations_locales.md" });

      await interaction.editReply({
        content: `✅ Voici l'export de toutes les relations stockées localement (${relations.length} relations).`,
        files: [attachment]
      });
    } catch (error) {
      console.error("Erreur lors de l'export:", error);
      if (error.code === 10062) return;
      await interaction.editReply({ content: "Erreur lors de la génération de l'export: " + error.message });
    }
  }
};
