module.exports = {
  apps: [
    {
      name: 'versus-api',
      script: 'server/index.js',
      instances: 1, // 1 instância para driver SQLite local; expansível para 'max' ao migrar para Supabase
      exec_mode: 'fork', // 'fork' para SQLite (WAL); alternar para 'cluster' com PostgreSQL
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        CORS_ORIGIN: 'https://*.vercel.app,http://localhost:3000,http://127.0.0.1:3000'
      },
      error_file: 'logs/err.log',
      out_file: 'logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 4000
    }
  ]
};
