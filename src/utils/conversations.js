// Stocke l'historique de conversation de chaque utilisateur (ID Discord → messages)
const conversations = new Map();
const topicMemory = new Map();

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

function setTopic(userId, topic) {
  if (!topic) return;
  topicMemory.set(userId, {
    topic,
    updatedAt: Date.now()
  });
}

function getTopic(userId) {
  const entry = topicMemory.get(userId);
  if (!entry) return null;

  // expirer apres 15 mins
  if (Date.now() - entry.updatedAt > 15 * 60 * 1000) {
    topicMemory.delete(userId);
    return null;
  }

  return entry.topic;
}

function clearTopic(userId) {
  topicMemory.delete(userId);
}

export default {
  addMessage,
  getHistory,
  setTopic,
  getTopic,
  clearTopic
};
