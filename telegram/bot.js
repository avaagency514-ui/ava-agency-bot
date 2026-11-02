const TelegramBot = require('node-telegram-bot-api');
const { getAvailableProfiles, getFileForProfile } = require('../services/drive');
const { processFile } = require('../services/metachanger');
const { generateUniqueText } = require('../services/gemini');
const { getRandomTextFromSheet, getRandomTextFromCustomSheet } = require('../services/sheets');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const CONTENT_LABELS = {
  reels:  { emoji: '🎬', label: 'Reels', color: 0x00ff88 },
  banger: { emoji: '🔥', label: 'Banger', color: 0xff4400 },
  post:   { emoji: '🖼️', label: 'Post', color: 0x00aaff },
  pp:     { emoji: '👤', label: 'Photo de Profil', color: 0x9b59b6 },
  cta:    { emoji: '🔗', label: 'CTA', color: 0xf39c12 },
  sms:    { emoji: '📱', label: 'SMS', color: 0xe74c3c },
  textbio: { emoji: '📝', label: 'Bio', color: 0x3498db, col: 'A' },
  textstorycta: { emoji: '📣', label: 'Story CTA', color: 0x3498db, col: 'B' },
  textprofil: { emoji: '👤', label: 'Profil Texte', color: 0x3498db, col: 'C' },
  followfr: { emoji: '🇫🇷', label: 'Follow FR', color: 0x3498db },
  followus: { emoji: '🇺🇸', label: 'Follow US', color: 0xe74c3c },
  captionreel: { emoji: '✍️', label: 'Caption Reel', color: 0x3498db, customSheetUS: '1Tp2SUaSfwzzaIJma2hu4jk9oT5tUsLTECtLV57uH9zE', customSheetFR: '1odXnj8m9VY2g-GgT8xV2gbLJEgjnoVU__xfwANYa4dU', customTabUS: 'Threads', customTabFR: null, colUS: 'E', colFR: 'E' },
  legendsthreads: { emoji: '🧵', label: 'Legends Threads', color: 0x3498db, customSheetUS: '1Tp2SUaSfwzzaIJma2hu4jk9oT5tUsLTECtLV57uH9zE', customSheetFR: '1odXnj8m9VY2g-GgT8xV2gbLJEgjnoVU__xfwANYa4dU', customTabUS: 'Threads', customTabFR: null, colUS: 'D', colFR: 'D' },
};

const userStates = {};
const activePollings = {};

