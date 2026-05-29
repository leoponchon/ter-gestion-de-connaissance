import fs from "fs";
import path from "path";

const dataDir = path.join(process.cwd(), "src", "data");
const channelsFile = path.join(dataDir, "allowedChannels.json");

async function ensureFileExists() {
  try {
    await fs.promises.mkdir(dataDir, { recursive: true });
    if (!fs.existsSync(channelsFile)) {
      await fs.promises.writeFile(channelsFile, "[]", "utf8");
    }
  } catch (error) {
    console.error("Erreur lors de la création du fichier de salons autorisés :", error);
    throw error;
  }
}

async function loadChannels() {
  try {
    await ensureFileExists();
    const raw = await fs.promises.readFile(channelsFile, "utf8");
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return [...new Set(data.map((id) => String(id)))];
  } catch (error) {
    console.error("Impossible de charger la liste des salons autorisés :", error);
    return [];
  }
}

async function saveChannels(channelIds) {
  const normalized = [...new Set(channelIds.map((id) => String(id)))];
  await ensureFileExists();
  await fs.promises.writeFile(channelsFile, JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}

async function listChannels() {
  return await loadChannels();
}

async function addChannel(channelId) {
  const channels = await loadChannels();
  const normalizedId = String(channelId);
  if (channels.includes(normalizedId)) {
    return { success: true, alreadyExists: true, channels };
  }
  channels.push(normalizedId);
  const saved = await saveChannels(channels);
  return { success: true, alreadyExists: false, channels: saved };
}

async function removeChannel(channelId) {
  const channels = await loadChannels();
  const normalizedId = String(channelId);
  if (!channels.includes(normalizedId)) {
    return { success: true, removed: false, channels };
  }
  const updated = channels.filter((id) => id !== normalizedId);
  const saved = await saveChannels(updated);
  return { success: true, removed: true, channels: saved };
}

async function isAllowed(channelId) {
  const channels = await loadChannels();
  return channels.includes(String(channelId));
}

export default {
  listChannels,
  addChannel,
  removeChannel,
  isAllowed,
};
