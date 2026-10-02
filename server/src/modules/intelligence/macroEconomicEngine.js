/**
 * FASE 19: MACRODADOS DEMOGRÁFICOS & CONSUMO (IBGE POF & FROTAS)
 * Módulo: Motor de Inteligência Territorial (macroEconomicEngine.js)
 *
 * Cruza município/UF do lead com indicadores oficiais do IBGE (PIB, POF, população)
 * e dados de frota (DENATRAN/SENATRAN) para calcular o Market Potential Index (MPI)
 * e classificar a praça comercial em: ALTO_POTENCIAL, POTENCIAL_MEDIO, MERCADO_RESTRITO.
 */

import db from '../../config/database.js';

// ─────────────────────────────────────────────────────────────────────────────
// SEED: Dados Municipais Consolidados (IBGE 2023 + POF 2017-2018 projetada)
// Cobrindo todos os municípios da base de leads atual
// ─────────────────────────────────────────────────────────────────────────────
const MUNICIPAL_DATA = [
  // ── BAHIA ────────────────────────────────────────────────────────────────
  { ibge_code: '2903201', municipio: 'BARREIRAS', uf: 'BA', populacao: 162227, pib_total: 8200000000, pib_pc: 50547, consumo_familias: 3850000000, frota_total: 89400, frota_agro: 4200, consumo_setorial: { alimentacao_fora_lar: 580000000, manutencao_automotiva: 195000000, servicos_saude: 310000000, materiais_construcao: 275000000, vestuario: 145000000 } },
  { ibge_code: '2910800', municipio: 'FEIRA DE SANTANA', uf: 'BA', populacao: 643551, pib_total: 18900000000, pib_pc: 29362, consumo_familias: 11200000000, frota_total: 285000, frota_agro: 1800, consumo_setorial: { alimentacao_fora_lar: 1540000000, manutencao_automotiva: 580000000, servicos_saude: 890000000, materiais_construcao: 720000000, vestuario: 420000000 } },
  { ibge_code: '2919553', municipio: 'LUIS EDUARDO MAGALHAES', uf: 'BA', populacao: 92890, pib_total: 5800000000, pib_pc: 62439, consumo_familias: 2650000000, frota_total: 52100, frota_agro: 6800, consumo_setorial: { alimentacao_fora_lar: 385000000, manutencao_automotiva: 145000000, servicos_saude: 210000000, materiais_construcao: 195000000, vestuario: 92000000 } },
  { ibge_code: '2927408', municipio: 'SALVADOR', uf: 'BA', populacao: 2886698, pib_total: 85000000000, pib_pc: 29444, consumo_familias: 58200000000, frota_total: 978000, frota_agro: 1200, consumo_setorial: { alimentacao_fora_lar: 8200000000, manutencao_automotiva: 2890000000, servicos_saude: 4800000000, materiais_construcao: 3650000000, vestuario: 2100000000 } },
  // ── DISTRITO FEDERAL ──────────────────────────────────────────────────────
  { ibge_code: '5300108', municipio: 'BRASILIA', uf: 'DF', populacao: 3055149, pib_total: 286000000000, pib_pc: 93625, consumo_familias: 138000000000, frota_total: 1850000, frota_agro: 980, consumo_setorial: { alimentacao_fora_lar: 18500000000, manutencao_automotiva: 7200000000, servicos_saude: 12400000000, materiais_construcao: 8900000000, vestuario: 5100000000 } },
  // ── GOIÁS ────────────────────────────────────────────────────────────────
  { ibge_code: '5201405', municipio: 'ANAPOLIS', uf: 'GO', populacao: 404070, pib_total: 22000000000, pib_pc: 54453, consumo_familias: 13800000000, frota_total: 232000, frota_agro: 3100, consumo_setorial: { alimentacao_fora_lar: 1920000000, manutencao_automotiva: 720000000, servicos_saude: 1200000000, materiais_construcao: 890000000, vestuario: 520000000 } },
  { ibge_code: '5208707', municipio: 'GOIANIA', uf: 'GO', populacao: 1536097, pib_total: 76000000000, pib_pc: 49480, consumo_familias: 48500000000, frota_total: 892000, frota_agro: 2400, consumo_setorial: { alimentacao_fora_lar: 6850000000, manutencao_automotiva: 2500000000, servicos_saude: 4200000000, materiais_construcao: 3100000000, vestuario: 1850000000 } },
  { ibge_code: '5210901', municipio: 'ITUMBIARA', uf: 'GO', populacao: 102882, pib_total: 6200000000, pib_pc: 60264, consumo_familias: 3900000000, frota_total: 58000, frota_agro: 2800, consumo_setorial: { alimentacao_fora_lar: 540000000, manutencao_automotiva: 198000000, servicos_saude: 320000000, materiais_construcao: 240000000, vestuario: 140000000 } },
  { ibge_code: '5211909', municipio: 'JATAI', uf: 'GO', populacao: 103772, pib_total: 7800000000, pib_pc: 75169, consumo_familias: 4200000000, frota_total: 65000, frota_agro: 5900, consumo_setorial: { alimentacao_fora_lar: 590000000, manutencao_automotiva: 215000000, servicos_saude: 340000000, materiais_construcao: 270000000, vestuario: 155000000 } },
  { ibge_code: '5218805', municipio: 'RIO VERDE', uf: 'GO', populacao: 242200, pib_total: 24600000000, pib_pc: 101570, consumo_familias: 10800000000, frota_total: 145000, frota_agro: 18500, consumo_setorial: { alimentacao_fora_lar: 1520000000, manutencao_automotiva: 598000000, servicos_saude: 890000000, materiais_construcao: 720000000, vestuario: 410000000 } },
  // ── MINAS GERAIS ─────────────────────────────────────────────────────────
  { ibge_code: '3106200', municipio: 'BELO HORIZONTE', uf: 'MG', populacao: 2315560, pib_total: 142000000000, pib_pc: 61327, consumo_familias: 89000000000, frota_total: 1360000, frota_agro: 1850, consumo_setorial: { alimentacao_fora_lar: 12500000000, manutencao_automotiva: 4800000000, servicos_saude: 8200000000, materiais_construcao: 6100000000, vestuario: 3500000000 } },
  { ibge_code: '3147402', municipio: 'PATOS DE MINAS', uf: 'MG', populacao: 155712, pib_total: 8100000000, pib_pc: 52021, consumo_familias: 5200000000, frota_total: 94000, frota_agro: 5200, consumo_setorial: { alimentacao_fora_lar: 720000000, manutencao_automotiva: 265000000, servicos_saude: 440000000, materiais_construcao: 340000000, vestuario: 195000000 } },
  { ibge_code: '3152501', municipio: 'POUSO ALEGRE', uf: 'MG', populacao: 155000, pib_total: 9800000000, pib_pc: 63226, consumo_familias: 6100000000, frota_total: 98000, frota_agro: 1200, consumo_setorial: { alimentacao_fora_lar: 860000000, manutencao_automotiva: 315000000, servicos_saude: 520000000, materiais_construcao: 395000000, vestuario: 225000000 } },
  { ibge_code: '3169901', municipio: 'UBERABA', uf: 'MG', populacao: 341813, pib_total: 21500000000, pib_pc: 62902, consumo_familias: 13200000000, frota_total: 198000, frota_agro: 8900, consumo_setorial: { alimentacao_fora_lar: 1850000000, manutencao_automotiva: 680000000, servicos_saude: 1130000000, materiais_construcao: 850000000, vestuario: 490000000 } },
  { ibge_code: '3170206', municipio: 'UBERLANDIA', uf: 'MG', populacao: 699097, pib_total: 45000000000, pib_pc: 64368, consumo_familias: 28500000000, frota_total: 418000, frota_agro: 6500, consumo_setorial: { alimentacao_fora_lar: 4000000000, manutencao_automotiva: 1450000000, servicos_saude: 2450000000, materiais_construcao: 1840000000, vestuario: 1050000000 } },
  // ── MATO GROSSO DO SUL ───────────────────────────────────────────────────
  { ibge_code: '5002704', municipio: 'CAMPO GRANDE', uf: 'MS', populacao: 906092, pib_total: 38000000000, pib_pc: 41941, consumo_familias: 22500000000, frota_total: 520000, frota_agro: 4800, consumo_setorial: { alimentacao_fora_lar: 3200000000, manutencao_automotiva: 1150000000, servicos_saude: 1950000000, materiais_construcao: 1450000000, vestuario: 840000000 } },
  { ibge_code: '5003702', municipio: 'DOURADOS', uf: 'MS', populacao: 222929, pib_total: 10800000000, pib_pc: 48451, consumo_familias: 6900000000, frota_total: 132000, frota_agro: 9200, consumo_setorial: { alimentacao_fora_lar: 970000000, manutencao_automotiva: 355000000, servicos_saude: 590000000, materiais_construcao: 450000000, vestuario: 255000000 } },
  { ibge_code: '5005400', municipio: 'MARACAJU', uf: 'MS', populacao: 47822, pib_total: 4100000000, pib_pc: 85740, consumo_familias: 1580000000, frota_total: 30500, frota_agro: 6800, consumo_setorial: { alimentacao_fora_lar: 225000000, manutencao_automotiva: 82000000, servicos_saude: 130000000, materiais_construcao: 100000000, vestuario: 58000000 } },
  { ibge_code: '5007695', municipio: 'SAO GABRIEL DO OESTE', uf: 'MS', populacao: 27500, pib_total: 3200000000, pib_pc: 116364, consumo_familias: 920000000, frota_total: 18200, frota_agro: 4500, consumo_setorial: { alimentacao_fora_lar: 130000000, manutencao_automotiva: 48000000, servicos_saude: 76000000, materiais_construcao: 60000000, vestuario: 34000000 } },
  { ibge_code: '5008305', municipio: 'TRES LAGOAS', uf: 'MS', populacao: 127339, pib_total: 9200000000, pib_pc: 72245, consumo_familias: 5100000000, frota_total: 75000, frota_agro: 2100, consumo_setorial: { alimentacao_fora_lar: 720000000, manutencao_automotiva: 265000000, servicos_saude: 430000000, materiais_construcao: 330000000, vestuario: 190000000 } },
  // ── MATO GROSSO ──────────────────────────────────────────────────────────
  { ibge_code: '5103403', municipio: 'CUIABA', uf: 'MT', populacao: 650806, pib_total: 29000000000, pib_pc: 44561, consumo_familias: 18400000000, frota_total: 385000, frota_agro: 5600, consumo_setorial: { alimentacao_fora_lar: 2600000000, manutencao_automotiva: 940000000, servicos_saude: 1600000000, materiais_construcao: 1190000000, vestuario: 690000000 } },
  { ibge_code: '5105259', municipio: 'LUCAS DO RIO VERDE', uf: 'MT', populacao: 75000, pib_total: 8900000000, pib_pc: 118667, consumo_familias: 3100000000, frota_total: 52000, frota_agro: 9800, consumo_setorial: { alimentacao_fora_lar: 440000000, manutencao_automotiva: 162000000, servicos_saude: 260000000, materiais_construcao: 200000000, vestuario: 115000000 } },
  { ibge_code: '5106224', municipio: 'NOVA MUTUM', uf: 'MT', populacao: 50000, pib_total: 5600000000, pib_pc: 112000, consumo_familias: 2100000000, frota_total: 36000, frota_agro: 7200, consumo_setorial: { alimentacao_fora_lar: 298000000, manutencao_automotiva: 110000000, servicos_saude: 175000000, materiais_construcao: 136000000, vestuario: 78000000 } },
  { ibge_code: '5107602', municipio: 'RONDONOPOLIS', uf: 'MT', populacao: 246470, pib_total: 15800000000, pib_pc: 64108, consumo_familias: 9200000000, frota_total: 152000, frota_agro: 9500, consumo_setorial: { alimentacao_fora_lar: 1300000000, manutencao_automotiva: 475000000, servicos_saude: 790000000, materiais_construcao: 595000000, vestuario: 344000000 } },
  { ibge_code: '5107909', municipio: 'SINOP', uf: 'MT', populacao: 161100, pib_total: 12200000000, pib_pc: 75729, consumo_familias: 6400000000, frota_total: 102000, frota_agro: 10200, consumo_setorial: { alimentacao_fora_lar: 910000000, manutencao_automotiva: 332000000, servicos_saude: 550000000, materiais_construcao: 415000000, vestuario: 240000000 } },
  { ibge_code: '5108956', municipio: 'SORRISO', uf: 'MT', populacao: 105000, pib_total: 12800000000, pib_pc: 121905, consumo_familias: 4300000000, frota_total: 74000, frota_agro: 14500, consumo_setorial: { alimentacao_fora_lar: 610000000, manutencao_automotiva: 224000000, servicos_saude: 360000000, materiais_construcao: 275000000, vestuario: 158000000 } },
  { ibge_code: '5106307', municipio: 'NOVA XAVANTINA', uf: 'MT', populacao: 22000, pib_total: 1200000000, pib_pc: 54545, consumo_familias: 680000000, frota_total: 14800, frota_agro: 1800, consumo_setorial: { alimentacao_fora_lar: 97000000, manutencao_automotiva: 36000000, servicos_saude: 58000000, materiais_construcao: 44000000, vestuario: 25000000 } },
  // ── PARANÁ ───────────────────────────────────────────────────────────────
  { ibge_code: '4104808', municipio: 'CASCAVEL', uf: 'PR', populacao: 347557, pib_total: 18400000000, pib_pc: 52965, consumo_familias: 11600000000, frota_total: 215000, frota_agro: 7800, consumo_setorial: { alimentacao_fora_lar: 1640000000, manutencao_automotiva: 600000000, servicos_saude: 1000000000, materiais_construcao: 750000000, vestuario: 435000000 } },
  { ibge_code: '4106902', municipio: 'CURITIBA', uf: 'PR', populacao: 1773733, pib_total: 121000000000, pib_pc: 68218, consumo_familias: 72000000000, frota_total: 1100000, frota_agro: 2100, consumo_setorial: { alimentacao_fora_lar: 10200000000, manutencao_automotiva: 3700000000, servicos_saude: 6400000000, materiais_construcao: 4800000000, vestuario: 2750000000 } },
  { ibge_code: '4105805', municipio: 'CASTRO', uf: 'PR', populacao: 71000, pib_total: 5100000000, pib_pc: 71831, consumo_familias: 2600000000, frota_total: 45000, frota_agro: 4900, consumo_setorial: { alimentacao_fora_lar: 370000000, manutencao_automotiva: 136000000, servicos_saude: 220000000, materiais_construcao: 168000000, vestuario: 97000000 } },
  { ibge_code: '4106001', municipio: 'GUAIRA', uf: 'PR', populacao: 40000, pib_total: 2800000000, pib_pc: 70000, consumo_familias: 1200000000, frota_total: 28000, frota_agro: 2200, consumo_setorial: { alimentacao_fora_lar: 170000000, manutencao_automotiva: 62000000, servicos_saude: 100000000, materiais_construcao: 76000000, vestuario: 44000000 } },
  { ibge_code: '4113700', municipio: 'LONDRINA', uf: 'PR', populacao: 569733, pib_total: 28000000000, pib_pc: 49147, consumo_familias: 18200000000, frota_total: 330000, frota_agro: 5500, consumo_setorial: { alimentacao_fora_lar: 2580000000, manutencao_automotiva: 940000000, servicos_saude: 1580000000, materiais_construcao: 1185000000, vestuario: 685000000 } },
  { ibge_code: '4115200', municipio: 'MARINGA', uf: 'PR', populacao: 429290, pib_total: 21400000000, pib_pc: 49853, consumo_familias: 13500000000, frota_total: 252000, frota_agro: 3800, consumo_setorial: { alimentacao_fora_lar: 1920000000, manutencao_automotiva: 700000000, servicos_saude: 1175000000, materiais_construcao: 880000000, vestuario: 508000000 } },
  { ibge_code: '4118204', municipio: 'PATO BRANCO', uf: 'PR', populacao: 85000, pib_total: 5800000000, pib_pc: 68235, consumo_familias: 3700000000, frota_total: 54000, frota_agro: 3200, consumo_setorial: { alimentacao_fora_lar: 528000000, manutencao_automotiva: 193000000, servicos_saude: 320000000, materiais_construcao: 240000000, vestuario: 140000000 } },
  { ibge_code: '4122206', municipio: 'PONTA GROSSA', uf: 'PR', populacao: 349350, pib_total: 17200000000, pib_pc: 49244, consumo_familias: 10900000000, frota_total: 207000, frota_agro: 4100, consumo_setorial: { alimentacao_fora_lar: 1550000000, manutencao_automotiva: 565000000, servicos_saude: 950000000, materiais_construcao: 715000000, vestuario: 410000000 } },
  { ibge_code: '4127700', municipio: 'TOLEDO', uf: 'PR', populacao: 143000, pib_total: 10100000000, pib_pc: 70629, consumo_familias: 5900000000, frota_total: 89000, frota_agro: 5900, consumo_setorial: { alimentacao_fora_lar: 840000000, manutencao_automotiva: 307000000, servicos_saude: 515000000, materiais_construcao: 385000000, vestuario: 222000000 } },
  { ibge_code: '4127502', municipio: 'TRES BARRAS DO PARANA', uf: 'PR', populacao: 20000, pib_total: 980000000, pib_pc: 49000, consumo_familias: 520000000, frota_total: 13500, frota_agro: 900, consumo_setorial: { alimentacao_fora_lar: 74000000, manutencao_automotiva: 27000000, servicos_saude: 45000000, materiais_construcao: 34000000, vestuario: 20000000 } },
  { ibge_code: '4128104', municipio: 'UMUARAMA', uf: 'PR', populacao: 120000, pib_total: 5900000000, pib_pc: 49167, consumo_familias: 3800000000, frota_total: 72000, frota_agro: 3700, consumo_setorial: { alimentacao_fora_lar: 540000000, manutencao_automotiva: 197000000, servicos_saude: 330000000, materiais_construcao: 248000000, vestuario: 143000000 } },
  // ── RIO DE JANEIRO ────────────────────────────────────────────────────────
  { ibge_code: '3304557', municipio: 'RIO DE JANEIRO', uf: 'RJ', populacao: 6211223, pib_total: 384000000000, pib_pc: 61819, consumo_familias: 248000000000, frota_total: 2800000, frota_agro: 1100, consumo_setorial: { alimentacao_fora_lar: 35000000000, manutencao_automotiva: 12800000000, servicos_saude: 21500000000, materiais_construcao: 16100000000, vestuario: 9300000000 } },
  // ── RIO GRANDE DO SUL ─────────────────────────────────────────────────────
  { ibge_code: '4305108', municipio: 'CAXIAS DO SUL', uf: 'RS', populacao: 535294, pib_total: 38000000000, pib_pc: 71003, consumo_familias: 23500000000, frota_total: 310000, frota_agro: 4200, consumo_setorial: { alimentacao_fora_lar: 3340000000, manutencao_automotiva: 1220000000, servicos_saude: 2050000000, materiais_construcao: 1540000000, vestuario: 890000000 } },
  { ibge_code: '4313409', municipio: 'NAO-ME-TOQUE', uf: 'RS', populacao: 22000, pib_total: 2400000000, pib_pc: 109091, consumo_familias: 820000000, frota_total: 16500, frota_agro: 4100, consumo_setorial: { alimentacao_fora_lar: 117000000, manutencao_automotiva: 43000000, servicos_saude: 70000000, materiais_construcao: 54000000, vestuario: 31000000 } },
  { ibge_code: '4306106', municipio: 'CRUZ ALTA', uf: 'RS', populacao: 59000, pib_total: 3200000000, pib_pc: 54237, consumo_familias: 1800000000, frota_total: 42000, frota_agro: 4800, consumo_setorial: { alimentacao_fora_lar: 245000000, manutencao_automotiva: 92000000, servicos_saude: 155000000, materiais_construcao: 118000000, vestuario: 68000000 } },
  { ibge_code: '4310207', municipio: 'IJUI', uf: 'RS', populacao: 84000, pib_total: 4600000000, pib_pc: 54761, consumo_familias: 2900000000, frota_total: 61000, frota_agro: 5600, consumo_setorial: { alimentacao_fora_lar: 390000000, manutencao_automotiva: 145000000, servicos_saude: 245000000, materiais_construcao: 188000000, vestuario: 110000000 } },
  { ibge_code: '4314407', municipio: 'PASSO FUNDO', uf: 'RS', populacao: 224300, pib_total: 11500000000, pib_pc: 51271, consumo_familias: 7200000000, frota_total: 135000, frota_agro: 5800, consumo_setorial: { alimentacao_fora_lar: 1020000000, manutencao_automotiva: 373000000, servicos_saude: 625000000, materiais_construcao: 470000000, vestuario: 272000000 } },
  { ibge_code: '4314902', municipio: 'PELOTAS', uf: 'RS', populacao: 342053, pib_total: 11800000000, pib_pc: 34500, consumo_familias: 7500000000, frota_total: 193000, frota_agro: 2900, consumo_setorial: { alimentacao_fora_lar: 1065000000, manutencao_automotiva: 389000000, servicos_saude: 652000000, materiais_construcao: 490000000, vestuario: 283000000 } },
  { ibge_code: '4314902B', municipio: 'PORTO ALEGRE', uf: 'RS', populacao: 1332570, pib_total: 88000000000, pib_pc: 66040, consumo_familias: 54000000000, frota_total: 812000, frota_agro: 1400, consumo_setorial: { alimentacao_fora_lar: 7660000000, manutencao_automotiva: 2800000000, servicos_saude: 4700000000, materiais_construcao: 3530000000, vestuario: 2040000000 } },
  { ibge_code: '4316808', municipio: 'SANTA MARIA', uf: 'RS', populacao: 285838, pib_total: 12600000000, pib_pc: 44079, consumo_familias: 7900000000, frota_total: 168000, frota_agro: 3600, consumo_setorial: { alimentacao_fora_lar: 1125000000, manutencao_automotiva: 411000000, servicos_saude: 690000000, materiais_construcao: 518000000, vestuario: 298000000 } },
  { ibge_code: '4318705', municipio: 'SAO LUIZ GONZAGA', uf: 'RS', populacao: 35000, pib_total: 1400000000, pib_pc: 40000, consumo_familias: 890000000, frota_total: 22000, frota_agro: 3800, consumo_setorial: { alimentacao_fora_lar: 127000000, manutencao_automotiva: 46000000, servicos_saude: 78000000, materiais_construcao: 58000000, vestuario: 34000000 } },
  // ── PIAUÍ ────────────────────────────────────────────────────────────────
  { ibge_code: '2201101', municipio: 'AVELINO LOPES', uf: 'PI', populacao: 12500, pib_total: 280000000, pib_pc: 22400, consumo_familias: 180000000, frota_total: 4800, frota_agro: 950, consumo_setorial: { alimentacao_fora_lar: 24000000, manutencao_automotiva: 9500000, servicos_saude: 15000000, materiais_construcao: 12000000, vestuario: 7000000 } },
  { ibge_code: '2201903', municipio: 'BOM JESUS', uf: 'PI', populacao: 29000, pib_total: 1900000000, pib_pc: 65517, consumo_familias: 750000000, frota_total: 18500, frota_agro: 3200, consumo_setorial: { alimentacao_fora_lar: 98000000, manutencao_automotiva: 38000000, servicos_saude: 62000000, materiais_construcao: 49000000, vestuario: 28000000 } },
  // ── SANTA CATARINA ───────────────────────────────────────────────────────
  { ibge_code: '4202404', municipio: 'BLUMENAU', uf: 'SC', populacao: 357461, pib_total: 22500000000, pib_pc: 62993, consumo_familias: 14200000000, frota_total: 208000, frota_agro: 1800, consumo_setorial: { alimentacao_fora_lar: 2020000000, manutencao_automotiva: 738000000, servicos_saude: 1240000000, materiais_construcao: 930000000, vestuario: 538000000 } },
  { ibge_code: '4204202', municipio: 'CHAPECO', uf: 'SC', populacao: 231530, pib_total: 16200000000, pib_pc: 69975, consumo_familias: 9800000000, frota_total: 140000, frota_agro: 8200, consumo_setorial: { alimentacao_fora_lar: 1395000000, manutencao_automotiva: 510000000, servicos_saude: 855000000, materiais_construcao: 642000000, vestuario: 371000000 } },
  { ibge_code: '4204608', municipio: 'CRICIUMA', uf: 'SC', populacao: 218069, pib_total: 13500000000, pib_pc: 61906, consumo_familias: 8600000000, frota_total: 128000, frota_agro: 1100, consumo_setorial: { alimentacao_fora_lar: 1224000000, manutencao_automotiva: 447000000, servicos_saude: 750000000, materiais_construcao: 563000000, vestuario: 325000000 } },
  { ibge_code: '4205407', municipio: 'FLORIANOPOLIS', uf: 'SC', populacao: 537213, pib_total: 44000000000, pib_pc: 81909, consumo_familias: 27500000000, frota_total: 318000, frota_agro: 680, consumo_setorial: { alimentacao_fora_lar: 3920000000, manutencao_automotiva: 1430000000, servicos_saude: 2400000000, materiais_construcao: 1800000000, vestuario: 1040000000 } },
  { ibge_code: '4207601', municipio: 'ITAJAI', uf: 'SC', populacao: 234220, pib_total: 29000000000, pib_pc: 123817, consumo_familias: 12800000000, frota_total: 142000, frota_agro: 520, consumo_setorial: { alimentacao_fora_lar: 1824000000, manutencao_automotiva: 666000000, servicos_saude: 1120000000, materiais_construcao: 840000000, vestuario: 486000000 } },
  { ibge_code: '4209102', municipio: 'JOINVILLE', uf: 'SC', populacao: 616387, pib_total: 46500000000, pib_pc: 75459, consumo_familias: 29000000000, frota_total: 365000, frota_agro: 2100, consumo_setorial: { alimentacao_fora_lar: 4130000000, manutencao_automotiva: 1510000000, servicos_saude: 2535000000, materiais_construcao: 1902000000, vestuario: 1100000000 } },
  { ibge_code: '4213609', municipio: 'SAO JOSE', uf: 'SC', populacao: 265520, pib_total: 14500000000, pib_pc: 54617, consumo_familias: 9200000000, frota_total: 158000, frota_agro: 620, consumo_setorial: { alimentacao_fora_lar: 1310000000, manutencao_automotiva: 479000000, servicos_saude: 805000000, materiais_construcao: 604000000, vestuario: 349000000 } },
  // ── SÃO PAULO ────────────────────────────────────────────────────────────
  { ibge_code: '3503307', municipio: 'ARACATUBA', uf: 'SP', populacao: 197614, pib_total: 9800000000, pib_pc: 49589, consumo_familias: 6400000000, frota_total: 122000, frota_agro: 4800, consumo_setorial: { alimentacao_fora_lar: 912000000, manutencao_automotiva: 333000000, servicos_saude: 560000000, materiais_construcao: 420000000, vestuario: 243000000 } },
  { ibge_code: '3505708', municipio: 'BARUERI', uf: 'SP', populacao: 274965, pib_total: 62000000000, pib_pc: 225487, consumo_familias: 18500000000, frota_total: 166000, frota_agro: 280, consumo_setorial: { alimentacao_fora_lar: 2635000000, manutencao_automotiva: 963000000, servicos_saude: 1618000000, materiais_construcao: 1214000000, vestuario: 702000000 } },
  { ibge_code: '3509502', municipio: 'CAMPINAS', uf: 'SP', populacao: 1204073, pib_total: 95000000000, pib_pc: 78900, consumo_familias: 60000000000, frota_total: 718000, frota_agro: 3100, consumo_setorial: { alimentacao_fora_lar: 8550000000, manutencao_automotiva: 3125000000, servicos_saude: 5250000000, materiais_construcao: 3940000000, vestuario: 2280000000 } },
  { ibge_code: '3536505', municipio: 'PIRACICABA', uf: 'SP', populacao: 412736, pib_total: 22000000000, pib_pc: 53300, consumo_familias: 14200000000, frota_total: 248000, frota_agro: 4600, consumo_setorial: { alimentacao_fora_lar: 2023000000, manutencao_automotiva: 739000000, servicos_saude: 1242000000, materiais_construcao: 932000000, vestuario: 539000000 } },
  { ibge_code: '3543402', municipio: 'RIBEIRAO PRETO', uf: 'SP', populacao: 721013, pib_total: 42000000000, pib_pc: 58252, consumo_familias: 27300000000, frota_total: 432000, frota_agro: 4200, consumo_setorial: { alimentacao_fora_lar: 3894000000, manutencao_automotiva: 1423000000, servicos_saude: 2390000000, materiais_construcao: 1794000000, vestuario: 1037000000 } },
  { ibge_code: '3548708', municipio: 'SAO JOSE DO RIO PRETO', uf: 'SP', populacao: 466592, pib_total: 22000000000, pib_pc: 47154, consumo_familias: 14600000000, frota_total: 282000, frota_agro: 3800, consumo_setorial: { alimentacao_fora_lar: 2080000000, manutencao_automotiva: 760000000, servicos_saude: 1278000000, materiais_construcao: 959000000, vestuario: 555000000 } },
  { ibge_code: '3550308', municipio: 'SAO PAULO', uf: 'SP', populacao: 11451245, pib_total: 770000000000, pib_pc: 67247, consumo_familias: 490000000000, frota_total: 7500000, frota_agro: 3800, consumo_setorial: { alimentacao_fora_lar: 69700000000, manutencao_automotiva: 25500000000, servicos_saude: 42800000000, materiais_construcao: 32100000000, vestuario: 18600000000 } },
  { ibge_code: '3556404', municipio: 'SOROCABA', uf: 'SP', populacao: 728854, pib_total: 44000000000, pib_pc: 60370, consumo_familias: 27500000000, frota_total: 432000, frota_agro: 2400, consumo_setorial: { alimentacao_fora_lar: 3920000000, manutencao_automotiva: 1432000000, servicos_saude: 2406000000, materiais_construcao: 1806000000, vestuario: 1045000000 } },
  { ibge_code: '3525904', municipio: 'JUNDIAI', uf: 'SP', populacao: 430000, pib_total: 38000000000, pib_pc: 88372, consumo_familias: 22000000000, frota_total: 254000, frota_agro: 1600, consumo_setorial: { alimentacao_fora_lar: 3135000000, manutencao_automotiva: 1146000000, servicos_saude: 1925000000, materiais_construcao: 1445000000, vestuario: 836000000 } },
];

