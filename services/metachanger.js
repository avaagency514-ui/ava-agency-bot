const axios = require('axios');
const path = require('path');
const fs = require('fs');

const MULTIMETA_URL = 'http://127.0.0.1:5000/api/process';

/**
 * Process a file using MultiMetaChanger API
 * @param {string} sourcePath - Absolute path to the downloaded file
 * @param {string} outputDir - Absolute path where the processed file should be saved
 * @param {boolean} isVideo - true if the file is a video
 * @returns {Promise<string>} - Absolute path to the output file
 */
async function processFile(sourcePath, outputDir, isVideo = false) {
  try {
    const payload = {
      source: sourcePath,
      output_dir: outputDir,
      copies: 1,
      exif: true,
      exif_profile: 'random',
      hash: true,
      strip_ai: true,
      video_reencode: false, // Copie rapide pour les vidéos
      hash_intensity: 0.5,
      captions_enabled: false
    };

    const response = await axios.post(MULTIMETA_URL, payload, { responseType: 'stream' });

    // The API returns a stream of JSON lines. We parse it to find the final status.
    return new Promise((resolve, reject) => {
      let lastFile = null;
      response.data.on('data', (chunk) => {
        const lines = chunk.toString().split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.status === 'done' && data.files && data.files.length > 0) {
              lastFile = data.files[0].name; // files[0] is an object { name, path, size }
            } else if (data.status === 'error') {
              return reject(new Error(data.message));
            }
          } catch (e) {
            // ignore non-json line
          }
        }
      });

      response.data.on('end', () => {
        if (lastFile) resolve(path.join(outputDir, lastFile));
        else reject(new Error('Aucun fichier généré par MultiMetaChanger'));
      });
    });
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      throw new Error('MultiMetaChanger n\'est pas lancé (port 5000). Veuillez démarrer le logiciel.');
    }
    throw error;
  }
}

module.exports = {
  processFile
};
