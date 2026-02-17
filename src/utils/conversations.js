// Stocke l'historique de conversation de chaque utilisateur (ID Discord → messages)
const conversations = new Map();

// Ajoute un message à l'historique d'un utilisateur
// Limite à 5 messages pour contrôler les coûts API et éviter d'exploser le contexte
function addMessage(userId, role, content) {
  if (!conversations.has(userId)) conversations.set(userId, []);
  const history = conversations.get(userId);
  history.push({ role, content });
  if (history.length > 5) history.shift();
}

// Retourne une copie de l'historique (évite les modifications directes)
function getHistory(userId) {
  const history = conversations.get(userId);
  return history ? history.map(({ role, content }) => ({ role, content })) : [];
}

export default { addMessage, getHistory };
