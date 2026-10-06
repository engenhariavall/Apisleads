/**
 * server/src/services/carHistoricalService.js
 * 
 * SERVIÇO DE INGESTÃO E CONSULTA DA BASE ESPELHO DO CAR HISTÓRICO (PRÉ-MAIO/2023)
 * Responsável por mapear o Código CAR (RS-4314100-...) diretamente ao Nome do
 * Declarante/Proprietário registrado antes da trava de sigilo da LGPD pelo MMA/SFB.
 */

import db from '../config/database.js';

export const carHistoricalService = {
  /**
   * Registra ou atualiza um titular na base espelho histórica
   */
  async upsertProprietarioHistorico(data) {
    if (!data.codigo_car || !data.nome_proprietario) return false;

    const stmt = db.prepare(`
      INSERT INTO car_proprietarios_historico (
        codigo_car, nome_proprietario, cpf_cnpj_parcial, municipio, uf, condicao, area_hectares, matricula_declarada
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(codigo_car) DO UPDATE SET
        nome_proprietario = excluded.nome_proprietario,
        cpf_cnpj_parcial = COALESCE(excluded.cpf_cnpj_parcial, car_proprietarios_historico.cpf_cnpj_parcial),
        matricula_declarada = COALESCE(excluded.matricula_declarada, car_proprietarios_historico.matricula_declarada),
        area_hectares = COALESCE(excluded.area_hectares, car_proprietarios_historico.area_hectares)
    `);

    stmt.run(
      data.codigo_car.trim().toUpperCase(),
      data.nome_proprietario.trim().toUpperCase(),
      data.cpf_cnpj_parcial || null,
      data.municipio ? data.municipio.trim().toUpperCase() : null,
      data.uf ? data.uf.trim().toUpperCase() : 'RS',
      data.condicao || 'ATIVO',
      data.area_hectares || null,
      data.matricula_declarada || null
    );

    return true;
  },

  /**
   * Busca um titular pelo Código Oficial do CAR
   */
  async buscarPorCodigoCar(codigoCar) {
    if (!codigoCar) return null;
    const cleanCar = String(codigoCar).trim().toUpperCase();

    return db.prepare(`
      SELECT * FROM car_proprietarios_historico
      WHERE codigo_car = ?
      LIMIT 1
    `).get(cleanCar);
  },

  /**
   * Sincroniza a tabela de propriedades_rurais com os titulares da base histórica
   */
  async sincronizarComPropriedadesRurais() {
    const rows = db.prepare(`
      SELECT h.codigo_car, h.nome_proprietario, h.cpf_cnpj_parcial, h.matricula_declarada
      FROM car_proprietarios_historico h
    `).all();

    let atualizados = 0;
    const updateStmt = db.prepare(`
      UPDATE propriedades_rurais
      SET nome_titular = ?,
          cpf_cnpj_titular = COALESCE(?, cpf_cnpj_titular),
          tag_fonte = CASE WHEN tag_fonte = 'SICAR' THEN 'FUSAO_SIGEF_CAR' ELSE tag_fonte END,
          updated_at = CURRENT_TIMESTAMP
      WHERE (codigo_car = ? OR id = ?)
        AND (nome_titular IS NULL OR nome_titular LIKE '%sigilo%' OR nome_titular LIKE '%Declarado%' OR nome_titular = '')
    `);

    for (const r of rows) {
      const res = updateStmt.run(r.nome_proprietario, r.cpf_cnpj_parcial, r.codigo_car, r.codigo_car);
      if (res.changes > 0) atualizados += res.changes;
    }

    return { total_historico: rows.length, propriedades_atualizadas: atualizados };
  }
};

export default carHistoricalService;
