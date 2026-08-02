const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://myfeed.fans';

let sessionCookies = null;
let lastLogin = null;
const SESSION_TTL = 60 * 60 * 1000; // 1 heure

/**
 * Se connecte à myfeed.fans et récupère les cookies de session
 */
async function login() {
  console.log('🔐 myfeed.fans — Connexion...');

  try {
    // Étape 1 : Récupérer la page de login (pour CSRF token si besoin)
    const loginPage = await axios.get(`${BASE_URL}/login`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });

    const $ = cheerio.load(loginPage.data);
    const csrfToken = $('meta[name="csrf-token"]').attr('content')
      || $('input[name="_token"]').val()
      || '';

    const loginCookies = loginPage.headers['set-cookie']?.join('; ') || '';

    // Étape 2 : Soumettre le formulaire de login
    const loginRes = await axios.post(`${BASE_URL}/login`, {
      email: process.env.MYFEED_EMAIL,
      password: process.env.MYFEED_PASSWORD,
      _token: csrfToken,
    }, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': loginCookies,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': `${BASE_URL}/login`,
      },
      maxRedirects: 5,
    });

    sessionCookies = loginRes.headers['set-cookie']?.join('; ') || loginCookies;
    lastLogin = Date.now();
    console.log('✅ myfeed.fans — Connecté');
    return true;
  } catch (err) {
    console.error('❌ myfeed.fans login error:', err.message);
    return false;
  }
}

/**
 * S'assure que la session est valide, se reconnecte si nécessaire
 */
async function ensureSession() {
  if (!sessionCookies || !lastLogin || Date.now() - lastLogin > SESSION_TTL) {
    return await login();
  }
  return true;
}

/**
 * Récupère les stats de clics pour un deeplink myfeed.fans
 * @param {string} deeplink - URL complète du deeplink (ex: https://myfeed.fans/xyz)
 * @returns {{ clics: number, lastClic: Date|null }}
 */
async function getDeeplinkStats(deeplink) {
  const ok = await ensureSession();
  if (!ok) return { clics: 0, lastClic: null, error: 'Session invalide' };

  try {
    // Extraire le slug du deeplink
    const slug = deeplink.replace(BASE_URL, '').replace(/^\//, '').split('/')[0];

    // Essayer plusieurs endpoints courants pour les stats
    const endpoints = [
      `${BASE_URL}/dashboard/links/${slug}/stats`,
      `${BASE_URL}/analytics/${slug}`,
      `${BASE_URL}/links/${slug}`,
    ];

    for (const url of endpoints) {
      try {
        const res = await axios.get(url, {
          headers: {
            'Cookie': sessionCookies,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        });

        if (res.status === 200) {
          const stats = parseStatsPage(res.data);
          if (stats.clics >= 0) return stats;
        }
      } catch (_) { continue; }
    }

    return { clics: 0, lastClic: null };
  } catch (err) {
    console.error(`❌ myfeed.fans getStats error (${deeplink}):`, err.message);
    return { clics: 0, lastClic: null, error: err.message };
  }
}

/**
 * Parse une page HTML pour extraire les stats de clics
 * Adapte les sélecteurs selon la structure réelle du site
 */
function parseStatsPage(html) {
  const $ = cheerio.load(html);

  // Tentative 1 : chercher des éléments avec le nombre de clics
  let clics = 0;

  // Patterns courants sur les dashboards de liens
  const patterns = [
    () => parseInt($('[data-clicks]').attr('data-clicks') || '0'),
    () => parseInt($('.clicks-count, .click-count, .total-clicks').first().text().replace(/\D/g, '') || '0'),
    () => parseInt($('strong:contains("clic"), b:contains("clic")').first().text().replace(/\D/g, '') || '0'),
    () => {
      // Chercher dans le JSON embarqué (window.__data ou similar)
      const scripts = $('script').toArray().map(s => $(s).html() || '');
      for (const script of scripts) {
        const match = script.match(/"clicks"\s*:\s*(\d+)/);
        if (match) return parseInt(match[1]);
      }
      return 0;
    },
  ];

  for (const pattern of patterns) {
    try {
      const val = pattern();
      if (val > 0) { clics = val; break; }
    } catch (_) {}
  }

  // Dernière mise à jour
  let lastClic = null;
  const dateStr = $('.last-click, [data-last-click]').first().text()
    || $('[data-last-click]').attr('data-last-click');
  if (dateStr) lastClic = new Date(dateStr);

  return { clics, lastClic };
}

/**
 * Récupère les stats de tous les deeplinks d'un tableau
 * @param {Array<{id, deeplink}>} comptes 
 */
async function getAllStats(comptes) {
  const results = [];
  for (const compte of comptes) {
    if (!compte.deeplink) continue;
    const stats = await getDeeplinkStats(compte.deeplink);
    results.push({ ...compte, ...stats });
    await new Promise(r => setTimeout(r, 500)); // rate limiting
  }
  return results;
}

module.exports = { login, getDeeplinkStats, getAllStats };
