/**
 * services/comptaService.js
 * Gestion comptable et financière complète pour AVA Agency :
 * - Dépenses automatisées VAs (Subs Telegram FR) & Chatters (Commissions & Ventes)
 * - Dépenses opérationnelles du mois (Numéros, Mails, Comptes Twitter, Ads, Salaire Modèle, Autre)
 * - Chiffre d'Affaires global (Ventes Chatters + Revenus plateformes OnlyFans/Fansly/etc.)
 * - Calcul du Bénéfice Net
 * - Répartition des Associés 50 / 50
 * - Panneau interactif dans #compatabiliter (1566025049104851068)
 */
'use strict';

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { db } = require('../database/db');

// ─── Initialisation des tables SQLite ─────────────────────────────────────────
function initComptaTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agency_expenses (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      category         TEXT NOT NULL, -- 'Numéros', 'Mails', 'Comptes Twitter', 'Ads', 'Salaire Modèle', 'Autre'
      amount           REAL NOT NULL,
      description      TEXT,
      date             TEXT NOT NULL, -- YYYY-MM-DD
      created_by_id    TEXT,
      created_by_name  TEXT,
      created_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agency_revenues (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      source           TEXT NOT NULL, -- 'OnlyFans', 'Fansly', 'MYM', 'Autre'
      amount           REAL NOT NULL,
      description      TEXT,
      date             TEXT NOT NULL, -- YYYY-MM-DD
      created_by_id    TEXT,
      created_by_name  TEXT,
      created_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

// ─── Enregistrement d'une dépense ─────────────────────────────────────────────
function addExpense({ category, amount, description = '', date = null, createdById = null, createdByName = null }) {
  const numAmount = Math.round(Number(amount) * 100) / 100;
  if (isNaN(numAmount) || numAmount <= 0) throw new Error('Montant invalide.');

  const todayStr = date || new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  const stmt = db.prepare(`
    INSERT INTO agency_expenses (category, amount, description, date, created_by_id, created_by_name)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const info = stmt.run(
    category.trim(),
    numAmount,
    description.trim(),
    todayStr,
    createdById,
    createdByName
  );

  return {
    id: info.lastInsertRowid,
    category: category.trim(),
    amount: numAmount,
    description: description.trim(),
    date: todayStr,
    createdById,
    createdByName,
  };
}

// ─── Suppression d'une dépense ───────────────────────────────────────────────
function deleteExpense(id) {
  const existing = db.prepare('SELECT * FROM agency_expenses WHERE id = ?').get(id);
  if (!existing) return null;
  db.prepare('DELETE FROM agency_expenses WHERE id = ?').run(id);
  return existing;
}

// ─── Enregistrement d'un revenu / encaissement CA ─────────────────────────────
function addRevenue({ source, amount, description = '', date = null, createdById = null, createdByName = null }) {
  const numAmount = Math.round(Number(amount) * 100) / 100;
  if (isNaN(numAmount) || numAmount <= 0) throw new Error('Montant invalide.');

  const todayStr = date || new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  const stmt = db.prepare(`
    INSERT INTO agency_revenues (source, amount, description, date, created_by_id, created_by_name)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const info = stmt.run(
    source.trim(),
    numAmount,
    description.trim(),
    todayStr,
    createdById,
    createdByName
  );

  return {
    id: info.lastInsertRowid,
    source: source.trim(),
    amount: numAmount,
    description: description.trim(),
    date: todayStr,
    createdById,
    createdByName,
  };
}

// ─── Récupérer les dépenses récentes ─────────────────────────────────────────
function getRecentExpenses(limit = 10, month = null) {
  if (month) {
    return db.prepare(`
      SELECT * FROM agency_expenses
      WHERE strftime('%Y-%m', date) = ?
      ORDER BY id DESC
      LIMIT ?
    `).all(month, limit);
  }

  return db.prepare(`
    SELECT * FROM agency_expenses
    ORDER BY id DESC
    LIMIT ?
  `).all(limit);
}

// ─── Calcul et Agrégation Comptable du Mois ──────────────────────────────────
function getMonthlyComptaData(targetMonth = null) {
  const currentMonthStr = targetMonth || new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date()); // Ex: '2026-10'

  // S'assurer que les charges récurrentes mensuelles (Telegram Premium, Salaire Modèle 700$, Managers 2x100$)
  // sont bien initialisées et présentes pour le mois demandé
  try {
    initMonthlyRecurringExpenses(currentMonthStr);
  } catch (err) {
    console.warn(`[Compta] Avertissement init récurrentes pour ${currentMonthStr}:`, err.message);
  }

  // 1. Coût VAs Telegram pour le mois (Canal FR, subs éligibles / 3)
  const vaSubsRow = db.prepare(`
    SELECT COUNT(*) as total_subs,
           SUM(CASE WHEN eligible = 1 THEN 1 ELSE 0 END) as eligible_subs
    FROM tg_subs
    WHERE canal = 'FR' AND strftime('%Y-%m', ts) = ?
  `).get(currentMonthStr);

  const vaEligibleSubs = vaSubsRow && vaSubsRow.eligible_subs ? vaSubsRow.eligible_subs : 0;
  const vaTotalSubs = vaSubsRow && vaSubsRow.total_subs ? vaSubsRow.total_subs : 0;
  let vaCost = Math.round((vaEligibleSubs / 3) * 100) / 100;

  // Clôture d'Octobre 2026 (paiements de demain à $250.00 total) :
  // VAs Canal FR éligibles au virement : $127.00 (Malachie $73 + Richid $33 + Titi $21)
  // VAs Canal US clôture : $123.00 (Malachie US $112 + Richi jailbreak $11)
  if (currentMonthStr === '2026-10') {
    vaCost = 127.00;
  }

  // 2. Chatters : Ventes (qui alimentent le CA) & Commissions pour le mois
  const chatterSalesRow = db.prepare(`
    SELECT COUNT(*) as sales_count,
           COALESCE(SUM(amount), 0) as total_sales,
           COALESCE(SUM(commission_earned), 0) as total_commission
    FROM chatter_sales
    WHERE strftime('%Y-%m', created_at) = ?
  `).get(currentMonthStr);

  const chatterSalesCount = chatterSalesRow ? chatterSalesRow.sales_count : 0;
  const chatterTotalSales = chatterSalesRow ? Math.round(chatterSalesRow.total_sales * 100) / 100 : 0;
  const chatterGrossCommission = chatterSalesRow ? Math.round(chatterSalesRow.total_commission * 100) / 100 : 0;

  // Pénalités déduites des chatters sur ce mois
  const chatterPenaltiesRow = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total_penalties
    FROM chatter_penalties
    WHERE strftime('%Y-%m', created_at) = ?
  `).get(currentMonthStr);

  const chatterPenalties = chatterPenaltiesRow ? Math.round(chatterPenaltiesRow.total_penalties * 100) / 100 : 0;
  const chatterNetCommission = Math.max(0, Math.round((chatterGrossCommission - chatterPenalties) * 100) / 100);

  // 3. Dépenses opérationnelles enregistrées manuellement (agency_expenses)
  const expRows = db.prepare(`
    SELECT category, COALESCE(SUM(amount), 0) as total_amount, COUNT(*) as count
    FROM agency_expenses
    WHERE strftime('%Y-%m', date) = ?
    GROUP BY category
  `).all(currentMonthStr);

  const categories = {
    'Numéros': 0,
    'Mails': 0,
    'Comptes Twitter': 0,
    'Ads': 0,
    'Telegram Premium': 0,
    'Salaire Modèle': 0,
    'Salaires Managers': 0,
    'VAs US / Clôture': 0,
    'Régularisation VAs': 0,
    'Autre': 0,
  };

  let totalOperatingExpenses = 0;
  for (const r of expRows) {
    const cat = r.category;
    const amt = Math.round(r.total_amount * 100) / 100;
    if (categories.hasOwnProperty(cat)) {
      categories[cat] += amt;
    } else {
      categories['Autre'] += amt;
    }
    totalOperatingExpenses += amt;
  }
  totalOperatingExpenses = Math.round(totalOperatingExpenses * 100) / 100;

  // 4. Revenus supplémentaires enregistrés (agency_revenues)
  const revRow = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total_extra
    FROM agency_revenues
    WHERE strftime('%Y-%m', date) = ?
  `).get(currentMonthStr);
  const extraRevenues = revRow ? Math.round(revRow.total_extra * 100) / 100 : 0;

  // 5. Chiffre d'Affaires Brut Total
  const totalGrossRevenue = Math.round((chatterTotalSales + extraRevenues) * 100) / 100;

  // 6. Total Dépenses
  const totalExpenses = Math.round(
    (vaCost + chatterNetCommission + totalOperatingExpenses) * 100
  ) / 100;

  // 7. Bénéfice Net
  const netProfit = Math.round((totalGrossRevenue - totalExpenses) * 100) / 100;

  // 8. Répartition 50 / 50
  const associateShare = Math.round((netProfit / 2) * 100) / 100;

  // Formattage du mois lisible (ex: "Octobre 2026")
  const dateObj = new Date(`${currentMonthStr}-01T12:00:00Z`);
  const monthName = new Intl.DateTimeFormat('fr-FR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Paris',
  }).format(dateObj);
  const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  return {
    monthStr: currentMonthStr,
    capitalizedMonth,
    vaCost,
    vaEligibleSubs,
    vaTotalSubs,
    chatterTotalSales,
    chatterSalesCount,
    chatterGrossCommission,
    chatterPenalties,
    chatterNetCommission,
    categories,
    totalOperatingExpenses,
    extraRevenues,
    totalGrossRevenue,
    totalExpenses,
    netProfit,
    associateShare,
  };
}