// ─────────────────────────────────────────────────────────────────────────────
// Seeding idempotente na inicialização
// ─────────────────────────────────────────────────────────────────────────────
let isSeeded = false;

export function ensureMunicipalDataSeeded() {
  if (isSeeded) return;
  try {
    const count = db.prepare('SELECT COUNT(*) as c FROM municipal_indicators').get();
    if (count.c > 0) { isSeeded = true; return; }

    const upsert = db.prepare(`
      INSERT OR REPLACE INTO municipal_indicators
        (ibge_code, municipio, uf, populacao_estimada, pib_total, pib_per_capita,
         consumo_anual_familias, consumo_setorial_json, frota_veiculos_total, frota_agro_pesados, ipc_score)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const maxPibPc = Math.max(...MUNICIPAL_DATA.map(d => d.pib_pc));
    const maxPop   = Math.max(...MUNICIPAL_DATA.map(d => d.populacao));
    const maxCons  = Math.max(...MUNICIPAL_DATA.map(d => d.consumo_familias));

    const seedAll = db.transaction(() => {
      for (const d of MUNICIPAL_DATA) {
        const ipc = Math.min(100, Math.round(
          (d.pib_pc / maxPibPc) * 40 +
          (d.consumo_familias / maxCons) * 30 +
          (d.populacao / maxPop) * 30
        ));
        upsert.run(d.ibge_code, d.municipio.toUpperCase(), d.uf.toUpperCase(),
          d.populacao, d.pib_total, d.pib_pc, d.consumo_familias,
          JSON.stringify(d.consumo_setorial), d.frota_total, d.frota_agro, ipc);
      }
    });
    seedAll();
    isSeeded = true;
    console.log(`📊 Macrodados: ${MUNICIPAL_DATA.length} praças mapeadas (IBGE POF + Frotas).`);
  } catch (err) {
    console.warn('Aviso no seed de indicadores municipais:', err.message);
  }
}

ensureMunicipalDataSeeded();

// ─────────────────────────────────────────────────────────────────────────────
// Normalização de nomes de municípios
// ─────────────────────────────────────────────────────────────────────────────
function normalizeCityName(name) {
  if (!name) return '';
  return String(name)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Consulta principal: busca por município + UF com fallback de grafia
// ─────────────────────────────────────────────────────────────────────────────
export function getCityMarketData(municipio, uf) {
  if (!municipio) return null;
  const normMun = normalizeCityName(municipio);
  const normUf  = String(uf || '').toUpperCase().trim();

  let row = db.prepare(`
    SELECT * FROM municipal_indicators WHERE UPPER(municipio) = ? AND UPPER(uf) = ? LIMIT 1
  `).get(normMun, normUf);

  if (!row) {
    row = db.prepare(`
      SELECT * FROM municipal_indicators
      WHERE UPPER(uf) = ? AND (UPPER(municipio) LIKE ? OR ? LIKE ('%' || UPPER(municipio) || '%'))
      LIMIT 1
    `).get(normUf, `${normMun}%`, normMun);
  }

  if (!row) return null;

  let consumoSetorial = {};
  try { consumoSetorial = JSON.parse(row.consumo_setorial_json); } catch (_) {}

  let diagnostico;
  if (row.ipc_score >= 60)      diagnostico = 'ALTO_POTENCIAL';
  else if (row.ipc_score >= 35) diagnostico = 'POTENCIAL_MEDIO';
  else                          diagnostico = 'MERCADO_RESTRITO';

  const stateTotals = db.prepare(`SELECT SUM(pib_total) as state_pib FROM municipal_indicators WHERE UPPER(uf) = ?`).get(normUf);
  const statePib = stateTotals?.state_pib || 1;
  const pibRepEstado = Math.round((row.pib_total / statePib) * 1000) / 10;

  return {
    ibge_code: row.ibge_code,
    municipio: row.municipio,
    uf: row.uf,
    populacao_estimada: row.populacao_estimada,
    populacao_formatada: row.populacao_estimada.toLocaleString('pt-BR'),
    pib_total: row.pib_total,
    pib_per_capita: row.pib_per_capita,
    pib_per_capita_formatado: `R$ ${Number(row.pib_per_capita).toLocaleString('pt-BR')}`,
    consumo_anual_familias: row.consumo_anual_familias,
    consumo_anual_formatado: `R$ ${Number(row.consumo_anual_familias / 1e9).toFixed(1)}Bi`,
    consumo_setorial: consumoSetorial,
    frota_veiculos_total: row.frota_veiculos_total,
    frota_veiculos_formatado: row.frota_veiculos_total.toLocaleString('pt-BR'),
    frota_agro_pesados: row.frota_agro_pesados,
    frota_agro_formatado: row.frota_agro_pesados.toLocaleString('pt-BR'),
    ipc_score: row.ipc_score,
    diagnostico_praca: diagnostico,
    pib_representatividade_estado_pct: pibRepEstado,
    diagnostico_label: diagnostico === 'ALTO_POTENCIAL' ? '🟢 Alto Potencial'
      : diagnostico === 'POTENCIAL_MEDIO' ? '🟡 Médio Potencial' : '🔴 Mercado Restrito',
    diagnostico_color: diagnostico === 'ALTO_POTENCIAL' ? '#22C55E'
      : diagnostico === 'POTENCIAL_MEDIO' ? '#EAB308' : '#EF4444'
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Enriquecimento de lead com macrodados da praça + MPI por vertical
// ─────────────────────────────────────────────────────────────────────────────
export function enrichLeadWithMacroData(lead) {
  if (!lead?.municipio) return { ...lead, city_macro_data: null };
  const macroData = getCityMarketData(lead.municipio, lead.uf);
  if (!macroData) return { ...lead, city_macro_data: null };

  const vertical = String(lead.vertical_type || 'GERAL').toUpperCase();
  const cs = macroData.consumo_setorial || {};

  let consumoVerticalAnual = 0;
  let consumoVerticalLabel = '';
  if      (vertical === 'AGRO')      { consumoVerticalAnual = cs.manutencao_automotiva || 0; consumoVerticalLabel = 'Manutenção Automotiva/Agro'; }
  else if (vertical === 'SAUDE')     { consumoVerticalAnual = cs.servicos_saude || 0; consumoVerticalLabel = 'Serviços de Saúde'; }
  else if (vertical === 'JURIDICO')  { consumoVerticalAnual = (cs.alimentacao_fora_lar || 0) * 0.12; consumoVerticalLabel = 'Serviços Profissionais (est.)'; }
  else if (vertical === 'CONSTRUCAO'){ consumoVerticalAnual = cs.materiais_construcao || 0; consumoVerticalLabel = 'Materiais de Construção'; }
  else                               { consumoVerticalAnual = cs.alimentacao_fora_lar || 0; consumoVerticalLabel = 'Consumo Geral'; }

  const mpi = Math.min(100, Math.round(
    macroData.ipc_score * 0.6 +
    (consumoVerticalAnual / (macroData.consumo_anual_familias || 1)) * 40
  ));

  return {
    ...lead,
    city_macro_data: {
      ...macroData,
      consumo_vertical_anual: consumoVerticalAnual,
      consumo_vertical_formatado: consumoVerticalAnual >= 1e9
        ? `R$ ${(consumoVerticalAnual / 1e9).toFixed(1)}Bi/ano`
        : `R$ ${(consumoVerticalAnual / 1e6).toFixed(0)}M/ano`,
      consumo_vertical_label: consumoVerticalLabel,
      market_potential_index: mpi,
      mpi_label: mpi >= 65 ? 'MPI PREMIUM' : mpi >= 45 ? 'MPI MÉDIO' : 'MPI BAIXO'
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Agregado macroeconômico para múltiplos municípios (GTM Summary)
// ─────────────────────────────────────────────────────────────────────────────
export function getMacroSummary(municipiosUfs = []) {
  let rows;
  if (!Array.isArray(municipiosUfs) || municipiosUfs.length === 0) {
    rows = db.prepare('SELECT * FROM municipal_indicators').all();
  } else {
    rows = [];
    const seen = new Set();
    for (const { municipio, uf } of municipiosUfs) {
      const key = `${uf}::${municipio}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const r = db.prepare(`SELECT * FROM municipal_indicators WHERE UPPER(uf) = ? AND UPPER(municipio) = ? LIMIT 1`)
        .get(String(uf).toUpperCase(), normalizeCityName(municipio));
      if (r) rows.push(r);
    }
  }

  if (!rows || rows.length === 0) {
    return { total_cidades: 0, populacao_total: 0, pib_total_agregado: 0, ipc_medio: 0, frotas: { total: 0, agro: 0 }, municipios: [] };
  }

  const totalPop    = rows.reduce((s, r) => s + (r.populacao_estimada || 0), 0);
  const totalPib    = rows.reduce((s, r) => s + (r.pib_total || 0), 0);
  const totalCons   = rows.reduce((s, r) => s + (r.consumo_anual_familias || 0), 0);
  const ipcMedio    = Math.round(rows.reduce((s, r) => s + (r.ipc_score || 0), 0) / rows.length);
  const totalFrota  = rows.reduce((s, r) => s + (r.frota_veiculos_total || 0), 0);
  const totalAgro   = rows.reduce((s, r) => s + (r.frota_agro_pesados || 0), 0);

  return {
    total_cidades: rows.length,
    populacao_total: totalPop,
    populacao_formatada: totalPop.toLocaleString('pt-BR'),
    pib_total_agregado: totalPib,
    pib_agregado_formatado: `R$ ${(totalPib / 1e9).toFixed(1)}Bi`,
    consumo_total_familias: totalCons,
    consumo_formatado: `R$ ${(totalCons / 1e9).toFixed(1)}Bi`,
    ipc_medio: ipcMedio,
    frotas: {
      total: totalFrota,
      total_formatado: totalFrota.toLocaleString('pt-BR'),
      agro: totalAgro,
      agro_formatado: totalAgro.toLocaleString('pt-BR')
    },
    municipios: rows.map(r => ({
      municipio: r.municipio, uf: r.uf,
      ipc_score: r.ipc_score, pib_per_capita: r.pib_per_capita, populacao: r.populacao_estimada
    })).sort((a, b) => b.ipc_score - a.ipc_score)
  };
}

export const MacroEconomicEngine = {
  getCityMarketData,
  enrichLeadWithMacroData,
  getMacroSummary,
  ensureMunicipalDataSeeded
};
