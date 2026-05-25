import fs from "fs";
import path from "path";
import { AttachmentBuilder } from "discord.js";

export default {
  command: {
    name: "log",
    description: "Lit le dernier fichier de log ou le nième dernier log",
    options: [
      {
        name: "n",
        type: 4,
        description: "Indice du log depuis le plus récent (1 = dernier)",
        required: false,
        min_value: 1,
      },
    ],
  },
  adminOnly: true,
  async execute(interaction) {
    try {
      await interaction.deferReply();
    } catch (err) {
      if (err.code === 10062) return;
      throw err;
    }

    const n = interaction.options.getInteger("n") || 1;
    const logsDir = path.join(process.cwd(), "logs");

    try {
      const dirents = await fs.promises.readdir(logsDir, { withFileTypes: true });
      const logFiles = [];

      for (const dirent of dirents) {
        if (!dirent.isFile()) continue;
        if (!dirent.name.endsWith(".md")) continue;
        const filePath = path.join(logsDir, dirent.name);
        const stats = await fs.promises.stat(filePath);
        logFiles.push({ name: dirent.name, path: filePath, mtime: stats.mtime.getTime() });
      }

      if (logFiles.length === 0) {
        await interaction.editReply({ content: "Aucun fichier de log trouvé dans le dossier logs/." });
        return;
      }

      logFiles.sort((a, b) => b.mtime - a.mtime);

      if (n < 1 || n > logFiles.length) {
        await interaction.editReply({ content: `Indice invalide. Il y a ${logFiles.length} fichiers de log, choisissez un nombre entre 1 et ${logFiles.length}.` });
        return;
      }

      const targetLog = logFiles[n - 1];
      const logContent = await fs.promises.readFile(targetLog.path, "utf8");
      const attachmentName = `log_${targetLog.name}`;

      if (logContent.length <= 1800) {
        await interaction.editReply({ content: `Fichier ${targetLog.name} (nième dernier n=${n}) :\n\n${logContent}` });
        return;
      }

      const attachment = new AttachmentBuilder(Buffer.from(logContent, "utf8"), { name: attachmentName });
      await interaction.editReply({ content: `Voici le ${n}${n === 1 ? "er" : "ème"} dernier fichier de log : ${targetLog.name}`, files: [attachment] });
    } catch (error) {
      console.error("Erreur lecture log:", error);
      if (error.code === "ENOENT") {
        await interaction.editReply({ content: "Le dossier de logs n'existe pas ou n'est pas accessible." });
        return;
      }
      await interaction.editReply({ content: "Erreur lors de la lecture du log : " + error.message });
    }
  }
};
