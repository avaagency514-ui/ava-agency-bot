module.exports = {
  apps: [
    {
      name: 'ava-agency-bot',
      script: 'index.js',
      cwd: 'C:\\Users\\BOSS\\.gemini\\antigravity\\scratch\\ava-agency-bot',
      watch: false,
      restart_delay: 5000,
      max_restarts: 10,
      autorestart: true,
      env: {
        NODE_ENV: 'production',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: 'logs/error.log',
      out_file: 'logs/out.log',
      merge_logs: true,
    },
    {
      name: 'multi-meta-changer',
      script: 'app.py',
      cwd: 'C:\\Users\\BOSS\\.gemini\\antigravity\\scratch\\multimetachanger',
      interpreter: 'C:\\Users\\BOSS\\.gemini\\antigravity\\scratch\\multimetachanger\\venv\\Scripts\\pythonw.exe',
      watch: false,
      restart_delay: 5000,
      autorestart: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: '../ava-agency-bot/logs/meta-error.log',
      out_file: '../ava-agency-bot/logs/meta-out.log',
    }
  ],
};
