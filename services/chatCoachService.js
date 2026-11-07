/**
 * Chatting & Seduction Coach Service - AVA Agency
 * Basé sur FreeLLM + Fallback Gemini Direct et la formation Notion AVA Agency
 */

const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { CHATTING_KNOWLEDGE } = require('./chatCoachKnowledge');

let genAI = null;

function getGeminiClient() {
  if (process.env.GEMINI_API_KEY && !genAI) {
    try {
      genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    } catch (e) {
      console.error('Erreur init Gemini SDK:', e.message);
    }
  }
  return genAI;
}

const COACH_SYSTEM_PROMPT = `
Tu es le Coach d'Élite en Chatting & Séduction de l'agence AVA Agency.
Ton rôle est d'analyser les captures d'écran et les messages de conversation entre nos chatteurs et les fans (OnlyFans / MYM / Telegram / Fansly), et de donner aux chatteurs les MEILLEURES réponses pour séduire, créer de la tension, fidéliser et maximiser les ventes de médias payants (PPV, Sextapes, Customs, Pourboires).

Voici la FORMATION OFFICIELLE ET OBLIGATOIRE DE L'AGENCE sur laquelle tu dois te baser scrupuleusement :
${CHATTING_KNOWLEDGE}

RÈGLES D'OR DE TES SUGGESTIONS DE RÉPONSE :
1. TON DE LA MODÈLE :
   - Fille étudiante, naturelle, bienveillante, sensuelle, taquine, complice ("good vibe").
   - Toujours commencer par une Majuscule.
   - Utiliser des expressions vivantes : "heyy", "ouii", "hihi", "mdrrr", "doudou", "mon cœur", "bébé".
   - INTERDICTION : Jamais d'émojis ringards comme "😈🔥" dans le relationnel. Utiliser plutôt 🥰, 😘, 🫣, 👀, 🥺, 🙈, 🤭.
   - Ne jamais faire de réponses froides ou plates comme "ca va et toi ?". Toujours relancer.

2. ADAPTATION À LA LANGUE DU FAN :
   - Détecte la langue parlée par le fan (Français 🇫🇷 en priorité, Anglais 🇺🇸, ou Espagnol 🇪🇸).
   - Les 3 suggestions de message DOIVENT ÊTRE RÉDIGÉES DANS LA LANGUE DU FAN (avec le bon argot et le bon naturel).
   - Les explications/analyses pour le chatteur restent en français.

3. STRUCTURE DE TA RÉPONSE :
Tu dois impérativement répondre avec cette structure exacte (format Markdown soigné) :

### 🎯 DIAGNOSTIC DU PROSPECT
- **Profil estimé** : [Baleine 🐳 | Spender 💸 | Petit Spender 💳 | Time Waster ⌛ | Amoureux 🧡 | Inconnu]
- **Température & État** : [Chaud & Excité 🔥 | Hésitant / Doute 🧊 | Bloqué sur le prix 💰 | Curieux / Flirt 🫦 | Force pour du réel 🛑 | Gratteur de gratuit ⛔]
- **Langue détectée** : [Français 🇫🇷 | Anglais 🇺🇸 | Espagnol 🇪🇸]
- **Conseil tactique** : [1 ou 2 phrases concrètes pour guider le chatteur sur la psychologie du moment]

---

### 💬 SUGGESTIONS DE RÉPONSES (Prêtes à copier)

**Option 1 : 🫦 Accroche & Teasing (Créer le désir / Tension)**
\`\`\`text
[Message prêt à copier dans la langue du fan]
\`\`\`
*Pourquoi ça marche : [Brève explication psychologique]*

**Option 2 : ❤️ Connexion GFE & Émotionnelle (Fidélisation / Complice)**
\`\`\`text
[Message prêt à copier dans la langue du fan]
\`\`\`
*Pourquoi ça marche : [Brève explication psychologique]*

**Option 3 : 💰 Hard Closing & Push Vente (Script officiel de conversion)**
\`\`\`text
[Message prêt à copier dans la langue du fan avec technique Notion : Cadeau / Chouinage / Baisse de prix]
\`\`\`
*Pourquoi ça marche : [Brève explication psychologique]*
`;

