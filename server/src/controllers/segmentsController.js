import db from '../config/database.js';

function removeAccents(str) {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function getSegments(req, res) {
  try {
    const segmentsStmt = db.prepare('SELECT id, name, icon, description FROM segments ORDER BY name ASC');
    const segments = segmentsStmt.all();

    const cnaesStmt = db.prepare('SELECT id, segment_id, cnae_code, cnae_description FROM segment_cnaes ORDER BY cnae_code ASC');
    const allCnaes = cnaesStmt.all();

    const result = segments.map(seg => {
      return {
        ...seg,
        cnaes: allCnaes.filter(c => c.segment_id === seg.id)
      };
    });

    res.json({ data: result });
  } catch (error) {
    console.error('Erro ao buscar segmentos:', error);
    res.status(500).json({ error: 'Falha ao buscar segmentos' });
  }
}

export function getCnaes(req, res) {
  try {
    const query = req.query.q || '';
    const stmt = db.prepare(`
      SELECT DISTINCT cnae_code, cnae_description, segment_id
      FROM segment_cnaes
      ORDER BY cnae_code ASC
    `);
    const allCnaes = stmt.all();

    let filtered = allCnaes;

    if (query.trim()) {
      const cleanQuery = removeAccents(query.trim());
      filtered = allCnaes.filter(item => {
        const cleanCode = removeAccents(item.cnae_code);
        const cleanDesc = removeAccents(item.cnae_description);
        return cleanCode.includes(cleanQuery) || cleanDesc.includes(cleanQuery);
      });
    }

    res.json({ data: filtered.slice(0, 50) });
  } catch (error) {
    console.error('Erro ao buscar CNAEs:', error);
    res.status(500).json({ error: 'Falha ao buscar CNAEs' });
  }
}
