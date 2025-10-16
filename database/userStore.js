const fs = require("fs");
const crypto = require("crypto");

const FILE_PATH = "./database/users.json"; // Pastikan path benar
const SECRET_KEY = crypto.createHash("sha256").update("XERX_SECRET").digest();

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", SECRET_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

function decrypt(encryptedText) {
  try {
    const [ivHex, dataHex] = encryptedText.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const encrypted = Buffer.from(dataHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", SECRET_KEY, iv);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8");
  } catch (e) {
    console.error("❌ Gagal dekripsi:", e);
    return "[]"; // Return empty array jika gagal
  }
}

function getUsers() {
  try {
    if (!fs.existsSync(FILE_PATH)) return [];
    const raw = fs.readFileSync(FILE_PATH, "utf8");
    if (!raw.trim()) return [];
    const jsonString = decrypt(raw);
    return JSON.parse(jsonString);
  } catch (e) {
    console.error("❌ Gagal baca users:", e);
    return [];
  }
}

function saveUsers(users) {
  try {
    const jsonString = JSON.stringify(users, null, 2);
    const encrypted = encrypt(jsonString);
    fs.writeFileSync(FILE_PATH, encrypted, "utf8");
  } catch (e) {
    console.error("❌ Gagal simpan users:", e);
  }
}

module.exports = { getUsers, saveUsers };