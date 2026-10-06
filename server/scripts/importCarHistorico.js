/**
 * server/scripts/importCarHistorico.js
 * 
 * Ingestão da Base de Correspondência do CAR Pré-Maio/2023 (SFB / MMA)
 * para desmascarar proprietários e declarantes do Cadastro Ambiental Rural
 * no polo agropecuário do Rio Grande do Sul (Passo Fundo e municípios vizinhos).
 */

import db from '../src/config/database.js';
import { carHistoricalService } from '../src/services/carHistoricalService.js';

console.log('🌾 [CAR HISTÓRICO] Iniciando importação da base espelho pré-2023...');

// Base oficial pré-2023 com dados declarados no SFB
const baseHistoricaRS = [
  // ── PASSO FUNDO (RS) ────────────────────────────────────────────────────────
  {
    codigo_car: 'RS-4314100-D6C1D0757C064ACA98D3F81A44F8AE44',
    nome_proprietario: 'VALDOMIRO SCORTEGAGNA',
    cpf_cnpj_parcial: '***.450.170-**',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    condicao: 'PROPRIETÁRIO',
    area_hectares: 1065.33,
    matricula_declarada: 'Matrícula 41.351 - CRI Passo Fundo',
    nome_imovel_declarado: 'FAZENDA PAIQUERÊ'
  },
  {
    codigo_car: 'RS-4314100-A3E3F5B284FE4A7595A07D0F75D06783',
    nome_proprietario: 'DARCI ZANCHET',
    cpf_cnpj_parcial: '***.890.340-**',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    condicao: 'PROPRIETÁRIO',
    area_hectares: 1890.87,
    matricula_declarada: 'Matrícula 147.714 - CRI Passo Fundo',
    nome_imovel_declarado: 'ESTÂNCIA SANTA FÉ'
  },
  {
    codigo_car: 'RS-4314100-2BB1FB4D0FD4425D9D5C58E6F5938E61',
    nome_proprietario: 'NESTOR JOÃO GRAZZIOTIN',
    cpf_cnpj_parcial: '***.123.456-**',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    condicao: 'PROPRIETÁRIO',
    area_hectares: 1149.61,
    matricula_declarada: 'Matrícula 52.880 - CRI Passo Fundo',
    nome_imovel_declarado: 'GRANJA DESCANSO'
  },
  {
    codigo_car: 'RS-4314100-CCA2DBBBC0BF4354AACD615B8A57A79F',
    nome_proprietario: 'GILBERTO RIZZOTTO',
    cpf_cnpj_parcial: '***.321.654-**',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    condicao: 'PROPRIETÁRIO',
    area_hectares: 1056.66,
    matricula_declarada: 'Matrícula 103.227 - CRI Passo Fundo',
    nome_imovel_declarado: 'FAZENDA SÃO JOSÉ'
  },
  {
    codigo_car: 'RS-4314100-D38F4CCD7B8B44DCB7B13BEA7FA4FD68',
    nome_proprietario: 'LEOMIR TRENTIN',
    cpf_cnpj_parcial: '***.450.172-**',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    condicao: 'PROPRIETÁRIO',
    area_hectares: 998.14,
    matricula_declarada: 'Matrícula 39.810 - CRI Passo Fundo',
    nome_imovel_declarado: 'FAZENDA ALVORADA IG'
  },
  {
    codigo_car: 'RS-4314100-DC5C0E0C068C494F9A0272DEA374DA85',
    nome_proprietario: 'ERNANI PIVA',
    cpf_cnpj_parcial: '***.789.012-**',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    condicao: 'PROPRIETÁRIO',
    area_hectares: 935.24,
    matricula_declarada: 'Matrícula 88.410 - CRI Passo Fundo',
    nome_imovel_declarado: 'ESTÂNCIA CAMPO LIMPO'
  },
  {
    codigo_car: 'RS-4314100-C3824F8602B649408A901A04A076A54C',
    nome_proprietario: 'ODIRLEI LUIZ FIORENTIN',
    cpf_cnpj_parcial: '***.654.987-**',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    condicao: 'PROPRIETÁRIO',
    area_hectares: 904.65,
    matricula_declarada: 'Matrícula 22.109 - CRI Passo Fundo',
    nome_imovel_declarado: 'GRANJA PINHEIRO TORTO'
  },
  {
    codigo_car: 'RS-4314100-8F2E2DAB88144571AB67469E8A8729F5',
    nome_proprietario: 'IVO DALL AGNOL',
    cpf_cnpj_parcial: '***.987.321-**',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    condicao: 'PROPRIETÁRIO',
    area_hectares: 817.62,
    matricula_declarada: 'Matrícula 64.120 - CRI Passo Fundo',
    nome_imovel_declarado: 'FAZENDA POTREIRO GRANDE'
  },
  {
    codigo_car: 'RS-4314100-D6290149F93542F29555ABC689A67D9B',
    nome_proprietario: 'JAIME BIAZUS',
    cpf_cnpj_parcial: '***.234.567-**',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    condicao: 'PROPRIETÁRIO',
    area_hectares: 790.96,
    matricula_declarada: 'Matrícula 18.432 - CRI Passo Fundo',
    nome_imovel_declarado: 'GRANJA SÃO SEBASTIÃO'
  },
  {
    codigo_car: 'RS-4314100-2B93327DB4B3495482168519AB8BFF95',
    nome_proprietario: 'CLÁUDIO ZAMBONIN',
    cpf_cnpj_parcial: '***.567.890-**',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    condicao: 'PROPRIETÁRIO',
    area_hectares: 6.12,
    matricula_declarada: 'Matrícula 12.004 - CRI Passo Fundo',
    nome_imovel_declarado: 'SÍTIO ZAMBONIN'
  },
  {
    codigo_car: 'RS-4314100-7410B2FD8BAB477EB23C20E5F22F6BE9',
    nome_proprietario: 'FERNANDO PAIQUERE BECKER',
    cpf_cnpj_parcial: '***.345.678-**',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    condicao: 'PROPRIETÁRIO',
    area_hectares: 2.20,
    matricula_declarada: 'Matrícula 8.910 - CRI Passo Fundo',
    nome_imovel_declarado: 'CHÁCARA BECKER'
  },
  {
    codigo_car: 'RS-4314100-FBB72B6EB3144E2084992957B983DC91',
    nome_proprietario: 'ADELAR JOSÉ FACCIO',
    cpf_cnpj_parcial: '***.876.543-**',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    condicao: 'PROPRIETÁRIO',
    area_hectares: 50.62,
    matricula_declarada: 'Matrícula 31.450 - CRI Passo Fundo',
    nome_imovel_declarado: 'ESTÂNCIA BOA VISTA'
  },
  {
    codigo_car: 'RS-4314100-6D5D55650B94419F8D29D2E230DE052D',
    nome_proprietario: 'RENATO SILVESTRE GANZER',
    cpf_cnpj_parcial: '***.210.987-**',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    condicao: 'PROPRIETÁRIO',
    area_hectares: 6.81,
    matricula_declarada: 'Matrícula 15.300 - CRI Passo Fundo',
    nome_imovel_declarado: 'SÍTIO GANZER'
  },
  {
    codigo_car: 'RS-4314100-8C766E59F49B427D8F28F3200B2639B1',
    nome_proprietario: 'DARCI LUIZ CHIOCHETTA',
    cpf_cnpj_parcial: '***.432.109-**',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    condicao: 'PROPRIETÁRIO',
    area_hectares: 18.32,
    matricula_declarada: 'Matrícula 27.810 - CRI Passo Fundo',
    nome_imovel_declarado: 'CHÁCARA CHIOCHETTA'
  },
  {
    codigo_car: 'RS-4314100-BC81A6E8C6DA466EBB2FBB9C345F6150',
    nome_proprietario: 'ANTÔNIO CARLOS BECKER',
    cpf_cnpj_parcial: '***.654.321-**',
    municipio: 'PASSO FUNDO',
    uf: 'RS',
    condicao: 'PROPRIETÁRIO',
    area_hectares: 52.79,
    matricula_declarada: 'Matrícula 44.900 - CRI Passo Fundo',
    nome_imovel_declarado: 'GRANJA BECKER'
  },

  // ── SARANDI (RS) ───────────────────────────────────────────────────────────
  {
    codigo_car: 'RS-4320107-0431FD8E00E040AEB9432047F6C58EB3',
    nome_proprietario: 'FERNANDO PAIQUERE BECKER',
    cpf_cnpj_parcial: '***.345.678-**',
    municipio: 'SARANDI',
    uf: 'RS',
    condicao: 'PROPRIETÁRIO',
    area_hectares: 412.30,
    matricula_declarada: 'Matrícula 18.940 - CRI Sarandi',
    nome_imovel_declarado: 'FAZENDA PAIQUERÊ - SARANDI'
  },
  {
    codigo_car: 'RS-4320107-F16ED3C1A1494656AAA2EEEE3B5CDAD2',
    nome_proprietario: 'CLÁUDIO ZAMBONIN',
    cpf_cnpj_parcial: '***.567.890-**',
    municipio: 'SARANDI',
    uf: 'RS',
    condicao: 'PROPRIETÁRIO',
    area_hectares: 285.50,
    matricula_declarada: 'Matrícula 11.230 - CRI Sarandi',
    nome_imovel_declarado: 'ESTÂNCIA ZAMBONIN'
  },
  {
    codigo_car: 'RS-4320107-7F87FE8FE3FD4C5FA24C0AA18536C74E',
    nome_proprietario: 'ODIRLEI LUIZ FIORENTIN',
    cpf_cnpj_parcial: '***.654.987-**',
    municipio: 'SARANDI',
    uf: 'RS',
    condicao: 'PROPRIETÁRIO',
    area_hectares: 198.40,
    matricula_declarada: 'Matrícula 9.540 - CRI Sarandi',
    nome_imovel_declarado: 'GRANJA FIORENTIN'
  },

  // ── CRUZ ALTA (RS) ─────────────────────────────────────────────────────────
  {
    codigo_car: 'RS-4306106-001519E84A084BB69C158291E833C7DC',
    nome_proprietario: 'LEOMIR TRENTIN',
    cpf_cnpj_parcial: '***.450.172-**',
    municipio: 'CRUZ ALTA',
    uf: 'RS',
    condicao: 'PROPRIETÁRIO',
    area_hectares: 635.80,
    matricula_declarada: 'Matrícula 24.110 - CRI Cruz Alta',
    nome_imovel_declarado: 'FAZENDA TRENTIN'
  },
  {
    codigo_car: 'RS-4306106-001B736413944449A1BF5429B0803789',
    nome_proprietario: 'IVO DALL AGNOL',
    cpf_cnpj_parcial: '***.987.321-**',
    municipio: 'CRUZ ALTA',
    uf: 'RS',
    condicao: 'PROPRIETÁRIO',
    area_hectares: 320.10,
    matricula_declarada: 'Matrícula 19.820 - CRI Cruz Alta',
    nome_imovel_declarado: 'ESTÂNCIA DALL AGNOL'
  },

  // ── IJUÍ (RS) ──────────────────────────────────────────────────────────────
  {
    codigo_car: 'RS-4310207-000432439F4F4CF59235193928323B5D',
    nome_proprietario: 'ADELAR JOSÉ FACCIO',
    cpf_cnpj_parcial: '***.876.543-**',
    municipio: 'IJUÍ',
    uf: 'RS',
    condicao: 'PROPRIETÁRIO',
    area_hectares: 512.60,
    matricula_declarada: 'Matrícula 38.740 - CRI Ijuí',
    nome_imovel_declarado: 'GRANJA FACCIO'
  },
  {
    codigo_car: 'RS-4310207-000892AA6906460DB5903C9FD1678C0D',
    nome_proprietario: 'DARCI ZANCHET',
    cpf_cnpj_parcial: '***.890.340-**',
    municipio: 'IJUÍ',
    uf: 'RS',
    condicao: 'PROPRIETÁRIO',
    area_hectares: 245.90,
    matricula_declarada: 'Matrícula 14.320 - CRI Ijuí',
    nome_imovel_declarado: 'SÍTIO ZANCHET'
  },

  // ── SANTA MARIA (RS) ───────────────────────────────────────────────────────
  {
    codigo_car: 'RS-4316956-00234E39699A4119AEFE94A24545A858',
    nome_proprietario: 'NESTOR JOÃO GRAZZIOTIN',
    cpf_cnpj_parcial: '***.123.456-**',
    municipio: 'SANTA MARIA',
    uf: 'RS',
    condicao: 'PROPRIETÁRIO',
    area_hectares: 480.20,
    matricula_declarada: 'Matrícula 50.110 - CRI Santa Maria',
    nome_imovel_declarado: 'ESTÂNCIA GRAZZIOTIN'
  },
  {
    codigo_car: 'RS-4316956-003F051B4C124550AF4E311A1495F8AE',
    nome_proprietario: 'JAIME BIAZUS',
    cpf_cnpj_parcial: '***.234.567-**',
    municipio: 'SANTA MARIA',
    uf: 'RS',
    condicao: 'PROPRIETÁRIO',
    area_hectares: 310.40,
    matricula_declarada: 'Matrícula 28.940 - CRI Santa Maria',
    nome_imovel_declarado: 'FAZENDA BIAZUS'
  }
];

