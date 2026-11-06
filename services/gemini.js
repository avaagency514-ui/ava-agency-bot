const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const fs = require('fs');

let genAI = null;

function initGemini() {
  if (process.env.GEMINI_API_KEY && !genAI) {
    try {
      genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      console.log('✅ Gemini API (SDK direct) initialisé');
    } catch (e) {
      console.error('❌ Erreur lors de l\'initialisation de Gemini API:', e.message);
    }
  }
  return genAI;
}

const FREELLM_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-flash',
  'llama-3.3-70b-fp8-fast',
  'qwq-32b',
  'glm-4.7-flash',
  'mistral-small-3.1-24b',
  'llama-3.1-8b',
  'qwen3-30b-a3b-fp8',
];

const SDK_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-pro-preview',
  'gemini-flash-latest',
  'gemini-3.5-flash',
  'gemini-3.6-flash',
  'gemini-3.7-flash',
  'gemini-3.8-flash',
  'gemini-flash-lite-latest',
  'gemini-pro-latest',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite',
  'gemini-3.1-flash-lite-preview',
  'gemini-omni-1.1-flash',
  'gemini-omni-flash-preview',
  'antigravity-preview-latest'
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Tente la génération via l'API locale FreeLLM (http://127.0.0.1:31415/v1)
 */
async function generateViaFreeLLM(prompt) {
  const baseUrl = (process.env.FREELLM_API_URL || 'http://127.0.0.1:31415/v1').replace(/\/$/, '');
  const apiKey = process.env.FREELLM_API_KEY || 'freellmapi-37fb5da40d7ec8d677a46f59012bd81d7fe256a1327e7ddf';

  let lastError = null;

  for (const modelName of FREELLM_MODELS) {
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            {
              role: 'system',
              content: 'You are an expert social media copywriter. Output ONLY the rewritten text without surrounding commentary, markdown code blocks, or quotes.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7
        })
      });

      const data = await response.json();
      if (response.ok && data.choices && data.choices.length > 0 && data.choices[0].message?.content) {
        let text = data.choices[0].message.content.trim();
        // Nettoyer les blocs markdown ou guillemets superflus
        text = text.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
        text = text.replace(/^["']|["']$/g, '').trim();
        console.log(`🤖 FreeLLM API (${modelName}) -> Génération réussie`);
        return text;
      }

      const errMsg = data.error?.message || `HTTP ${response.status}`;
      lastError = new Error(errMsg);
      console.warn(`⚠️ FreeLLM modèle "${modelName}" indisponible: ${errMsg}. Tentative suivant...`);
    } catch (err) {
      lastError = err;
      console.warn(`⚠️ Erreur connexion FreeLLM (${modelName}): ${err.message}`);
    }
  }

  throw lastError || new Error("Serveur FreeLLM indisponible");
}

/**
 * Reformule un texte de base de manière unique (FreeLLM -> Fallback SDK Direct)
 */
async function generateUniqueText(baseText, type, market) {
  const language = market === 'US' ? 'English (US)' : 'French';

  // Prompt spécial pour Profil Texte (pseudo | nom) : garder le format exact
  const isProfilTexte = type === 'Profil Texte';
  const promptText = isProfilTexte
    ? `You are creating a unique Instagram username and first name for a ${language} female model/influencer account.
The original is: "${baseText}"
Your task: invent a COMPLETELY DIFFERENT and NEW pseudo and first name, following EXACTLY the same format: "pseudo : [new_pseudo] | nom : [new_firstname]"
Rules:
- The pseudo must be a real-looking Instagram username (lowercase, can use dots, underscores, numbers)
- The first name must be a real French female first name if language is French, or American if US
- DO NOT copy or slightly modify the original — create something entirely new
- Output ONLY the result in this exact format: pseudo : xxx | nom : xxx
- No explanation, no quotes, no other text.`
    : `You are a social media expert creating an Instagram account for the ${language} market.
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

  const prompt = promptText;

  // 1. Tenter d'abord via l'API locale FreeLLM (http://127.0.0.1:31415/v1)
  try {
    return await generateViaFreeLLM(prompt);
  } catch (freeLlmErr) {
    console.warn(`⚠️ FreeLLM API non disponible (${freeLlmErr.message}), bascule sur l'API Gemini Direct...`);
  }

  // 2. Fallback direct via Google Generative AI SDK
  if (!genAI) initGemini();
  if (!genAI) throw new Error("Gemini API non configurée.");

  let lastError = null;
  for (const modelName of SDK_MODELS) {
    let retries = 2; // on peut réessayer jusqu'à 2 fois pour les erreurs 503
    while (retries >= 0) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        let text = response.text().trim();

        text = text.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
        text = text.replace(/^["']|["']$/g, '').trim();

        return text;
      } catch (err) {
        lastError = err;
        console.warn(`⚠️ Modèle Gemini direct "${modelName}" error (${err.message})...`);
        
        if (err.message && err.message.includes('503') && retries > 0) {
          console.log(`🔄 Surcharge détectée, nouvelle tentative dans 2 secondes...`);
          await sleep(2000);
          retries--;
        } else {
          break; // passe au modèle suivant si ce n'est pas un 503 ou si on n'a plus d'essais
        }
      }
    }
  }

  throw new Error(`La génération a échoué via FreeLLM et Gemini direct: ${lastError?.message || 'Erreur inconnue'}`);
}

