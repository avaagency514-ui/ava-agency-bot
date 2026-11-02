const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

let sheetsClient = null;

function initSheets() {
  try {
    let credentials;
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    } else if (fs.existsSync(path.join(__dirname, '../credentials.json'))) {
      credentials = JSON.parse(fs.readFileSync(path.join(__dirname, '../credentials.json'), 'utf8'));
    } else {
      console.warn('⚠️ Google Sheets : aucune credentials trouvée.');
      return null;
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    sheetsClient = google.sheets({ version: 'v4', auth });
    console.log('✅ Google Sheets initialisé');
    return sheetsClient;
  } catch (err) {
    console.error('❌ Google Sheets init error:', err.message);
    return null;
  }
}

/**
 * Ajoute un compte IG dans le Google Sheet "Compte insta"
 * @param {Array} rowData - Array formaté pour les colonnes A à M
 */
async function appendAccountToSheet(rowData) {
  if (!sheetsClient) sheetsClient = initSheets();
  if (!sheetsClient) {
    console.warn('⚠️ Impossible d\'ajouter au Sheet : client non initialisé.');
    return;
  }

  const sheetId = process.env.GOOGLE_SHEET_COMPTES_ID;
  if (!sheetId) {
    console.warn('⚠️ GOOGLE_SHEET_COMPTES_ID non défini dans .env');
    return;
  }

  try {
    // 1. Lire la colonne C (Nom d'utilisateur) pour trouver la première case vide
    const res = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'Compte insta!A:C'
    });
    
    const rows = res.data.values || [];
    let emptyRowIndex = 4; // On commence à chercher à la ligne 4 par défaut (index 3 mais 1-based pour Sheets)
    
    for (let i = 3; i < rows.length; i++) {
      if (!rows[i][2] || rows[i][2].trim() === '') {
        emptyRowIndex = i + 1;
        break;
      }
    }
    // Si toutes les lignes lues sont pleines, on ajoute à la fin (rows.length + 1)
    if (emptyRowIndex === 4 && rows.length >= 4) {
      if (rows[rows.length - 1][2] && rows[rows.length - 1][2].trim() !== '') {
         emptyRowIndex = rows.length + 1;
      }
    }

    // 2. Mettre à jour cette ligne précise
    const targetRange = `Compte insta!A${emptyRowIndex}:M${emptyRowIndex}`;
    await sheetsClient.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: targetRange,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [rowData]
      }
    });
    
    console.log(`✅ Compte IG: ${rowData[2]} inséré à la ligne ${emptyRowIndex}`);
  } catch (err) {
    console.error('❌ Erreur lors de l\'ajout au Google Sheet:', err.message);
  }
}

/**
 * Supprime un compte IG du Google Sheet basé sur son Username IG
 */
async function removeAccountFromSheet(usernameIg) {
  if (!sheetsClient) sheetsClient = initSheets();
  if (!sheetsClient) return;
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) return;

  try {
    // 1. Lire toutes les lignes
    const res = await sheetsClient.spreadsheets.values.get({ spreadsheetId: sheetId, range: 'A:H' });
    const rows = res.data.values;
    if (!rows || rows.length === 0) return;

    // 2. Trouver la ligne (Username IG est dans la colonne B, index 1)
    const rowIndex = rows.findIndex(row => row[1] === usernameIg);
    if (rowIndex === -1) return; // Non trouvé

    // 3. Récupérer le sheetId (gid) de la première feuille
    const meta = await sheetsClient.spreadsheets.get({ spreadsheetId: sheetId });
    const sheetGid = meta.data.sheets[0].properties.sheetId;

    // 4. Supprimer la ligne (0-based index)
    await sheetsClient.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId: sheetGid,
              dimension: 'ROWS',
              startIndex: rowIndex,
              endIndex: rowIndex + 1
            }
          }
        }]
      }
    });
    console.log(`✅ Compte IG ${usernameIg} supprimé du Google Sheet.`);
  } catch (err) {
    console.error('❌ Erreur lors de la suppression sur le Google Sheet:', err.message);
  }
}

/**
 * Synchronise tous les comptes (efface tout sauf l'entête et réécrit)
 */
async function syncAllAccountsToSheet(accountsData) {
  if (!sheetsClient) sheetsClient = initSheets();
  if (!sheetsClient) return;
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) return;

  try {
    // Effacer de la ligne 2 jusqu'à la fin
    await sheetsClient.spreadsheets.values.clear({ spreadsheetId: sheetId, range: 'A2:H' });

    if (accountsData.length > 0) {
      await sheetsClient.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: 'A2:H',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: accountsData }
      });
    }
    console.log(`✅ Google Sheet synchronisé (${accountsData.length} comptes).`);
  } catch (err) {
    console.error('❌ Erreur lors de la synchronisation du Google Sheet:', err.message);
  }
}

/**
 * Récupère un texte aléatoire dans une colonne spécifique du Google Sheet (Bio, Story CTA, Profil)
 * @param {string} market 'FR' ou 'US'
 * @param {string} column 'A' (Bio), 'B' (Story CTA) ou 'C' (Profil)
 */
async function getRandomTextFromSheet(market, column) {
  if (!sheetsClient) sheetsClient = initSheets();
  if (!sheetsClient) throw new Error("Google Sheets non configuré");
  
  const sheetId = market === 'US' ? process.env.GOOGLE_SHEET_TEXT_US : process.env.GOOGLE_SHEET_TEXT_FR;
  if (!sheetId) throw new Error(`Google Sheet Text introuvable pour le marché ${market}`);

  try {
    const res = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${column}2:${column}`, // On ignore la ligne 1 (entête)
    });
    
    const rows = res.data.values;
    if (!rows || rows.length === 0) throw new Error(`Aucune donnée dans la colonne ${column} du sheet ${market}`);
    
    // Filtrer les cases vides
    const validTexts = rows.map(r => r[0]).filter(t => t && t.trim() !== '');
    if (validTexts.length === 0) throw new Error(`Aucun texte valide dans la colonne ${column}`);
    
    // Prendre un au hasard
    const randomIndex = Math.floor(Math.random() * validTexts.length);
    return validTexts[randomIndex];
  } catch (err) {
    console.error(`Erreur getRandomTextFromSheet (${market}, ${column}):`, err.message);
    throw err;
  }
}

async function getRandomTextFromCustomSheet(sheetId, tabName, column) {
  if (!sheetsClient) sheetsClient = initSheets();
  if (!sheetsClient) throw new Error("Google Sheets non configuré");

  try {
    const range = tabName ? `'${tabName}'!${column}2:${column}` : `${column}2:${column}`;
    const res = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: range,
    });
    
    const rows = res.data.values;
    if (!rows || rows.length === 0) throw new Error(`Aucune donnée dans la colonne ${column}`);
    
    const validTexts = rows.map(r => r[0]).filter(t => t && t.trim() !== '');
    if (validTexts.length === 0) throw new Error(`Aucun texte valide dans la colonne ${column}`);
    
    const randomIndex = Math.floor(Math.random() * validTexts.length);
    return validTexts[randomIndex];
  } catch (err) {
    console.error(`Erreur getRandomTextFromCustomSheet (${sheetId}, ${tabName}, ${column}):`, err.message);
    throw err;
  }
}

module.exports = { initSheets, appendAccountToSheet, removeAccountFromSheet, syncAllAccountsToSheet, getRandomTextFromSheet, getRandomTextFromCustomSheet };
