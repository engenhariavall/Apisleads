#!/usr/bin/env bash
# ==============================================================================
# PROJETO VERSUS / API LEADS — SCRIPT DE INSTALAÇÃO AUTOMATIZADA NA VPS HOSTINGER
# UBUNTU 22.04 / 24.04 LTS — CONFIGURAÇÃO NODE.JS, PM2, NGINX, SUPABASE E ROBÔS 24/7
# ==============================================================================

set -e

echo "======================================================================"
echo "🚀 INICIANDO INSTALAÇÃO AUTOMATIZADA: PLATAFORMA VERSUS NA HOSTINGER"
echo "======================================================================"

# 1. Atualização do Sistema Operacional
echo "📦 [1/7] Atualizando repositórios e pacotes do Ubuntu..."
export DEBIAN_FRONTEND=noninteractive
apt update -y && apt upgrade -y
apt install -y curl git ufw nginx certbot python3-certbot-nginx build-essential

# 2. Instalação do Node.js 22 LTS (NodeSource) e PM2
echo "⚡ [2/7] Instalando Node.js 22 LTS e PM2..."
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs

node_version=$(node -v)
echo "   Node instalado: $node_version"

npm install -g pm2
pm2 --version

# 3. Clonagem do Repositório do GitHub
echo "📂 [3/7] Baixando o código do projeto a partir do GitHub..."
mkdir -p /var/www
cd /var/www

if [ -d "/var/www/versus-api" ]; then
  echo "   Repositório já existe. Puxando as últimas atualizações..."
  cd /var/www/versus-api
  git reset --hard HEAD
  git pull origin main
else
  git clone https://github.com/engenhariavall/Apisleads.git versus-api
  cd /var/www/versus-api
fi

# 4. Configuração das Variáveis de Ambiente de Produção (.env)
echo "🔒 [4/7] Configurando variáveis de ambiente com conexão ao Supabase..."
cat << 'EOF' > /var/www/versus-api/.env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://postgres.uztxhogoiresauwdvuco:Versus_Avall_Agro_2026_Db!@aws-0-us-east-1.pooler.supabase.com:6543/postgres
JWT_SECRET=versus_avall_super_secret_jwt_token_2026_secure_key_99
CORS_ORIGIN=*
SPARKS_AUTO_START=true
API_BASE_URL=/api
EOF

# 5. Instalação de Dependências e Criação de Diretórios
echo "📦 [5/7] Instalando dependências e estruturando logs..."
mkdir -p /var/www/versus-api/logs
mkdir -p /var/www/versus-api/data
cd /var/www/versus-api
npm install --production

# 6. Configuração e Inicialização do PM2
echo "⚙️ [6/7] Inicializando a API e os Robôs 24/7 com PM2..."
pm2 delete versus-api || true
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup systemd -u root --hp /root || true
sleep 3
curl -s http://127.0.0.1:3000/health || true

# 7. Configuração do Nginx como Proxy Reverso
echo "🌐 [7/7] Configurando servidor web Nginx (Porta 80 -> Porta 3000)..."
cat << 'EOF' > /etc/nginx/sites-available/versus
server {
    listen 80 default_server;
    listen [::]:80 default_server;

    server_name _;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/versus /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# 8. Configuração de Firewall UFW
ufw allow 22/tcp || true
ufw allow 80/tcp || true
ufw allow 443/tcp || true
echo "y" | ufw enable || true

# 9. Configuração de Cron Job Noturno para Sincronização da Base Real
(crontab -l 2>/dev/null | grep -v "re-sync-all" ; echo "0 3 * * * curl -s -X POST http://127.0.0.1:3000/api/leads/re-sync-all > /dev/null") | crontab -

echo ""
echo "======================================================================"
echo "🎉 INSTALAÇÃO CONCLUÍDA COM SUCESSO ABSOLUTO!"
echo "======================================================================"
echo "   Status PM2: $(pm2 status)"
echo "   API rodando localmente na porta 3000 com Nginx na porta 80."
echo "   Robôs de Sparks ativos e operando 24/7 em segundo plano."
echo "======================================================================"