async function translateToEnglish(text) {
  const prompt = `You are a professional social media translator. Translate the following French Instagram text to natural, engaging English (US). 
Keep the original tone, humor, and style.
Do NOT add any explanations, surrounding text, or markdown formatting. Output ONLY the translated text.

Original text:
"""
${text}
"""`;

  try {
    return await generateViaFreeLLM(prompt);
  } catch (freeLlmErr) {
    console.warn(`⚠️ FreeLLM API non disponible pour traduction (${freeLlmErr.message}), bascule sur l'API Gemini Direct...`);
  }

  if (!genAI) initGemini();
  if (!genAI) throw new Error("Gemini API non configurée.");

  let lastError = null;
  for (const modelName of SDK_MODELS) {
    let retries = 2;
    while (retries >= 0) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        let outText = response.text().trim();
        outText = outText.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
        outText = outText.replace(/^["']|["']$/g, '').trim();
        return outText;
      } catch (err) {
        if (err.message && err.message.includes('503')) {
          retries--;
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
        lastError = err;
        break; 
      }
    }
  }
  throw lastError || new Error("La traduction a échoué via tous les modèles.");
}

/**
 * Reformule un texte pour Twitter / X (Bio ou Légende) via FreeLLM ou Gemini Direct
 */
async function generateTwitterText(baseText, type = 'bio') {
  let prompt = '';
  if (type === 'bio') {
    prompt = `You are an elite Twitter / X social media strategist and ghostwriter for an attractive female model/influencer account.
Here is an inspiration/reference bio:
"${baseText}"

Your task:
Write a COMPLETELY UNIQUE, engaging, and irresistible Twitter / X bio based on this inspiration.
CRITICAL RULES:
- Maximum 160 characters (strict Twitter limit).
- Tone: alluring, playful, mysterious, modern and stylish.
- Include 1 or 2 subtle matching emojis.
- Do NOT include hashtags or fake links unless present in the inspiration.
- Output ONLY the bio text itself. No commentary, no quotes, no markdown blocks.`;
  } else {
    // Caption / Tweet
    prompt = `You are an elite Twitter / X ghostwriter for a viral female model/influencer.
Here is an inspiration caption or tweet:
"${baseText}"

Your task:
Write a COMPLETELY UNIQUE, punchy, engaging tweet based on this idea.
CRITICAL RULES:
- Length: concise, punchy (between 1 and 3 lines max).
- Style: high-engagement, flirty, conversational, question or bold statement that triggers replies and retweets.
- Include 1 or 2 subtle emojis.
- Output ONLY the tweet text itself. No hashtags (or max 1 relevant), no quotes, no commentary, no markdown code blocks.`;
  }

  // 1. Tenter d'abord via l'API locale FreeLLM
  try {
    return await generateViaFreeLLM(prompt);
  } catch (freeLlmErr) {
    console.warn(`⚠️ FreeLLM API non disponible pour Twitter (${freeLlmErr.message}), bascule sur l'API Gemini Direct...`);
  }

  // 2. Fallback direct via Google Generative AI SDK
  if (!genAI) initGemini();
  if (!genAI) throw new Error("Gemini API non configurée.");

  let lastError = null;
  for (const modelName of SDK_MODELS) {
    let retries = 2;
    while (retries >= 0) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        let text = response.text().trim();

        text = text.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
        text = text.replace(/^["']|["']$/g, '').trim();

        // Si c'est une bio et dépasse 160 chars, tronquer proprement
        if (type === 'bio' && text.length > 160) {
          text = text.substring(0, 157) + '...';
        }

        return text;
      } catch (err) {
        lastError = err;
        if (err.message && err.message.includes('503') && retries > 0) {
          await sleep(2000);
          retries--;
        } else {
          break;
        }
      }
    }
  }

  throw new Error(`La génération Twitter a échoué: ${lastError?.message || 'Erreur inconnue'}`);
}

/**
 * Analyse une série d'images (frames) d'un Reel Instagram pour extraire l'accroche / texte incrusté
 * @param {Array<string>} framePaths - Chemins des images JPEG
 * @returns {Promise<string|null>} - Texte extrait ou null si aucun texte
 */
async function extractHookFromFramePaths(framePaths) {
  const prompt = `Tu es un assistant expert en transcription OCR pour des vidéos courtes (Instagram Reels, TikTok).
Ton unique mission est d'extraire fidèlement le texte principal (le hook / l'accroche / la légende incrustée) qui apparaît à l'écran sur cette vidéo.

RÈGLES IMPORTANTES :
1. Retranscris EXACTEMENT le texte incrusté mot pour mot, en conservant les majuscules, accents, ponctuation et emojis originaux.
2. Ignore totalement les boutons et icônes d'interface d'Instagram (le pseudo de la modèle, le bouton s'abonner, la barre de recherche, le compteur de likes, la musique en bas, etc.).
3. Ne transcris QUE la phrase ou question ou texte affiché au milieu/haut/bas de la vidéo qui s'adresse au spectateur (ex: "Pov : Je suis du signe...", "Quand t'es pas sur la même longueur d'onde 😂", "Ta daronne préf 🫦").
4. Si le texte est écrit sur plusieurs lignes, conserve les retours à la ligne.
5. Réponds UNIQUEMENT avec le texte extrait. Ne mets PAS de guillemets autour, AUCUN commentaire introductif (ne dis pas "Voici le texte :"), AUCUN bloc de code markdown.
6. Si absolument aucun texte ou phrase n'est incrusté dans la vidéo, réponds exactement : AUCUN_TEXTE`;

  const parts = [{ text: prompt }];

  for (const imgPath of framePaths) {
    try {
      if (fs.existsSync(imgPath)) {
        const imgBuffer = fs.readFileSync(imgPath);
        parts.push({
          inlineData: {
            mimeType: 'image/jpeg',
            data: imgBuffer.toString('base64')
          }
        });
      }
    } catch (e) {
      console.warn(`⚠️ Impossible de charger la frame ${imgPath}:`, e.message);
    }
  }

  if (parts.length <= 1) {
    throw new Error("Aucune image valide fournie pour l'analyse.");
  }

  if (!genAI) initGemini();
  if (!genAI) throw new Error("Gemini API non configurée.");

  // Modèles supportant les images / vision
  const visionModels = ['gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-flash-latest'];
  let lastError = null;

  for (const modelName of visionModels) {
    let retries = 2;
    while (retries >= 0) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(parts);
        const response = await result.response;
        let text = response.text().trim();

        text = text.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
        text = text.replace(/^["']|["']$/g, '').trim();

        if (text === 'AUCUN_TEXTE' || text.toUpperCase() === 'AUCUN_TEXTE' || text === 'AUCUN TEXTE') {
          return null;
        }

        return text;
      } catch (err) {
        lastError = err;
        console.warn(`⚠️ Modèle Vision direct "${modelName}" error (${err.message})...`);
        if (err.message && err.message.includes('503') && retries > 0) {
          await sleep(2000);
          retries--;
        } else {
          break;
        }
      }
    }
  }

  throw new Error(`L'analyse OCR a échoué via tous les modèles: ${lastError?.message || 'Erreur inconnue'}`);
}

/**
 * Reformule et sublime une annonce brute avec l'IA (Gemini)
 * Structure les phases, ajoute du gras, des emojis et une mise en page moderne
 * @param {string} rawText - Texte brut rédigé par l'utilisateur
 * @param {string} [titleHint] - Indication ou titre optionnel
 * @returns {Promise<{ title: string, badge: string, content: string }>}
 */
async function formatAnnouncementWithAI(rawText, titleHint = '') {
  const prompt = `Tu es le directeur de la communication et de l'excellence opérationnelle d'AVA Agency.
Ton rôle est de transformer le texte brut ci-dessous en un post d'annonce Discord MAGNIFIQUE, moderne, aéré, captivant et ultra professionnel.

RÈGLES CRUCIALES DE MISE EN FORME DISCORD :
1. Structure & Hiérarchie : utilise des titres Markdown de section (ex: ### 🚀 Titre de section, ### 📌 Étape 1 : ...), des puces aérées (•, ➡️, 🔹) et des séparateurs visuels légers (---).
2. Clarté & Emphase : mets en valeur les mots-clés importants, chiffres, deadlines et consignes en **gras**.
3. Émojis modernes : utilise des émojis pertinents et professionnels pour guider l'œil sans surcharger.
4. INTÉGRITÉ ABSOLUE DES DONNÉES : ne supprime AUCUNE consigne, aucun pseudo de modèle, aucun lien, aucun salon Discord (#...), aucun chiffre. Tout ce qui est technique ou opérationnel DOIT être conservé avec exactitude.
5. Si le texte détaille des phases ou un protocole (guide/SOP/warm-up) : organise-le de façon claire et méthodique avec des étapes bien découpées.
6. Tu DOIS répondre STRICTEMENT au format JSON valide suivant, SANS balises markdown \`\`\`json ou explications autour :
{
  "title": "TITRE COURT ET PERCUTANT EN MAJUSCULES (max 70 caractères)",
  "badge": "BADGE / THÈME COURT (ex: GUIDE OPÉRATIONNEL • PROTOCOLE)",
  "content": "Contenu complet réorganisé et sublimé pour Discord"
}

${titleHint ? `Indication de titre souhaité : "${titleHint}"\n` : ''}
Texte brut à sublimer :
"""
${rawText}
"""`;

  if (!genAI) initGemini();
  if (!genAI) throw new Error("Gemini API non configurée.");

  const models = [
    'gemini-3.5-flash-lite',
    'gemini-flash-lite-latest',
    'gemini-3.1-flash-lite',
    'gemini-3.6-flash',
    'gemini-3.7-flash',
    'gemini-3.5-flash',
    'gemini-3.8-flash',
    'gemini-flash-latest'
  ];
  let lastError = null;

  for (const modelName of models) {
    let retries = 1;
    while (retries >= 0) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        let text = response.text().trim();

        text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

        try {
          const parsed = JSON.parse(text);
          if (parsed.content) {
            return {
              title: parsed.title || titleHint || 'COMMUNIQUÉ OFFICIEL',
              badge: parsed.badge || 'COMMUNICATION INTERNE',
              content: parsed.content
            };
          }
        } catch (jsonErr) {
          return {
            title: titleHint || 'COMMUNIQUÉ OFFICIEL',
            badge: 'COMMUNICATION INTERNE',
            content: text
          };
        }

      } catch (err) {
        lastError = err;
        console.warn(`⚠️ Modèle Format AI "${modelName}" error (${err.message})...`);
        if (err.message && err.message.includes('503') && retries > 0) {
          await sleep(2000);
          retries--;
        } else {
          break;
        }
      }
    }
  }

  console.warn(`⚠️ Tous les modèles Gemini ont échoué (${lastError?.message}), application du formatage local...`);
  return formatAnnouncementFallback(rawText, titleHint);
}

