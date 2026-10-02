import { buildApiUrl, fetchWithTimeout } from './config.js';

const fetchSafe = typeof fetchWithTimeout === 'function' ? fetchWithTimeout : fetch;

// Camada de comunicação com a API Leads
export async function fetchSegments() {
  const res = await fetchSafe('/api/segments', {}, 10000);
  if (!res.ok) throw new Error('Falha ao carregar segmentos');
  return res.json();
}

export async function fetchCnaes(query = '') {
  const res = await fetchSafe(`/api/cnaes?q=${encodeURIComponent(query)}`, {}, 10000);
  if (!res.ok) throw new Error('Falha ao carregar CNAEs');
  return res.json();
}

export async function fetchLocations() {
  const res = await fetchSafe('/api/locations', {}, 10000);
  if (!res.ok) throw new Error('Falha ao carregar localizações');
  return res.json();
}

export async function filterLeads(filters) {
  const res = await fetchSafe('/api/leads/filter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(filters)
  }, 10000);
  if (!res.ok) throw new Error('Falha ao filtrar leads');
  return res.json();
}

export async function exportLeads(exportPayload) {
  const res = await fetchSafe('/api/leads/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(exportPayload)
  }, 15000);
  if (!res.ok) throw new Error('Falha ao exportar leads');
  return res.blob();
}
