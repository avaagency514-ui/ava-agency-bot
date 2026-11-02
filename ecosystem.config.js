module.exports = {
  apps: [
    {
      name: 'ava-agency-bot',
      script: 'index.js',
      cwd: 'C:\\Users\\BOSS\\.gemini\\antigravity\\scratch\\ava-agency-bot',
      watch: false,
      autorestart: true,
      min_uptime: '10s',
      restart_delay: 2000,
      exp_backoff_restart_delay: 3000,
      max_memory_restart: '800M',
      env: {
        NODE_ENV: 'production',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: 'logs/error.log',
      out_file: 'logs/out.log',
      merge_logs: true,
    }
  ],
};