/**
 * Analyse une capture d'écran ou un texte de conversation
 * @param {Object} options
 * @param {Buffer|string} [options.imageBase64] Données image en base64
 * @param {string} [options.mimeType] Type MIME (image/png, image/jpeg, etc.)
 * @param {string} [options.textContent] Texte de la conversation si fourni
 * @param {string} [options.angle] Angle optionnel demandé par bouton (ex: 'objection', 'hot', 'aggressive')
 */
async function analyzeChatting({ imageBase64, mimeType = 'image/png', textContent, angle = 'standard' }) {
  const freeLlmKey = process.env.FREELLM_API_KEY || 'freellmapi-37fb5da40d7ec8d677a46f59012bd81d7fe256a1327e7ddf';
  const freeLlmUrl = (process.env.FREELLM_API_URL || 'http://127.0.0.1:31415/v1').replace(/\/$/, '');

  let userPrompt = "Voici la conversation à analyser. Identifie les messages du fan et de la modèle, et propose les 3 meilleures réponses selon les consignes AVA Agency :\n\n";

  if (textContent) {
    userPrompt += `=== TRANSCRIPTION / TEXTE DU CHAT ===\n${textContent}\n\n`;
  }

  if (angle === 'objection') {
    userPrompt += "⚠️ ATTENTION : Le fan a une objection (prix trop cher, demande à voir en réel, demande du gratuit, ou demande snap). Applique scrupuleusement les scripts anti-objection Notion !\n";
  } else if (angle === 'hot') {
    userPrompt += "🌶️ ANGLE DEMANDÉ : Fais monter la température d'un cran ! Sexualisation poussée, tension érotique et teasing irrésistible.\n";
  } else if (angle === 'aggressive') {
    userPrompt += "💰 ANGLE DEMANDÉ : Closing direct et pressant ! Le fan doit acheter ce média maintenant (utilise le chouinage ou le bonus exclusif promis).\n";
  }

  // 1. Tenter FreeLLM avec timeout court (6s) pour réactivité maximale
  const freeLlmModels = ['gemini-3.5-flash-lite', 'gemini-flash-lite', 'gemini-3.5-flash'];
  for (const model of freeLlmModels) {
    try {
      const messages = [
        { role: 'system', content: COACH_SYSTEM_PROMPT }
      ];

      if (imageBase64) {
        messages.push({
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } }
          ]
        });
      } else {
        messages.push({
          role: 'user',
          content: userPrompt
        });
      }

      const res = await fetch(`${freeLlmUrl}/chat/completions`, {
        method: 'POST',
        signal: AbortSignal.timeout(6000),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${freeLlmKey}`,
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify({
          model: model,
          messages: messages,
          temperature: 0.7
        })
      });

      const data = await res.json();
      if (res.ok && data.choices && data.choices[0]?.message?.content) {
        return data.choices[0].message.content.trim();
      }
    } catch (err) {
      console.warn(`FreeLLM (${model}) indisponible: ${err.message}.`);
    }
  }

  // 2. Fallback Google Generative AI SDK Direct (ultra rapide, <2s)
  const sdk = getGeminiClient();
  if (sdk) {
    const sdkModels = ['gemini-1.5-flash-latest', 'gemini-2.0-flash-exp', 'gemini-1.5-flash'];
    for (const modelName of sdkModels) {
      try {
        const geminiModel = sdk.getGenerativeModel({
          model: modelName,
          systemInstruction: COACH_SYSTEM_PROMPT
        });

        const parts = [userPrompt];
        if (imageBase64) {
          parts.push({
            inlineData: {
              data: imageBase64,
              mimeType: mimeType
            }
          });
        }

        const result = await geminiModel.generateContent(parts);
        const response = await result.response;
        if (response && response.text()) {
          return response.text().trim();
        }
      } catch (sdkErr) {
        console.warn(`Gemini SDK Direct (${modelName}) erreur: ${sdkErr.message}`);
      }
    }
  }

  throw new Error("Impossible d'analyser la conversation via FreeLLM ou Gemini.");
}

module.exports = {
  analyzeChatting
};
