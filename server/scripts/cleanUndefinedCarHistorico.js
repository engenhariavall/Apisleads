/**
 * server/scripts/cleanUndefinedCarHistorico.js
 * 
 * Script de higienização do acervo histórico do CAR no SQLite:
 * Corrige registros onde o primeiro nome foi gravado como 'undefined'
 * devido ao shift de 32-bits com sinal (hashNum >> 4).
 * Preserva o sobrenome/família existente e calcula o primeiro nome determinístico.
 */

import crypto from 'crypto';
import db from '../src/config/database.js';
import { AGRO_FAMILY_REGISTRY_BY_HUB } from '../src/services/carHistoricalService.js';

console.log('🧹 [CAR SANITIZER] Iniciando varredura e higienização de titulares com "undefined"...');

const DEFAULT_PREFIXOS = [
  'VALDOMIRO', 'NESTOR JOÃO', 'LEOMIR', 'DARCI', 'GILBERTO', 'CLÁUDIO', 'IVO',
  'FERNANDO', 'ODIRLEI', 'ERNANI', 'JAIME', 'ADELAR', 'RENATO', 'ANTÔNIO CARLOS',
  'ALTAIR', 'LUIZ CARLOS', 'MARCOS', 'PAULO', 'ROBERTO', 'JOSÉ'
];

try {
  // 1. car_proprietarios_historico
  const badRows = db.prepare(`
    SELECT codigo_car, nome_proprietario, uf, municipio
    FROM car_proprietarios_historico
    WHERE nome_proprietario LIKE '%undefined%'
  `).all();

  console.log(`🔍 Encontrados ${badRows.length} registros com "undefined" em car_proprietarios_historico.`);

  const updateStmt = db.prepare(`
    UPDATE car_proprietarios_historico
    SET nome_proprietario = ?, updated_at = CURRENT_TIMESTAMP
    WHERE codigo_car = ?
  `);

  let countFixed = 0;
  db.exec('BEGIN TRANSACTION');
  try {
    for (const row of badRows) {
      const codigoCar = row.codigo_car;
      const uf = String(row.uf || (codigoCar.length >= 2 ? codigoCar.slice(0, 2) : 'RS')).toUpperCase().trim();
      const hubData = AGRO_FAMILY_REGISTRY_BY_HUB[uf] || AGRO_FAMILY_REGISTRY_BY_HUB['RS'];
      const prefixos = (Array.isArray(hubData?.prefixosNome) && hubData.prefixosNome.length > 0)
        ? hubData.prefixosNome
        : DEFAULT_PREFIXOS;

      const hash = crypto.createHash('sha256').update(codigoCar).digest('hex');
      const hashNum = parseInt(hash.slice(0, 8), 16);
      const prefixoIndex = Math.abs(hashNum >>> 4) % prefixos.length;
      const prefixoEscolhido = prefixos[prefixoIndex] || DEFAULT_PREFIXOS[0];

      // Remove "undefined" e extrai o sobrenome existente
      let sobrenome = String(row.nome_proprietario || '').replace(/undefined/gi, '').trim();
      if (!sobrenome) {
        const familias = (Array.isArray(hubData?.familias) && hubData.familias.length > 0)
          ? hubData.familias
          : ['SILVA'];
        sobrenome = familias[Math.abs(hashNum) % familias.length];
      }

      const novoNome = `${prefixoEscolhido} ${sobrenome}`.replace(/\s+/g, ' ').trim();
      updateStmt.run(novoNome, codigoCar);
      countFixed++;
    }
    db.exec('COMMIT');
  } catch (txErr) {
    db.exec('ROLLBACK');
    throw txErr;
  }

  // 2. Verifica se sobrou algum
  const remaining = db.prepare(`
    SELECT count(*) as total
    FROM car_proprietarios_historico
    WHERE nome_proprietario LIKE '%undefined%'
  `).get();
  console.log(`📊 Restantes com "undefined" em car_proprietarios_historico: ${remaining.total}`);

  // 3. Sincroniza propriedades_rurais se houver registros vinculados com undefined
  const badProps = db.prepare(`
    SELECT id, nome_titular, codigo_car
    FROM propriedades_rurais
    WHERE nome_titular LIKE '%undefined%'
  `).all();
  console.log(`🔍 Encontradas ${badProps.length} propriedades rurais com "undefined" no nome_titular.`);

  if (badProps.length > 0) {
    const updatePropStmt = db.prepare(`
      UPDATE propriedades_rurais
      SET nome_titular = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    let propsFixed = 0;
    db.exec('BEGIN TRANSACTION');
    try {
      for (const p of badProps) {
        let cleanNome = String(p.nome_titular || '').replace(/undefined/gi, '').trim();
        if (p.codigo_car) {
          const hist = db.prepare('SELECT nome_proprietario FROM car_proprietarios_historico WHERE codigo_car = ? LIMIT 1').get(p.codigo_car);
          if (hist && hist.nome_proprietario) {
            cleanNome = hist.nome_proprietario;
          }
        }
        if (!cleanNome) cleanNome = 'PRODUTOR RURAL';
        updatePropStmt.run(cleanNome, p.id);
        propsFixed++;
      }
      db.exec('COMMIT');
      console.log(`✅ ${propsFixed} propriedades rurais corrigidas.`);
    } catch (pErr) {
      db.exec('ROLLBACK');
      throw pErr;
    }
  }

  // Amostra de validação dos registros corrigidos
  const sampleScortegagna = db.prepare(`
    SELECT codigo_car, nome_proprietario, uf, municipio
    FROM car_proprietarios_historico
    WHERE nome_proprietario LIKE '%SCORTEGAGNA%'
    LIMIT 3
  `).all();
  console.log('✨ Amostra de registros SCORTEGAGNA após correção:', sampleScortegagna);

} catch (err) {
  console.error('❌ Erro na higienização:', err);
  process.exit(1);
}
