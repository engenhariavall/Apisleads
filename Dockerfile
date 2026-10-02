# ==============================================================================
# PROJETO VERSUS / API LEADS — DOCKERFILE MULTI-STAGE DE PRODUÇÃO
# Base segura Alpine Linux, Node.js 20, usuário não-root (CIS Benchmark)
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Build & Dependências
# ------------------------------------------------------------------------------
FROM node:20-alpine AS dependencies

WORKDIR /usr/src/app

# Instala ferramentas necessárias para eventuais módulos nativos
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --only=production

# ------------------------------------------------------------------------------
# Stage 2: Runtime de Produção Leve & Seguro
# ------------------------------------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /usr/src/app

# Define ambiente de produção
ENV NODE_ENV=production
ENV PORT=3000

# Cria diretórios essenciais e ajusta permissões para usuário não-root
RUN mkdir -p /usr/src/app/data /usr/src/app/logs && \
    chown -R node:node /usr/src/app

# Copia dependências instaladas do stage anterior
COPY --from=dependencies --chown=node:node /usr/src/app/node_modules ./node_modules

# Copia o código da aplicação
COPY --chown=node:node package*.json ./
COPY --chown=node:node server ./server
COPY --chown=node:node client ./client
COPY --chown=node:node checklist.md ./checklist.md

# Alterna para o usuário não-privilegiado 'node'
USER node

# Porta padrão de escuta da aplicação
EXPOSE 3000

# Verificação de integridade e saúde automática do container
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Comando de inicialização otimizado
CMD ["node", "server/index.js"]
