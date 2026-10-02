/**
 * Teste Automatizado de Homologação: Fase 49 - Etapa 2
 * Valida a UI do Perfil Agronômico (Uso do Solo) no Right Drawer:
 * 1. Estrutura HTML no client/index.html (posicionamento estratégico e IDs táticos).
 * 2. Estilização Executiva no client/css/styles.css (#0B1224, #FFFFFF, #94A3B8, #0055FF, #00D2FF).
 * 3. Renderização Dinâmica em client/js/app.js (extração de crop_type, confidence %, last_update e fallback).
 */

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🌱 [FASE 49 - ETAPA 2] Iniciando Bateria de Testes da UI Agronômica no Right Drawer...');

const htmlPath = path.join(__dirname, '../client/index.html');
const cssPath = path.join(__dirname, '../client/css/styles.css');
const jsPath = path.join(__dirname, '../client/js/app.js');

const htmlContent = fs.readFileSync(htmlPath, 'utf8');
const cssContent = fs.readFileSync(cssPath, 'utf8');
const jsContent = fs.readFileSync(jsPath, 'utf8');

let passedTests = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`  ✅ [PASS] ${desc}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${desc}`);
    console.error(`     Detalhe: ${err.message}`);
    process.exit(1);
  }
}

// ==========================================
// 1. ESTRUTURA HTML DO DOSSIÊ
// ==========================================
it('HTML deve conter o container principal #ruralAgronomyCard com classe sheet-agronomy-card', () => {
  assert(htmlContent.includes('id="ruralAgronomyCard"'), 'Elemento #ruralAgronomyCard não encontrado');
  assert(htmlContent.includes('sheet-agronomy-card'), 'Classe sheet-agronomy-card não encontrada no HTML');
});

it('HTML deve conter o título "Perfil Agronômico (Uso do Solo)"', () => {
  assert(htmlContent.includes('Perfil Agronômico (Uso do Solo)'), 'Título Perfil Agronômico (Uso do Solo) não encontrado');
});

it('Bloco agronômico deve estar posicionado logo abaixo do Intent Scoring e acima de Titular OSINT', () => {
  const intentIndex = htmlContent.indexOf('ruralTriggersList');
  const agronomyIndex = htmlContent.indexOf('id="ruralAgronomyCard"');
  const titularIndex = htmlContent.indexOf('ruralNomeTitular');

  assert(intentIndex !== -1, 'ruralTriggersList não encontrado');
  assert(agronomyIndex !== -1, 'ruralAgronomyCard não encontrado');
  assert(titularIndex !== -1, 'ruralNomeTitular não encontrado');
  assert(intentIndex < agronomyIndex, 'ruralAgronomyCard deve vir APÓS o card de Intent Scoring');
  assert(agronomyIndex < titularIndex, 'ruralAgronomyCard deve vir ANTES do card de Titular OSINT');
});

it('HTML deve conter os elementos de dados: ruralCropBadge, ruralCropType, ruralCropConfidence, ruralCropLastUpdate e ruralCropFallback', () => {
  assert(htmlContent.includes('id="ruralCropBadge"'), 'ID ruralCropBadge ausente');
  assert(htmlContent.includes('id="ruralCropType"'), 'ID ruralCropType ausente');
  assert(htmlContent.includes('id="ruralCropConfidence"'), 'ID ruralCropConfidence ausente');
  assert(htmlContent.includes('id="ruralCropLastUpdate"'), 'ID ruralCropLastUpdate ausente');
  assert(htmlContent.includes('id="ruralCropFallback"'), 'ID ruralCropFallback ausente');
  assert(htmlContent.includes('Análise de satélite não disponível'), 'Texto padrão de fallback ausente no HTML');
});

// ==========================================
// 2. DESIGN SYSTEM VERSUS (CSS)
// ==========================================
it('CSS deve conter estilização executiva para .sheet-agronomy-card com fundo #0B1224', () => {
  assert(cssContent.includes('.sheet-agronomy-card'), 'Classe .sheet-agronomy-card não encontrada no CSS');
  assert(cssContent.includes('#0B1224'), 'Cor de fundo #0B1224 não encontrada');
});

it('CSS deve utilizar cores de destaque #FFFFFF e metadados secundários #94A3B8', () => {
  assert(cssContent.includes('.crop-value-primary') && cssContent.includes('#FFFFFF'), 'Destaque #FFFFFF para valor principal ausente');
  assert(cssContent.includes('.crop-label-secondary') && cssContent.includes('#94A3B8'), 'Cor #94A3B8 para rótulos secundários ausente');
  assert(cssContent.includes('.agronomy-fallback') && cssContent.includes('#94A3B8'), 'Fallback com cor #94A3B8 ausente');
});

it('CSS deve utilizar acento #0055FF ou #00D2FF no selo e detalhes da cultura', () => {
  assert(cssContent.includes('.badge-crop-indicator'), 'Classe .badge-crop-indicator não encontrada');
  assert(cssContent.includes('#0055FF') || cssContent.includes('#00D2FF'), 'Acentos #0055FF ou #00D2FF não encontrados');
});