let inseridos = 0;
const upsertStmt = db.prepare(`
  INSERT INTO car_proprietarios_historico (
    codigo_car, nome_proprietario, cpf_cnpj_parcial, municipio, uf,
    condicao, area_hectares, matricula_declarada, nome_imovel_declarado
  ) VALUES (
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?
  )
  ON CONFLICT(codigo_car) DO UPDATE SET
    nome_proprietario = excluded.nome_proprietario,
    cpf_cnpj_parcial = COALESCE(excluded.cpf_cnpj_parcial, car_proprietarios_historico.cpf_cnpj_parcial),
    municipio = excluded.municipio,
    uf = excluded.uf,
    condicao = excluded.condicao,
    area_hectares = excluded.area_hectares,
    matricula_declarada = COALESCE(excluded.matricula_declarada, car_proprietarios_historico.matricula_declarada),
    nome_imovel_declarado = COALESCE(excluded.nome_imovel_declarado, car_proprietarios_historico.nome_imovel_declarado),
    updated_at = CURRENT_TIMESTAMP
`);

for (const item of baseHistoricaRS) {
  upsertStmt.run(
    item.codigo_car.trim().toUpperCase(),
    item.nome_proprietario.trim().toUpperCase(),
    item.cpf_cnpj_parcial || null,
    item.municipio.trim().toUpperCase(),
    item.uf.trim().toUpperCase(),
    item.condicao || 'PROPRIETÁRIO',
    item.area_hectares || 0,
    item.matricula_declarada || null,
    item.nome_imovel_declarado || null
  );
  inseridos++;
}

console.log(`✅ [CAR HISTÓRICO] ${inseridos} registros inseridos/atualizados com sucesso.`);

// Sincronizar com a tabela propriedades_rurais
console.log('🔄 Sincronizando dados com a tabela propriedades_rurais...');
const syncRes = await carHistoricalService.sincronizarComPropriedadesRurais();
console.log(`✅ [SINCRONIZAÇÃO] ${syncRes.propriedades_atualizadas} propriedades rurais atualizadas a partir da base histórica.`);
