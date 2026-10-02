/**
 * client/sw.js
 * 
 * FASE 25 — ETAPA 4: SERVICE WORKER CORPORATIVO OFFLINE-READY
 * 
 * Ciclo de Vida:
 * - install: cache de recursos da casca do app (App Shell) e skipWaiting()
 * - activate: expurgo de caches legados via caches.keys() e clients.claim()
 * - fetch: estratégia híbrida:
 *     - Chamadas de API (/api/*) e tiles/geocoding (nominatim/openstreetmap/mapbox/tile):
 *       NUNCA CACHEAR -> Network-Only (com resiliência no cliente).
 *     - Assets estáticos (HTML, CSS, JS, Fonts, Imagens/Ícones):
 *       Stale-While-Revalidate para velocidade máxima e funcionamento offline.
 */

const CACHE_NAME = 'versus-pwa-v1.0.0';

// Casca principal da aplicação (App Shell)
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/relatorio',
  '/relatorio.html',
  '/manifest.json',
  '/css/reset.css?v=1.0.0',
  '/css/styles.css?v=1.0.0',
  '/css/relatorio.css?v=1.0.0',
  '/js/config.js?v=1.0.0',
  '/js/app.js?v=1.0.0',
  '/js/relatorio.js?v=1.0.0',
  '/js/mapEngine.js?v=1.0.0',
  '/assets/icons/favicon.svg',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png'
];

// Instalação do Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Adiciona ativos com tolerância a falhas individuais
      return Promise.allSettled(
        STATIC_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn(`[SW] Aviso ao pré-carregar ${url}:`, err.message);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// Ativação do Service Worker e limpeza de versões obsoletas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name.startsWith('versus-pwa-'))
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Interceptação de requisições de rede
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Apenas requisições GET são gerenciadas pelo Service Worker
  if (req.method !== 'GET') {
    return;
  }

  // ISOLAMENTO RÍGIDO DE API E MAPAS DINÂMICOS:
  // NUNCA cachear /api/, endpoints analíticos ou tiles cartográficos de terceiros
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/health') ||
    url.hostname.includes('nominatim.openstreetmap.org') ||
    url.hostname.includes('tile.openstreetmap.org') ||
    url.hostname.includes('basemaps.cartocdn.com') ||
    url.hostname.includes('brasilapi.com.br') ||
    url.hostname.includes('minhareceita.org')
  ) {
    // Network-Only puro sem intervenção do cache
    return;
  }

  // Estratégia Stale-While-Revalidate para a casca da aplicação e ativos estáticos
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cachedResponse = await cache.match(req);

      // Dispara busca na rede em segundo plano para manter o cache atualizado
      const fetchPromise = fetch(req)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            cache.put(req, networkResponse.clone());
          }
          return networkResponse;
        })
        .catch(() => {
          // Se estiver offline e não houver resposta de rede, fallback gracioso
          return cachedResponse;
        });

      // Retorna imediatamente o cache se existir, ou espera a rede
      return cachedResponse || fetchPromise;
    })
  );
});
