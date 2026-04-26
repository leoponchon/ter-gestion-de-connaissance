import fs from 'fs';
import path from 'path';

const LOG_DIR = path.join(process.cwd(), 'logs');

// S'assurer que le dossier logs existe
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

export function logSession(userId, userName, userMessage, botResponse, topic) {
  const date = new Date();
  // Formatage de la date YYYY-MM-DD pour le nom du fichier
  const dateString = date.toISOString().split('T')[0];
  const fileName = `session_${dateString}.md`;
  const filePath = path.join(LOG_DIR, fileName);

  // Formatage de l'heure HH:MM:SS
  const timeString = date.toLocaleTimeString('fr-FR');

  const logEntry = `
### [${timeString}] - Utilisateur : ${userName} (${userId})
*   **Requête :** "${userMessage}"
*   **Sujet détecté :** ${topic ? `"${topic}"` : '*Aucun*'}
*   **Réponse Bot :**
> ${botResponse.replace(/\n/g, '\n> ')}

---
`;

  try {
    fs.appendFileSync(filePath, logEntry, 'utf8');
  } catch (error) {
    console.error("[LOGGER] Erreur lors de l'écriture des logs :", error.message);
  }
}