function startTelegramBot(discordClient) {
  const token = process.env.TELEGRAM_TOKEN;
  if (!token) {
    console.warn("⚠️ TELEGRAM_TOKEN manquant. Bot Telegram désactivé.");
    return;
  }

  const bot = new TelegramBot(token, { polling: true });
  const { vaQueries } = require('../database/db');

  console.log("✅ Bot Telegram initialisé.");

  async function getUserAccess(chatId) {
    const founderId = process.env.TELEGRAM_FOUNDER_ID;
    if (founderId && chatId.toString() === founderId) {
      return { isFounder: true, va: null };
    }
    const va = vaQueries.getByTelegramId.get(chatId.toString());
    if (va && va.statut === 'actif') {
      return { isFounder: false, va: va };
    }
    return null; // Pas d'accès
  }

  bot.onText(/\/connect (\d+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const code = match[1];
    const telegramCodes = require('../services/telegramCodes');
    
    if (telegramCodes.has(code)) {
      const vaId = telegramCodes.get(code);
      vaQueries.linkTelegram.run(chatId.toString(), vaId);
      telegramCodes.delete(code);
      const va = vaQueries.getById.get(vaId);
      bot.sendMessage(chatId, `✅ Compte Telegram lié avec succès au VA **${va.username}** ! Tape /start pour commencer.`, { parse_mode: 'Markdown' });
    } else {
      bot.sendMessage(chatId, "❌ Code invalide ou expiré.");
    }
  });

  bot.onText(/\/start/, async (msg) => {
    const access = await getUserAccess(msg.chat.id);
    if (!access) return bot.sendMessage(msg.chat.id, "❌ Accès refusé. Tu n'es pas connecté.\nGénère un code de connexion depuis Discord via le bouton '🔗 Telegram', puis tape `/connect <code_ici>`.", { parse_mode: 'Markdown' });
    sendMainMenu(msg.chat.id, access);
  });
  
  bot.onText(/\/content/, async (msg) => {
    const access = await getUserAccess(msg.chat.id);
    if (!access) return;
    sendMainMenu(msg.chat.id, access);
  });

  bot.onText(/\/me/, (msg) => {
    bot.sendMessage(msg.chat.id, `Ton ID Telegram est : \`${msg.chat.id}\`\n\n*(S'il s'agit du compte Fondateur, tu peux copier cet ID et le mettre dans le fichier .env sous TELEGRAM_FOUNDER_ID=*`, { parse_mode: 'Markdown' });
  });

  function sendMainMenu(chatId, access) {
    const isFounder = access.isFounder;
    const greeting = isFounder ? "👑 *Mode Fondateur*" : `👋 *Bienvenue ${access.va.username}*`;

    const options = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🎬 Reels', callback_data: 'menu_reels' },
            { text: '🔥 Banger', callback_data: 'menu_banger' },
            { text: '🖼️ Post', callback_data: 'menu_post' }
          ],
          [
            { text: '👤 PP', callback_data: 'menu_pp' },
            { text: '🔗 CTA', callback_data: 'menu_cta' },
            { text: '📱 SMS', callback_data: 'menu_sms' }
          ],
          [
            { text: '📝 Bio', callback_data: 'text_textbio' },
            { text: '📣 Story CTA', callback_data: 'text_textstorycta' },
            { text: '👤 Profil Texte', callback_data: 'text_textprofil' }
          ],
          [
            { text: '🇫🇷 Follow FR', callback_data: 'menu_followfr' },
            { text: '🇺🇸 Follow US', callback_data: 'menu_followus' }
          ],
          [
            { text: '🧵 Legends Threads', callback_data: 'customtext_legendsthreads' },
            { text: '✍️ Caption Reel', callback_data: 'customtext_captionreel' }
          ],
          [
            { text: '➕ Ajouter un compte IG (Sheet)', callback_data: 'add_acc_start' }
          ]
        ]
      }
    };
    bot.sendMessage(chatId, `${greeting}\n\n🎬 *Content Factory — V2*\nClique sur un bouton pour générer du contenu ou gérer les comptes.`, { parse_mode: 'Markdown', ...options });
  }

  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    
    bot.answerCallbackQuery(query.id);

    try {
      const access = await getUserAccess(chatId);
      if (!access) return bot.sendMessage(chatId, "❌ Accès refusé. Tu n'es pas connecté.");

      if (data.startsWith('menu_')) {
        const type = data.replace('menu_', '');
        
        if (type === 'sms') {
           const { getBalance } = require('../services/smspool');
           try {
             const balance = await getBalance();
             const balText = balance ? balance.balance : 'N/A';
             bot.sendMessage(chatId, `📱 *SMSPool — Instagram*\nSolde actuel : ${balText}$\n\nClique ci-dessous pour obtenir un numéro temporaire.`, {
               parse_mode: 'Markdown',
               reply_markup: {
                 inline_keyboard: [[{ text: '📱 Obtenir un numéro IG', callback_data: 'smspool_get_number' }]]
               }
             });
           } catch (err) {
             bot.sendMessage(chatId, `❌ Erreur de récupération du solde : ${err.message}`);
           }
           return;
        }

        if (type === 'banger') {
          sendQtyMenu(chatId, type, type);
          return;
        }

        if (type === 'followfr' || type === 'followus') {
          await processMediaRequest(chatId, type, type, 5, discordClient);
          return;
        }

        let profiles = await getAvailableProfiles();

        const idOptions = profiles.length > 0 ? profiles : ['ID 1'];
        const limitedProfiles = idOptions.slice(0, 96); 
        
        let inlineKeyboard = [];
        let currentRow = [];
        limitedProfiles.forEach((prof, idx) => {
           currentRow.push({ text: prof, callback_data: `profile_${type}_${prof}` });
           if (currentRow.length === 4 || idx === limitedProfiles.length - 1) {
             inlineKeyboard.push(currentRow);
             currentRow = [];
           }
        });

        const roleText = access.isFounder ? "👑 *Mode Fondateur*" : `👨‍💻 *VA : ${access.va.username}*`;
        bot.sendMessage(chatId, `${roleText} — *${CONTENT_LABELS[type].label}*\nSélectionne le Profile ID :`, {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: inlineKeyboard }
        });

      } else if (data === 'smspool_get_number') {
        const { getTemporaryNumber, checkSMS } = require('../services/smspool');
        const statusMsg = await bot.sendMessage(chatId, "⏳ Demande de numéro en cours...");
        try {
          const result = await getTemporaryNumber('457', '1');
          
          if (!result.success || result.data.success === 0) {
             const errorMsg = result.data ? result.data.message : result.error;
             throw new Error(errorMsg || "Erreur API SMSPool");
          }
          
          const numberData = result.data;
          const order_id = numberData.order_id;
          const phonenumber = numberData.phonenumber;
          
          bot.editMessageText(`📱 *Numéro obtenu !*\n\nNuméro : \`+1${phonenumber}\`\n\n*(Je vérifie l'arrivée du SMS automatiquement toutes les 5 secondes...)*`, {
            chat_id: chatId,
            message_id: statusMsg.message_id,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '❌ Annuler / Rembourser', callback_data: `smspool_cancel_${order_id}` }]
              ]
            }
          });

          // Auto-polling
          let attempts = 0;
          const maxAttempts = 120; // 10 minutes max
          const pollInterval = setInterval(async () => {
            attempts++;
            try {
              const checkRes = await checkSMS(order_id);
              if (checkRes.success) {
                const status = parseInt(checkRes.data.status);
                if (status === 3) {
                  clearInterval(pollInterval);
                  delete activePollings[order_id];
                  bot.sendMessage(chatId, `✅ *SMS REÇU !*\n\nNuméro : \`+1${phonenumber}\`\nCode : \`${checkRes.data.sms}\``, { parse_mode: 'Markdown' });
                } else if (status === 6) { // Canceled/Refunded
                  clearInterval(pollInterval);
                  delete activePollings[order_id];
                }
              }
            } catch (err) {
              // ignore transient errors
            }

            if (attempts >= maxAttempts) {
              clearInterval(pollInterval);
              delete activePollings[order_id];
              bot.sendMessage(chatId, `❌ **Délai expiré** (10 min) pour le numéro \`+1${phonenumber}\`. Arrêt de la vérification automatique.`, { parse_mode: 'Markdown' });
            }
          }, 5000);
          
          activePollings[order_id] = pollInterval;

        } catch (err) {
          bot.editMessageText(`❌ Erreur : ${err.message}`, { chat_id: chatId, message_id: statusMsg.message_id });
        }

      } else if (data.startsWith('smspool_check_')) {
        const orderId = data.replace('smspool_check_', '');
        const { checkSMS } = require('../services/smspool');
        try {
          const checkRes = await checkSMS(orderId);
          if (!checkRes.success) throw new Error(checkRes.error);
          
          const status = parseInt(checkRes.data.status);
          
          if (status === 1) {
            bot.sendMessage(chatId, `⏳ *En attente du SMS...*\nAucun code reçu pour le moment. Réessaie dans quelques secondes. (Commande: ${orderId})`, { parse_mode: 'Markdown' });
          } else if (status === 3) {
            bot.sendMessage(chatId, `✅ *SMS REÇU !*\n\nCode : \`${checkRes.data.sms}\`\n\n(Commande: ${orderId})`, { parse_mode: 'Markdown' });
          } else {
            bot.sendMessage(chatId, `ℹ️ Statut inconnu ou expiré (Statut: ${status}).`);
          }
        } catch(err) {
          bot.sendMessage(chatId, `❌ Erreur vérification : ${err.message}`);
        }

      } else if (data.startsWith('smspool_cancel_')) {
        const orderId = data.replace('smspool_cancel_', '');
        
        if (activePollings[orderId]) {
          clearInterval(activePollings[orderId]);
          delete activePollings[orderId];
        }

        const { cancelSMS } = require('../services/smspool');
        try {
          const cancelRes = await cancelSMS(orderId);
          if (!cancelRes.success) {
            const match = cancelRes.error && cancelRes.error.match(/try again in (\d+)\s*seconds?/i);
            if (match) {
              const waitSeconds = parseInt(match[1], 10);
              bot.sendMessage(chatId, `⏳ *Remboursement programmé !*\nL'API SMSPool impose un délai de sécurité de **${waitSeconds}s**.\n\nLe bot va automatiquement annuler et rembourser la commande dans ${waitSeconds} secondes.`, { parse_mode: 'Markdown' });
              
              setTimeout(async () => {
                try {
                  const autoRes = await cancelSMS(orderId);
                  if (autoRes.success && autoRes.data && autoRes.data.success === 1) {
                    bot.sendMessage(chatId, `✅ *Remboursement validé !*\nLa commande SMSPool \`${orderId}\` a été annulée et remboursée avec succès.`, { parse_mode: 'Markdown' });
                  } else {
                    setTimeout(async () => {
                      const retry2 = await cancelSMS(orderId);
                      if (retry2.success && retry2.data && retry2.data.success === 1) {
                        bot.sendMessage(chatId, `✅ *Remboursement validé !*\nLa commande SMSPool \`${orderId}\` a été annulée et remboursée avec succès.`, { parse_mode: 'Markdown' });
                      }
                    }, 5000);
                  }
                } catch(e) {}
              }, (waitSeconds + 2) * 1000);
              return;
            }
            throw new Error(cancelRes.error);
          }
          
          if (cancelRes.data.success === 1) {
            bot.sendMessage(chatId, `✅ Commande annulée et remboursée avec succès. (Commande: ${orderId})`);
          } else {
            bot.sendMessage(chatId, `❌ Impossible d'annuler : ${cancelRes.data.message || 'Erreur inconnue'}`);
          }
        } catch(err) {
          bot.sendMessage(chatId, `❌ Erreur annulation : ${err.message}`);
        }

      } else if (data.startsWith('profile_')) {
        const parts = data.split('_');
        const type = parts[1];
        const profileId = parts.slice(2).join('_');
        
        sendQtyMenu(chatId, type, profileId);

      } else if (data.startsWith('qty_')) {
        const prefix = `qty_`;
        const rest = data.slice(prefix.length);
        const firstUnderscore = rest.indexOf('_');
        const type = rest.slice(0, firstUnderscore);
        
        const afterType = rest.slice(firstUnderscore + 1);
        const lastUnderscore = afterType.lastIndexOf('_');
        const profileId = afterType.slice(0, lastUnderscore);
        const qty = parseInt(afterType.slice(lastUnderscore + 1));

        await processMediaRequest(chatId, type, profileId, qty, discordClient);

      } else if (data === 'add_acc_start') {
        bot.sendMessage(chatId, "Ajout de compte. Quel est le marché ?", {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🇫🇷 FR', callback_data: 'add_acc_market_FR' }, { text: '🇺🇸 US', callback_data: 'add_acc_market_US' }]
            ]
          }
        });

      } else if (data.startsWith('add_acc_market_')) {
        const market = data.replace('add_acc_market_', '');
        userStates[chatId] = { step: 'pseudo', data: { marche: market } };
        bot.sendMessage(chatId, "Quel est le **Pseudo Instagram** ? (Tape le nom dans le chat)", { parse_mode: 'Markdown' });

      } else if (data.startsWith('add_acc_profile_')) {
        const profileId = data.replace('add_acc_profile_', '');
        if (!userStates[chatId] || userStates[chatId].step !== 'profile_id') {
           return bot.sendMessage(chatId, "❌ Session expirée ou invalide.");
        }
        
        userStates[chatId].data.profileId = profileId;
        const d = userStates[chatId].data;
        
        const { appendAccountToSheet } = require('../services/sheets');
        const cleanUsername = d.pseudo.replace(/[^a-zA-Z0-9]/g, '');
        const lienInsta = `https://linky.fans/${cleanUsername}`;
        
        const { getFolderIdByName } = require('../services/drive');
        let driveUrl = '';
        try {
          const rootId = process.env.GOOGLE_DRIVE_FOLDER || '1teZ84s4rxBgSEKtADegvsQo61FCd7nRu';
          const profFolderId = await Promise.race([
            getFolderIdByName(rootId, d.profileId),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
          ]);
          if (profFolderId) {
            driveUrl = `https://drive.google.com/drive/folders/${profFolderId}?usp=drive_link`;
          }
        } catch (e) {
          console.warn('⚠️ Lien Drive non récupéré:', e.message);
        }

        bot.sendMessage(chatId, "📝 Enregistrement en cours...");
        
        await appendAccountToSheet([
          d.marche,             // A: Marché
          "Pause",              // B: Statut
          d.pseudo,             // C: Pseudo
          d.password || '',     // D: Mot de passe
          d.email || '',        // E: Mail/Numéro
          d.twofa || '',        // F: 2FA
          '',                   // G: API
          d.profileId,          // H: ID Dossier
          driveUrl,             // I: Drive
          lienInsta,            // J: Lien Insta
          (d.email && d.email.includes('@')) ? d.email : '', // K: Mohmal
          d.password || '',     // L: MP
          access && !access.isFounder && access.va ? access.va.username : 'Fondateur' // M: Nom VA
        ]);
        
        delete userStates[chatId];
        const msgText = `✅ Le compte <b>${d.pseudo}</b> a bien été ajouté avec l'ID <b>${d.profileId}</b> !\n\n🔗 <b>Lien Insta :</b> ${lienInsta}`;
        bot.sendMessage(chatId, msgText, { parse_mode: 'HTML', disable_web_page_preview: true }).catch(err => console.error("Erreur sendMessage telegram:", err));

      } else if (data.startsWith('text_')) {
        const type = data.replace('text_', '');
        await processTextRequest(chatId, type);
      } else if (data.startsWith('customtext_')) {
        const type = data.replace('customtext_', '');
        await processCustomTextRequest(chatId, type);
      }

    } catch (err) {
      console.error(err);
      bot.sendMessage(chatId, `❌ Erreur : ${err.message}`);
    }
  });

  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (!msg.text || msg.text.startsWith('/')) return;

    if (userStates[chatId]) {
      const state = userStates[chatId];
      const text = msg.text === '0' || msg.text === '-' ? '' : msg.text;

      if (state.step === 'pseudo') {
        state.data.pseudo = text;
        state.step = 'password';
        bot.sendMessage(chatId, "Quel est le **Mot de passe** ?\n*(Envoie '0' pour ignorer)*", { parse_mode: 'Markdown' });
      } 
      else if (state.step === 'password') {
        state.data.password = text;
        state.step = 'email';
        bot.sendMessage(chatId, "Quel est le **Mail ou Numéro** ?\n*(Envoie '0' pour ignorer)*", { parse_mode: 'Markdown' });
      }
      else if (state.step === 'email') {
        state.data.email = text;
        state.step = 'twofa';
        bot.sendMessage(chatId, "Quelle est la **Clé 2FA** ?\n*(Envoie '0' pour ignorer)*", { parse_mode: 'Markdown' });
      }
      else if (state.step === 'twofa') {
        // Accepter '0' pour ignorer, ou valider le format Base32 TOTP
        const is2faSkip = text.trim() === '0';
        const is2faValid = /^([A-Z2-7]{4}\s){7}[A-Z2-7]{4}$/i.test(text.trim());

        if (!is2faSkip && !is2faValid) {
          return bot.sendMessage(chatId,
            "❌ **Clé 2FA invalide.**\n\nLe format attendu est :\n`XXXX XXXX XXXX XXXX XXXX XXXX XXXX XXXX`\n_(8 groupes de 4 lettres/chiffres séparés par des espaces)_\n\nEnvoie `0` pour ignorer.",
            { parse_mode: 'Markdown' }
          );
        }

        state.data.twofa = is2faSkip ? '' : text.trim();
        state.step = 'profile_id';
        
        const { getAvailableProfiles } = require('../services/drive');
        const profiles = await getAvailableProfiles();
        const idOptions = profiles.length > 0 ? profiles : ['ID 1'];
        const limitedProfiles = idOptions.slice(0, 96); 
        
        let inlineKeyboard = [];
        let currentRow = [];
        limitedProfiles.forEach((prof, idx) => {
           currentRow.push({ text: prof, callback_data: `add_acc_profile_${prof}` });
           if (currentRow.length === 4 || idx === limitedProfiles.length - 1) {
             inlineKeyboard.push(currentRow);
             currentRow = [];
           }
        });

        bot.sendMessage(chatId, "Choisis l'**ID Dossier** ci-dessous :", {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: inlineKeyboard }
        });
      }
    }
  });

  function sendQtyMenu(chatId, type, profileId) {
    const meta = CONTENT_LABELS[type];
    bot.sendMessage(chatId, `${meta.emoji} *Demande de ${meta.label}*\nCombien de fichiers veux-tu générer pour ${profileId} ?`, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '1', callback_data: `qty_${type}_${profileId}_1` },
            { text: '2', callback_data: `qty_${type}_${profileId}_2` },
            { text: '3', callback_data: `qty_${type}_${profileId}_3` }
          ],
          [
            { text: '4', callback_data: `qty_${type}_${profileId}_4` },
            { text: '5', callback_data: `qty_${type}_${profileId}_5` }
          ]
        ]
      }
    });
  }

  async function processMediaRequest(chatId, type, profileId, qty, discordClient) {
    const meta = CONTENT_LABELS[type];
    
    if (type === 'followfr' || type === 'followus') {
      try {
        const statusMsg = await bot.sendMessage(chatId, `⏳ Récupération de ${qty} compte(s) à follow...`);
        const sourceChannelId = type === 'followfr' ? '1527604156968472758' : '1527606264803364864';
        const channel = await discordClient.channels.fetch(sourceChannelId).catch(() => null);
        if (!channel) throw new Error(`Salon ${meta.label} introuvable sur Discord.`);

        const messages = await channel.messages.fetch({ limit: 100 });
        const allFootballers = new Set();
        const allModels = new Set();
        
        const atRegex = /\@([a-zA-Z0-9_.]+)/g;
        const dashRegex = /^-\s+([a-zA-Z0-9_.]+)/gm;
        const plainRegex = /^([a-zA-Z0-9_.]+)\s*$/gm;

        messages.forEach(msg => {
          const text = msg.content;
          let match;
          let hasFormatted = false;
          
          while ((match = atRegex.exec(text)) !== null) { allFootballers.add(match[1]); hasFormatted = true; }
          while ((match = dashRegex.exec(text)) !== null) { allFootballers.add(match[1]); hasFormatted = true; }
          
          if (!hasFormatted) {
            while ((match = plainRegex.exec(text)) !== null) {
              const u = match[1];
              if (u.length > 2) allModels.add(u);
            }
          }
        });

        const arrFoot = Array.from(allFootballers);
        const arrModels = Array.from(allModels);

        if (arrFoot.length === 0 && arrModels.length === 0) {
          throw new Error(`Aucun pseudo trouvé dans le salon ${meta.label}.`);
        }

        // Calcul des cibles : 3 foot / 2 modèles si qty = 5
        let targetFoot = Math.ceil(qty * 0.6);
        let targetModels = qty - targetFoot;

        // Compensation si un des deux stocks est trop bas
        if (arrFoot.length < targetFoot) {
          targetModels += (targetFoot - arrFoot.length);
          targetFoot = arrFoot.length;
        }
        if (arrModels.length < targetModels) {
          targetFoot += (targetModels - arrModels.length);
          targetModels = arrModels.length;
        }

        const picked = [];
        for (let i = 0; i < targetFoot; i++) {
          if (arrFoot.length === 0) break;
          const idx = Math.floor(Math.random() * arrFoot.length);
          picked.push(arrFoot[idx]);
          arrFoot.splice(idx, 1);
        }
        for (let i = 0; i < targetModels; i++) {
          if (arrModels.length === 0) break;
          const idx = Math.floor(Math.random() * arrModels.length);
          picked.push(arrModels[idx]);
          arrModels.splice(idx, 1);
        }

        picked.sort(() => Math.random() - 0.5);

        const listText = picked.map(u => `• \`${u}\``).join('\n');
        bot.editMessageText(`${meta.emoji} *Comptes à follow (${meta.label})*\n\nVoici ${picked.length} compte(s) Instagram à suivre :\n\n${listText}`, {
          chat_id: chatId,
          message_id: statusMsg.message_id,
          parse_mode: 'Markdown'
        });
      } catch (err) {
        bot.sendMessage(chatId, `❌ Erreur Follow : ${err.message}`);
      }
      return;
    }

    const statusMsg = await bot.sendMessage(chatId, `⏳ Traitement de ${qty} ${meta.label} en cours...`);
    
    try {
      let stockRestant = 0;
      let processedFiles = [];

      for (let i = 0; i < qty; i++) {
        let localPath = null;
        let isVideo = false;

        if (type === 'banger') {
          const channelBanger = process.env.CHANNEL_BANGER;
          const channel = await discordClient.channels.fetch(channelBanger).catch(() => null);
          if (!channel) throw new Error("Salon Banger introuvable sur Discord.");
          
          const messages = await channel.messages.fetch({ limit: 50 });
          const msgsWithAttachments = messages.filter(m => m.attachments.size > 0);
          if (msgsWithAttachments.size === 0) throw new Error(`Aucun fichier disponible dans le salon dédié ${meta.label}.`);
          
          const randomMsg = msgsWithAttachments.random();
          const attachment = randomMsg.attachments.first();
          stockRestant = msgsWithAttachments.size - 1;
          isVideo = attachment.contentType && attachment.contentType.startsWith('video');

          const tempDir = path.join(__dirname, '../temp');
          if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
          localPath = path.join(tempDir, `${Date.now()}_${attachment.name}`);
          
          const response = await axios({ url: attachment.url, method: 'GET', responseType: 'stream' });
          const writer = fs.createWriteStream(localPath);
          response.data.pipe(writer);
          await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
          });
        } else {
          const driveData = await getFileForProfile(type, profileId, 'FR');
          stockRestant = driveData.stockRestant;
          localPath = driveData.localPath;
          isVideo = ['reels'].includes(type);
        }

        const processedPath = await processFile(localPath, path.dirname(localPath), isVideo);
        processedFiles.push(processedPath);

        if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
      }

      for (const p of processedFiles) {
        if (p.endsWith('.mp4') || p.endsWith('.mov')) {
          await bot.sendVideo(chatId, p, { caption: `${meta.emoji} ${meta.label} - Stock restant: ${stockRestant}` });
        } else {
          await bot.sendPhoto(chatId, p, { caption: `${meta.emoji} ${meta.label} - Stock restant: ${stockRestant}` });
        }
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
      
      bot.deleteMessage(chatId, statusMsg.message_id).catch(()=>{});

    } catch (err) {
      bot.editMessageText(`❌ Erreur : ${err.message}`, { chat_id: chatId, message_id: statusMsg.message_id });
    }
  }

  async function processCustomTextRequest(chatId, type) {
    const meta = CONTENT_LABELS[type];
    const statusMsg = await bot.sendMessage(chatId, `⏳ Récupération de ${meta.label}...`);
    
    try {
      const access = await getUserAccess(chatId);
      let market = 'FR';
      if (access && access.va && (access.va.channel_id === process.env.CHANNEL_CONTENT_US || access.va.channel_id === process.env.CHANNEL_CONTENT_US_MOBILE)) {
        market = 'US';
      }

      const sheetId = market === 'US' ? meta.customSheetUS : meta.customSheetFR;
      const tabName = market === 'US' ? meta.customTabUS : meta.customTabFR;
      const col = market === 'US' ? meta.colUS : meta.colFR;

      const rawText = await getRandomTextFromCustomSheet(sheetId, tabName, col);
      
      bot.editMessageText(`${meta.emoji} *Ton texte ${meta.label}*\n\n\`\`\`\n${rawText}\n\`\`\``, {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: 'Markdown'
      });
    } catch (err) {
      bot.editMessageText(`❌ Erreur : ${err.message}`, { chat_id: chatId, message_id: statusMsg.message_id });
    }
  }

  async function processTextRequest(chatId, type) {
    const meta = CONTENT_LABELS[type];
    const statusMsg = await bot.sendMessage(chatId, `⏳ Génération du texte ${meta.label}...`);
    
    try {
      const access = await getUserAccess(chatId);
      let market = 'FR';
      if (access && access.va && (access.va.channel_id === process.env.CHANNEL_CONTENT_US || access.va.channel_id === process.env.CHANNEL_CONTENT_US_MOBILE)) {
        market = 'US';
      }

      const baseText = await getRandomTextFromSheet(market, meta.col);
      const uniqueText = await generateUniqueText(baseText, meta.label, market);
      
      bot.editMessageText(`${meta.emoji} *Ton texte ${meta.label} unique*\n\n\`\`\`\n${uniqueText}\n\`\`\``, {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: 'Markdown'
      });
    } catch (err) {
      bot.editMessageText(`❌ Erreur : ${err.message}`, { chat_id: chatId, message_id: statusMsg.message_id });
    }
  }
}

module.exports = { startTelegramBot };
