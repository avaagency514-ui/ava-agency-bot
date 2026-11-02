const { getFileForProfile } = require('../services/drive');
const { processFile } = require('../services/metachanger');
const path = require('path');
const fs = require('fs');

async function main() {
  const profileId = process.argv[2];
  const market = process.argv[3] || 'FR';

  if (!profileId) {
    console.error("Usage: node farm_bridge_media.js <profileId> <market>");
    process.exit(1);
  }

  const outputDir = "C:\\Users\\BOSS\\Documents\\XuanZhi9\\Pictures";
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  // Clean output dir
  const files = fs.readdirSync(outputDir);
  for (const file of files) {
    if (file.endsWith('.jpg') || file.endsWith('.png') || file.endsWith('.mp4')) {
      try { fs.unlinkSync(path.join(outputDir, file)); } catch (e) {}
    }
  }

  try {
    const types = ['pp', 'reels', 'story'];
    const results = {};

    for (const type of types) {
      console.log(`[Node] Récupération de ${type}...`);
      const driveData = await getFileForProfile(type, profileId, market);
      const isVideo = ['reels'].includes(type);
      
      console.log(`[Node] MultiMetaChanger sur ${type}...`);
      const processedPath = await processFile(driveData.localPath, outputDir, isVideo);
      
      // Cleanup original drive download
      if (fs.existsSync(driveData.localPath)) fs.unlinkSync(driveData.localPath);
      
      results[type] = processedPath;
    }

    console.log("JSON_OUTPUT:" + JSON.stringify({ status: 'success', files: results }));
    process.exit(0);
  } catch (error) {
    console.log("JSON_OUTPUT:" + JSON.stringify({ status: 'error', message: error.message }));
    process.exit(1);
  }
}

main();