// ─── Mise en place / Actualisation du panneau dans #compatabiliter ───────────
async function setupComptaChannel(client, targetMonth = null) {
  const channelId = process.env.CHANNEL_COMPTABILITE || '1566025049104851068';
  const channel = await client.channels.fetch(channelId).catch(() => null);

  if (!channel) {
    console.warn(`⚠️ Salon Comptabilité introuvable (${channelId}). Vérifie le .env`);
    return;
  }

  // Purger les anciens messages du bot dans ce salon
  const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (messages) {
    const oldMessages = messages.filter(m =>
      m.author.id === client.user.id &&
      m.embeds.length > 0 &&
      (m.embeds[0]?.title?.includes('COMPTABILITÉ') || m.embeds[0]?.title?.includes('BILAN FINANCIER'))
    );
    for (const [, oldMsg] of oldMessages) {
      await oldMsg.delete().catch(() => {});
    }
  }

  const now = new Date();
  const currentMonth = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit' }).format(now);
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthStr = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit' }).format(prevMonthDate);

  const selectedMonth = targetMonth || (now.getDate() <= 5 ? prevMonthStr : currentMonth);
  const data = getMonthlyComptaData(selectedMonth);

  const isProfitPositive = data.netProfit >= 0;
  const statusColor = isProfitPositive ? 0x00ff88 : 0xed4245; // Vert ou Rouge

  // 1. Embed Principal : Tableau de bord Financier & Bénéfices
  const mainEmbed = new EmbedBuilder()
    .setColor(statusColor)
    .setTitle(`📊 COMPTABILITÉ & BILAN FINANCIER — ${data.capitalizedMonth.toUpperCase()}`)
    .setDescription(
      `Tableau de bord financier central de l'agence **AVA Agency**.\n` +
      `Tous les flux financiers, charges et encaissements sont centralisés ci-dessous en temps réel.\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📈 **Chiffre d'Affaires Brut :** \`$${data.totalGrossRevenue.toFixed(2)}\`\n` +
      `📉 **Total des Charges & Dépenses :** \`-$${data.totalExpenses.toFixed(2)}\`\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `💎 **BÉNÉFICE NET DU MOIS :** \`$${data.netProfit.toFixed(2)}\`\n\n` +
      `🤝 **RÉPARTITION ASSOCIÉS (50% / 50%) :**\n` +
      `  └ 👑 **Part Associé 1 (50%) :** **\`$${data.associateShare.toFixed(2)}\`**\n` +
      `  └ 👑 **Part Associé 2 (50%) :** **\`$${data.associateShare.toFixed(2)}\`**\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    )
    .addFields(
      {
        name: '💵 Chiffre d\'Affaires Déclaré',
        value: `• Ventes Chatters (PPV/Tips) : **\$${data.chatterTotalSales.toFixed(2)}** (${data.chatterSalesCount} vente(s))\n` +
               `• Autres Entrées Plateformes : **\$${data.extraRevenues.toFixed(2)}**\n` +
               `• **Total CA Brut :** **\$${data.totalGrossRevenue.toFixed(2)}**`,
        inline: false,
      },
      {
        name: '👥 Charges d\'Équipe (Salaires & Commissions)',
        value: `• 📱 **VAs Telegram (FR)** : **\$${data.vaCost.toFixed(2)}**` +
               (data.monthStr === '2026-10' ? ` *(Malachie \$73 + Richid \$33 + Titi \$21)*\n` : ` (${data.vaEligibleSubs} subs valides)\n`) +
               (data.categories['VAs US / Clôture'] > 0 ? `• 🇺🇸 **VAs Clôture US** : **\$${data.categories['VAs US / Clôture'].toFixed(2)}** *(Malachie \$112 + Richi \$11)*\n` : '') +
               (data.monthStr === '2026-10' ? `👉 **Total VAs à virer : \$${(data.vaCost + (data.categories['VAs US / Clôture'] || 0)).toFixed(2)}** *(250.00\$ conforme au rapport)*\n` : '') +
               `• 💬 **Commissions Chatters** : **\$${data.chatterNetCommission.toFixed(2)}** nettes` +
               (data.chatterPenalties > 0 ? ` *(-\$${data.chatterPenalties.toFixed(2)} pénalités)*` : '') + `\n` +
               `• 👑 **Salaire Modèle** : **\$${data.categories['Salaire Modèle'].toFixed(2)}**` +
               (data.monthStr === '2026-10' ? ` *(exceptionnellement 400\$, 700\$ à l'avenir)*\n` : ` *(700\$ fixe mensuel)*\n`) +
               `• 👔 **Salaires Managers (x2)** : **\$${data.categories['Salaires Managers'].toFixed(2)}**` +
               (data.monthStr === '2026-10' ? ` *(M1: \$100 [\$30 versés, \$70 dus], M2: \$80)*` : ` *(M1: \$100, M2: \$100 fixes)*`),
        inline: false,
      },
      {
        name: '🛠️ Charges Opérationnelles du Mois',
        value: `• ✈️ **Telegram Premium** : **\$${data.categories['Telegram Premium'].toFixed(2)}** *(3.99$/mois)*\n` +
               `• 📢 **Ads & Publicités** : **\$${data.categories['Ads'].toFixed(2)}**\n` +
               `• 🐦 **Comptes Twitter / Réseaux** : **\$${data.categories['Comptes Twitter'].toFixed(2)}**\n` +
               `• 📲 **Numéros (SMSPool, etc.)** : **\$${data.categories['Numéros'].toFixed(2)}**\n` +
               `• ✉️ **Mails** : **\$${data.categories['Mails'].toFixed(2)}**\n` +
               `• ⚙️ **Outils & Autre** : **\$${data.categories['Autre'].toFixed(2)}**\n` +
               `• **Total Frais Opérationnels :** **\$${data.totalOperatingExpenses.toFixed(2)}**`,
        inline: false,
      }
    )
    .setFooter({ text: 'AVA Agency • Comptabilité Officielle & Partage 50/50' })
    .setTimestamp();

  // Boutons d'action
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('compta_btn_add_expense')
      .setLabel('➕ Ajouter une Dépense')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('compta_btn_add_revenue')
      .setLabel('💵 Déclarer CA / Revenu')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('compta_btn_history')
      .setLabel('📜 Historique des Dépenses')
      .setStyle(ButtonStyle.Primary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('compta_btn_switch_october')
      .setLabel('⏮️ Octobre (Clôture)')
      .setStyle(data.monthStr === '2026-10' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('compta_btn_switch_november')
      .setLabel('▶️ Novembre (En cours)')
      .setStyle(data.monthStr === '2026-11' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('compta_btn_details')
      .setLabel('📊 Rapport Détaillé')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('compta_btn_refresh')
      .setLabel('🔄 Actualiser')
      .setStyle(ButtonStyle.Secondary)
  );

  await channel.send({
    embeds: [mainEmbed],
    components: [row1, row2],
  });

  console.log(`✅ Tableau de bord comptable configuré dans #${channel.name || channelId}`);
}

// ─── Initialisation des Dépenses Récurrentes Mensuelles ─────────────────────
function initMonthlyRecurringExpenses(targetMonth = null) {
  const currentMonthStr = targetMonth || new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date());

  const firstDayStr = `${currentMonthStr}-01`;

  // 1. Abonnement Telegram Premium : $3.99 chaque mois
  const tgCount = db.prepare(`
    SELECT COUNT(*) as count FROM agency_expenses
    WHERE category = 'Telegram Premium' AND strftime('%Y-%m', date) = ?
  `).get(currentMonthStr);

  if (!tgCount || tgCount.count === 0) {
    addExpense({
      category: 'Telegram Premium',
      amount: 3.99,
      description: `Abonnement Telegram mensuel ($3.99) — ${currentMonthStr}`,
      date: firstDayStr,
      createdById: 'SYSTEM',
      createdByName: 'Système Récurrent',
    });
    console.log(`📌 [Compta] Abonnement Telegram ($3.99) initialisé pour ${currentMonthStr}`);
  }

  // 2. Salaire Modèle : $700.00 fixe mensuel (sauf exception Octobre 2026 à $400.00)
  const modelCount = db.prepare(`
    SELECT COUNT(*) as count FROM agency_expenses
    WHERE category = 'Salaire Modèle' AND strftime('%Y-%m', date) = ?
  `).get(currentMonthStr);

  if (!modelCount || modelCount.count === 0) {
    const isOctober2026 = (currentMonthStr === '2026-10');
    const modelAmount = isOctober2026 ? 400.00 : 700.00;
    const modelDesc = isOctober2026
      ? 'Salaire Modèle - Octobre 2026 (ajusté 400$ au lieu de 700$ fixe habituel)'
      : `Salaire Modèle fixe mensuel ($700.00) — ${currentMonthStr}`;

    addExpense({
      category: 'Salaire Modèle',
      amount: modelAmount,
      description: modelDesc,
      date: isOctober2026 ? '2026-10-31' : firstDayStr,
      createdById: 'SYSTEM',
      createdByName: 'Système Récurrent',
    });
    console.log(`📌 [Compta] Salaire Modèle ($${modelAmount}) initialisé pour ${currentMonthStr}`);
  }

  // 3. Salaires Managers (x2) : $200.00 fixes ($100 x 2) (sauf ajustement Octobre 2026 à $180.00)
  const managerCount = db.prepare(`
    SELECT COUNT(*) as count FROM agency_expenses
    WHERE category = 'Salaires Managers' AND strftime('%Y-%m', date) = ?
  `).get(currentMonthStr);

  if (!managerCount || managerCount.count === 0) {
    if (currentMonthStr === '2026-10') {
      addExpense({
        category: 'Salaires Managers',
        amount: 30.00,
        description: 'Acompte Salaire Manager 1 (déjà versé) - Octobre 2026',
        date: '2026-10-15',
        createdById: 'SYSTEM',
        createdByName: 'Système Récurrent',
      });
      addExpense({
        category: 'Salaires Managers',
        amount: 70.00,
        description: 'Solde restant Salaire Manager 1 (à virer) - Octobre 2026',
        date: '2026-10-31',
        createdById: 'SYSTEM',
        createdByName: 'Système Récurrent',
      });
      addExpense({
        category: 'Salaires Managers',
        amount: 80.00,
        description: 'Salaire Manager 2 (ajusté 80$ selon résultats) - Octobre 2026',
        date: '2026-10-31',
        createdById: 'SYSTEM',
        createdByName: 'Système Récurrent',
      });
      console.log(`📌 [Compta] Salaires Managers ($180.00) initialisés pour Octobre 2026`);
    } else {
      addExpense({
        category: 'Salaires Managers',
        amount: 100.00,
        description: `Salaire Manager 1 fixe mensuel ($100.00) — ${currentMonthStr}`,
        date: firstDayStr,
        createdById: 'SYSTEM',
        createdByName: 'Système Récurrent',
      });
      addExpense({
        category: 'Salaires Managers',
        amount: 100.00,
        description: `Salaire Manager 2 fixe mensuel ($100.00) — ${currentMonthStr}`,
        date: firstDayStr,
        createdById: 'SYSTEM',
        createdByName: 'Système Récurrent',
      });
      console.log(`📌 [Compta] Salaires Managers (2x $100 = $200.00) initialisés pour ${currentMonthStr}`);
    }
  }
}

module.exports = {
  initComptaTables,
  addExpense,
  deleteExpense,
  addRevenue,
  getRecentExpenses,
  getMonthlyComptaData,
  setupComptaChannel,
  initMonthlyRecurringExpenses,
};
