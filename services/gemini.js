const { GoogleGenerativeAI } = require('@google/generative-ai');

let genAI = null;

function initGemini() {
  if (process.env.GEMINI_API_KEY && !genAI) {
    try {
      genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      console.log('✅ Gemini API initialisé');
    } catch (e) {
      console.error('❌ Erreur lors de l\'initialisation de Gemini API:', e.message);
    }
  }
  return genAI;
}

const CANDIDATE_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-2.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-2.5-pro'
];

/**
 * Prend un texte de base (issu du Google Sheet) et demande à Gemini de le reformuler de manière unique.
 * @param {string} baseText Le texte d'origine
 * @param {string} type Le type de texte ('Bio', 'Story CTA', 'Profil')
 * @param {string} market 'FR' ou 'US' pour orienter la langue
 * @returns {Promise<string>} Le texte généré 100% unique
 */
async function generateUniqueText(baseText, type, market) {
  if (!genAI) initGemini();
  if (!genAI) throw new Error("Gemini API non configurée.");

  const language = market === 'US' ? 'English (US)' : 'French';

  const prompt = `You are a social media expert creating an Instagram account for the ${language} market.
I will give you an original text for a "${type}".
Your task is to rewrite it to be 100% unique so that no two accounts ever look exactly the same.
Keep the original meaning, intent, and tone.
Make it sound natural and engaging in ${language}.
Do NOT output any explanations, markdown formatting, or surrounding text. Output ONLY the generated rewritten text.

Original text:
"""
${baseText}
"""
`;

  let lastError = null;

  for (const modelName of CANDIDATE_MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      let text = response.text().trim();

      // Nettoyer les guillemets ou blocs markdown superflus si l'IA en ajoute
      text = text.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
      text = text.replace(/^["']|["']$/g, '').trim();

      return text;
    } catch (err) {
      lastError = err;
      console.warn(`⚠️ Modèle Gemini "${modelName}" indisponible ou erreur (${err.message}). Tentative avec le modèle suivant...`);
      // Petit délai avant de basculer sur le modèle de secours
      await new Promise(resolve => setTimeout(resolve, 600));
    }
  }

  console.error(`❌ Tous les modèles Gemini ont échoué (${type}):`, lastError?.message);
  throw new Error(`La génération Gemini a échoué après plusieurs tentatives: ${lastError?.message || 'Erreur inconnue'}`);
}

module.exports = { initGemini, generateUniqueText };
