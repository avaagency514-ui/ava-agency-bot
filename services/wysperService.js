/**
 * Wysper CRM Service
 * Intégration complète avec l'API Wysper (https://wysper.io/api/v1)
 * Token: wsk_live_bfckcex3s7l2w2ne6ikfzacnmokjaw6p
 */

const https = require('https');

const WYSPER_BASE_HOST = 'wysper.io';
const WYSPER_API_KEY = process.env.WYSPER_API_KEY || 'wsk_live_bfckcex3s7l2w2ne6ikfzacnmokjaw6p';

/**
 * Effectue un appel GET vers l'API Wysper
 */
function fetchWysper(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: WYSPER_BASE_HOST,
      path: path,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${WYSPER_API_KEY}`,
        'User-Agent': 'AVAAgencyBot/1.0',
        'Accept': 'application/json'
      },
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk.toString(); });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve({ raw: data });
          }
        } else {
          try {
            const errJson = JSON.parse(data);
            reject(new Error(`Wysper API Error ${res.statusCode}: ${errJson.error?.message || errJson.message || data}`));
          } catch (e) {
            reject(new Error(`Wysper API Error ${res.statusCode}: ${data}`));
          }
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Wysper API timeout (>10s)'));
    });
    req.end();
  });
}

/**
 * Récupère tous les comptes modèles (Kim Chloe, Cathy, etc.)
 */
async function getAccounts() {
  try {
    const res = await fetchWysper('/api/v1/accounts');
    return res.data || [];
  } catch (err) {
    console.error('Erreur getAccounts Wysper:', err.message);
    return [];
  }
}

/**
 * Récupère tous les tags CRM (Spender, Baleine, TW, etc.)
 */
async function getTags() {
  try {
    const res = await fetchWysper('/api/v1/tags');
    return res.data || [];
  } catch (err) {
    console.error('Erreur getTags Wysper:', err.message);
    return [];
  }
}

/**
 * Récupère les contacts d'un compte modèle avec pagination optionnelle (jusqu'à maxPages)
 */
async function getContacts(accountId, maxPages = 5) {
  const allContacts = [];
  let cursor = null;
  let page = 0;

  try {
    do {
      page++;
      const cursorParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
      const res = await fetchWysper(`/api/v1/contacts?account=${encodeURIComponent(accountId)}${cursorParam}`);
      if (res.data && Array.isArray(res.data)) {
        allContacts.push(...res.data);
      }
      cursor = res.has_more ? res.next_cursor : null;
    } while (cursor && page < maxPages);

    return allContacts;
  } catch (err) {
    console.error(`Erreur getContacts Wysper (${accountId}):`, err.message);
    return allContacts;
  }
}

/**
 * Récupère les paiements récents
 */
async function getPayments(sinceDate) {
  try {
    const since = sinceDate ? new Date(sinceDate).toISOString() : new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const res = await fetchWysper(`/api/v1/payments?since=${encodeURIComponent(since)}`);
    return res.data || [];
  } catch (err) {
    console.error('Erreur getPayments Wysper:', err.message);
    return [];
  }
}

/**
 * Analyse et classe les abonnés pour un compte donné
 * Détecte les Baleines, Spenders, Time Wasters et opportunités de relance
 */
async function analyzeProspects(accountId) {
  const [contacts, payments] = await Promise.all([
    getContacts(accountId, 5),
    getPayments()
  ]);

  const now = Date.now();

  // Indexer les dépenses réelles par telegram_id depuis les paiements
  const spendByFanId = {};
  for (const p of payments) {
    if (p.buyer && p.buyer.telegram_id && p.status === 'paid') {
      const bId = p.buyer.telegram_id;
      const amountEur = (p.price_cents || p.amount_gross_cents || 0) / 100;
      spendByFanId[bId] = (spendByFanId[bId] || 0) + amountEur;
    }
  }

  const whales = [];
  const spenders = [];
  const timeWasters = [];
  const relanceNeeded = [];

  for (const c of contacts) {
    const apiSpent = (c.total_spent_cents || 0) / 100;
    const paymentSpent = spendByFanId[c.telegram_id] || 0;
    const totalSpent = Math.max(apiSpent, paymentSpent);
    const paymentsCount = c.payments_count || (paymentSpent > 0 ? 1 : 0);
    const tagNames = (c.tags || []).map(t => (t.name || '').toUpperCase());

    const isWhale = totalSpent >= 100 || tagNames.some(t => t.includes('BALEINE'));
    const isSpender = (totalSpent > 0 && !isWhale) || tagNames.some(t => t.includes('SPENDER'));
    const isTW = tagNames.some(t => t.includes('TW') || t.includes('PAS DE CARTE') || t.includes('NE PAS LUI ECRIRE')) || (paymentsCount === 0 && totalSpent === 0);

    const fanInfo = {
      telegram_id: c.telegram_id,
      username: c.telegram_username ? `@${c.telegram_username}` : null,
      name: c.telegram_name || c.name || 'Abonné',
      totalSpent,
      paymentsCount,
      lastPaymentAt: c.last_payment_at,
      lastIncomingAt: c.last_incoming_at,
      lastOutgoingAt: c.last_outgoing_at,
      tags: tagNames
    };

    if (isWhale) {
      whales.push(fanInfo);
    } else if (isSpender) {
      spenders.push(fanInfo);
    } else if (isTW) {
      timeWasters.push(fanInfo);
    }

    // Détection des relances
    if (c.last_incoming_at) {
      const incomingTime = new Date(c.last_incoming_at).getTime();
      const outgoingTime = c.last_outgoing_at ? new Date(c.last_outgoing_at).getTime() : 0;
      const hoursSinceContact = (now - Math.max(incomingTime, outgoingTime)) / (1000 * 3600);

      if (incomingTime > outgoingTime) {
        relanceNeeded.push({
          ...fanInfo,
          reason: 'En attente de réponse (URGENT)',
          priority: isWhale ? 1 : isSpender ? 2 : 3,
          hoursSinceContact: Math.round(hoursSinceContact)
        });
      } else if ((isWhale || isSpender) && hoursSinceContact >= 12 && hoursSinceContact <= 168) {
        relanceNeeded.push({
          ...fanInfo,
          reason: isWhale ? 'Baleine inactive >12h (Fidélisation VIP)' : 'Spender tiède (Réactivation)',
          priority: isWhale ? 1 : 2,
          hoursSinceContact: Math.round(hoursSinceContact)
        });
      }
    }
  }

  // Trier les relances par priorité puis par montant dépensé
  relanceNeeded.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return b.totalSpent - a.totalSpent;
  });

  return {
    totalContacts: contacts.length,
    whalesCount: whales.length,
    spendersCount: spenders.length,
    timeWastersCount: timeWasters.length,
    whales: whales.sort((a, b) => b.totalSpent - a.totalSpent),
    spenders: spenders.sort((a, b) => b.totalSpent - a.totalSpent),
    timeWasters: timeWasters.slice(0, 15),
    relanceNeeded: relanceNeeded.slice(0, 20)
  };
}

module.exports = {
  getAccounts,
  getTags,
  getContacts,
  getPayments,
  analyzeProspects
};