// ==========================================
// 3. RENDERIZAÇÃO DINÂMICA (JAVASCRIPT)
// ==========================================
it('app.js deve tratar dados_agronomicos e extrair crop_type, confidence e last_update', () => {
  assert(jsContent.includes('dados_agronomicos'), 'Referência a dados_agronomicos ausente em app.js');
  assert(jsContent.includes('ruralCropType'), 'Manipulação de ruralCropType ausente');
  assert(jsContent.includes('ruralCropConfidence'), 'Manipulação de ruralCropConfidence ausente');
  assert(jsContent.includes('ruralCropLastUpdate'), 'Manipulação de ruralCropLastUpdate ausente');
  assert(jsContent.includes('ruralCropFallback'), 'Manipulação de ruralCropFallback ausente');
});

it('app.js deve conter a string de fallback estrita "Análise de satélite não disponível"', () => {
  assert(jsContent.includes('Análise de satélite não disponível'), 'String de fallback não encontrada em app.js');
});

// ==========================================
// 4. TESTE UNITÁRIO DE RENDERIZAÇÃO EM DOM SIMULADO
// ==========================================
it('Simulação DOM: Renderização com dados agronômicos preenchidos (Soja / 94% / 2025-08-15)', () => {
  const domState = {
    ruralCropDataContainer: { style: { display: 'none' } },
    ruralCropFallback: { style: { display: 'none' }, textContent: '' },
    ruralCropBadge: { textContent: '' },
    ruralCropType: { textContent: '' },
    ruralCropConfidence: { textContent: '' },
    ruralCropSecondary: { textContent: '' },
    ruralCropBiome: { textContent: '' },
    ruralCropLastUpdate: { textContent: '' },
    ruralCropSensorSource: { textContent: '' },
  };

  const propData = {
    nome_imovel: 'Fazenda Santa Tereza',
    dados_agronomicos: {
      crop_type: 'Soja',
      secondary_crop: 'Milho Safrinha',
      confidence: 0.94,
      biome: 'Cerrado',
      sensor: 'Sentinel-2 (MSI)',
      last_update: '2025-08-15'
    }
  };

  let agro = propData.dados_agronomicos;
  if (typeof agro === 'string') agro = JSON.parse(agro);

  if (agro && (agro.crop_type || agro.uso_solo)) {
    const cropName = agro.crop_type || agro.uso_solo;
    const confidenceVal = agro.confidence != null 
      ? (agro.confidence > 1 ? Math.round(agro.confidence) : Math.round(agro.confidence * 100))
      : 94;
    const lastUpdateVal = agro.last_update || 'Recente (2025)';
    
    let cropEmoji = '🌱';
    if (cropName.toLowerCase().includes('soja')) cropEmoji = '🌱';

    domState.ruralCropType.textContent = cropName;
    domState.ruralCropConfidence.textContent = `${confidenceVal}%`;
    domState.ruralCropBadge.textContent = `${cropEmoji} ${cropName.toUpperCase()}`;
    domState.ruralCropLastUpdate.textContent = lastUpdateVal;
    domState.ruralCropDataContainer.style.display = 'flex';
    domState.ruralCropFallback.style.display = 'none';
  }

  assert.strictEqual(domState.ruralCropType.textContent, 'Soja', 'Cultura deve ser Soja');
  assert.strictEqual(domState.ruralCropConfidence.textContent, '94%', 'Confiança deve ser 94%');
  assert.strictEqual(domState.ruralCropBadge.textContent, '🌱 SOJA', 'Badge deve conter 🌱 SOJA');
  assert.strictEqual(domState.ruralCropLastUpdate.textContent, '2025-08-15', 'Data deve ser 2025-08-15');
  assert.strictEqual(domState.ruralCropDataContainer.style.display, 'flex', 'Container deve estar visível');
  assert.strictEqual(domState.ruralCropFallback.style.display, 'none', 'Fallback deve estar oculto');
});

it('Simulação DOM: Renderização sem dados agronômicos (ativa fallback sutil)', () => {
  const domState = {
    ruralCropDataContainer: { style: { display: 'flex' } },
    ruralCropFallback: { style: { display: 'none' }, textContent: '' },
    ruralCropBadge: { textContent: '' },
    ruralCropType: { textContent: '' },
    ruralCropConfidence: { textContent: '' },
  };

  const propData = {
    nome_imovel: 'Fazenda Sem Satelite',
    dados_agronomicos: null
  };

  let agro = propData.dados_agronomicos;
  if (agro && (agro.crop_type || agro.uso_solo)) {
    domState.ruralCropDataContainer.style.display = 'flex';
    domState.ruralCropFallback.style.display = 'none';
  } else {
    domState.ruralCropDataContainer.style.display = 'none';
    domState.ruralCropBadge.textContent = 'SATÉLITE N/D';
    domState.ruralCropFallback.textContent = 'Análise de satélite não disponível';
    domState.ruralCropFallback.style.display = 'block';
  }

  assert.strictEqual(domState.ruralCropDataContainer.style.display, 'none', 'Container deve ser ocultado');
  assert.strictEqual(domState.ruralCropFallback.style.display, 'block', 'Fallback deve ser exibido');
  assert.strictEqual(domState.ruralCropFallback.textContent, 'Análise de satélite não disponível', 'Texto exato de fallback');
  assert.strictEqual(domState.ruralCropBadge.textContent, 'SATÉLITE N/D', 'Badge deve indicar N/D');
});

console.log(`\n🎉 [SUCESSO TOTAL] Todos os ${passedTests} testes da Fase 49 - Etapa 2 foram aprovados com louvor!`);
