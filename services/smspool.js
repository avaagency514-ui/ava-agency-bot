const axios = require('axios');

const SMSPOOL_API_KEY = process.env.SMSPOOL_API_KEY;
const BASE_URL = 'https://api.smspool.net';

/**
 * Envoie un SMS via SMSPool
 * @param {string} number - Numéro de téléphone (avec indicatif)
 * @param {string} message - Contenu du SMS
 * @param {string} country - Code pays (ex: "US", "FR")
 */
async function sendSMS(number, message, country = 'FR') {
  try {
    const response = await axios.post(`${BASE_URL}/sms/send`, null, {
      params: {
        key: SMSPOOL_API_KEY,
        number,
        message,
        country,
      },
    });
    return { success: true, data: response.data };
  } catch (err) {
    console.error('❌ SMSPool sendSMS error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Récupère le solde du compte SMSPool
 */
async function getBalance() {
  try {
    const response = await axios.get(`${BASE_URL}/request/balance`, {
      params: { key: SMSPOOL_API_KEY },
    });
    return { success: true, balance: response.data.balance || 0 };
  } catch (err) {
    console.error('❌ SMSPool getBalance error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Récupère un numéro temporaire pour recevoir un SMS (OTP)
 * @param {string} service - Code du service (ex: "discord", "instagram")
 * @param {string} country - Code pays
 */
async function getTemporaryNumber(service, country = 'FR') {
  try {
    const response = await axios.post(`${BASE_URL}/purchase/sms`, null, {
      params: {
        key: SMSPOOL_API_KEY,
        service,
        country,
      },
    });
    return { success: true, data: response.data };
  } catch (err) {
    let cleanError = err.message;
    if (err.response && err.response.data) {
      const data = err.response.data;
      if (data.type === 'PORTS_OCCUPIED') {
        cleanError = 'Tous les slots/lignes SMSPool sont actuellement occupés. Réessaye dans 2 à 5 minutes.';
      } else if (data.type === 'OUT_OF_STOCK') {
        cleanError = 'Rupture de stock temporaire pour Instagram (USA) chez SMSPool. Réessaye dans quelques minutes.';
      } else if (data.message) {
        cleanError = data.message.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
      } else if (data.errors && Array.isArray(data.errors)) {
        cleanError = data.errors.map(e => e.message).join(' | ');
      }
    }
    console.error('❌ SMSPool getTemporaryNumber error:', cleanError);
    return { success: false, error: cleanError };
  }
}

/**
 * Vérifie si un OTP a été reçu
 * @param {string} orderId - ID de la commande SMSPool
 */
async function checkSMS(orderId) {
  try {
    const response = await axios.get(`${BASE_URL}/sms/check`, {
      params: {
        key: SMSPOOL_API_KEY,
        orderid: orderId,
      },
    });
    return { success: true, data: response.data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Annule une commande SMS
 * @param {string} orderId - ID de la commande SMSPool
 */
async function cancelSMS(orderId) {
  try {
    const response = await axios.post(`${BASE_URL}/sms/cancel`, null, {
      params: {
        key: SMSPOOL_API_KEY,
        orderid: orderId,
      },
    });
    return { success: true, data: response.data };
  } catch (err) {
    if (err.response && err.response.data && err.response.data.message) {
      return { success: false, error: err.response.data.message };
    }
    return { success: false, error: err.message };
  }
}

module.exports = { sendSMS, getBalance, getTemporaryNumber, checkSMS, cancelSMS };
