import { supabase } from "./supabase.js";

async function listAdmins() {
  try {
    const { data, error } = await supabase.from("admins").select("discord_id");
    if (error) throw error;
    return (data || []).map(r => String(r.discord_id));
  } catch (err) {
    
    const env = process.env.ADMIN_IDS || "";
    return env.split(",").map(s => s.trim()).filter(Boolean);
  }
}

async function isAdmin(discordId) {
  const admins = await listAdmins();
  return admins.includes(String(discordId));
}

async function addAdmin(discordId) {
  try {
    const { error } = await supabase.from("admins").insert([{ discord_id: String(discordId) }]);
    if (error) {
      
      if (error.code && error.code === "23505") return { success: true };
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function removeAdmin(discordId) {
  try {
    const { error } = await supabase.from("admins").delete().eq("discord_id", String(discordId));
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export default {
  listAdmins,
  isAdmin,
  addAdmin,
  removeAdmin,
};
