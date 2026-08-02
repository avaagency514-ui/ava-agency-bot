require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const credentials = JSON.parse(fs.readFileSync(path.join(__dirname, 'credentials.json'), 'utf8'));
const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/drive'] });
const drive = google.drive({ version: 'v3', auth });
drive.files.list({
  q: `'${process.env.GOOGLE_DRIVE_FOLDER_ID}' in parents AND trashed = false AND mimeType = 'application/vnd.google-apps.folder'`,
  fields: 'files(id, name)'
}).then(res => console.log(JSON.stringify(res.data.files, null, 2))).catch(console.error);