/**
 * Formatage algorithmique local de secours si les quotas IA sont épuisés
 */
function formatAnnouncementFallback(rawText, titleHint = '') {
  if (!rawText) return null;
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const detectedTitle = titleHint || (lines.length > 0 ? lines[0].replace(/^[#* \-_]+|[#* \-_]+$/g, '').slice(0, 70).toUpperCase() : 'COMMUNIQUÉ OFFICIEL');

  let formatted = rawText
    .replace(/^[-*•]\s+/gm, '🔹 ')
    .replace(/^(Phase\s+\d+|Étape\s+\d+|Partie\s+\d+|Module\s+\d+)\s*[:\-]\s*(.*)$/gmi, '\n### 📌 $1 : $2\n')
    .replace(/^([A-Z]|\d+)\.\s+([^\n]+)$/gm, '\n### 🚀 $1. $2\n')
    .replace(/\b(Important|Obligatoire|Attention|Interdiction formelle|Règle d'Or|Palier de déblocage|Deadline|Warm-up)\b/gi, '**$1**')
    .trim();

  return {
    title: detectedTitle,
    badge: 'GUIDE OPÉRATIONNEL • PROTOCOLE',
    content: formatted
  };
}

module.exports = { initGemini, generateUniqueText, translateToEnglish, generateTwitterText, extractHookFromFramePaths, formatAnnouncementWithAI, formatAnnouncementFallback };
