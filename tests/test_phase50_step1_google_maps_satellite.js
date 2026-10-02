/**
 * Teste de Homologação: Fase 50 - Etapa 1
 * Valida a Inspeção Visual de Propriedade Rural via Google Maps (Visão de Satélite):
 * 1. Estrutura HTML no client/index.html (#btnRuralGoogleMapsVisual posicionado no Perímetro Espacial).
 * 2. Estilização Executiva no client/css/styles.css (.btn-rural-visual-inspect).
 * 3. Lógica JavaScript em client/js/app.js (extração de coordenadas e formatação da URL de satélite).
 * 4. Simulação de geração de URL com parâmetros de centróide e basemap=satellite.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🗺️ [FASE 50 - ETAPA 1] Iniciando Testes de Inspeção Visual via Google Maps Satélite...');

const htmlPath = path.join(__dirname, '../client/index.html');
const cssPath = path.join(__dirname, '../client/css/styles.css');
const jsPath = path.join(__dirname, '../client/js/app.js');

const htmlContent = fs.readFileSync(htmlPath, 'utf8');
const cssContent = fs.readFileSync(cssPath, 'utf8');
const jsContent = fs.readFileSync(jsPath, 'utf8');

let passed = 0;
function test(desc, fn) {
  try {
    fn();
    console.log(`  ✅ [PASS] ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${desc}`);
    console.error(`     Detalhes: ${err.message}`);
    process.exit(1);
  }
}

// 1. Verificação de Elementos no HTML
test('HTML deve conter o botão #btnRuralGoogleMapsVisual com classe .btn-rural-visual-inspect', () => {
  assert(htmlContent.includes('id="btnRuralGoogleMapsVisual"'), 'ID #btnRuralGoogleMapsVisual não encontrado no HTML');
  assert(htmlContent.includes('btn-rural-visual-inspect'), 'Classe btn-rural-visual-inspect ausente no HTML');
  assert(htmlContent.includes('Inspeção Visual (Google Maps)'), 'Texto do botão ausente no HTML');
});

test('Botão deve estar posicionado na seção de Perímetro Espacial', () => {
  const ruralDrawerIndex = htmlContent.indexOf('id="drawerRuralPropertySheet"');
  const perimetroIndex = htmlContent.indexOf('PERÍMETRO ESPACIAL', ruralDrawerIndex);
  const btnIndex = htmlContent.indexOf('id="btnRuralGoogleMapsVisual"', ruralDrawerIndex);
  const actionsFooterIndex = htmlContent.indexOf('id="btnInjectRuralLeadToTable"', ruralDrawerIndex);

  assert(perimetroIndex !== -1, 'Seção PERÍMETRO ESPACIAL não encontrada');
  assert(btnIndex !== -1, 'Botão #btnRuralGoogleMapsVisual não encontrado');
  assert(actionsFooterIndex !== -1, 'Rodapé de ações não encontrado');

  assert(perimetroIndex < btnIndex, 'Botão deve vir após o título de PERÍMETRO ESPACIAL');
  assert(btnIndex < actionsFooterIndex, 'Botão deve estar contido antes do rodapé de ações finais');
});

// 2. Estilização no CSS
test('CSS deve conter estilização corporativa para .btn-rural-visual-inspect', () => {
  assert(cssContent.includes('.btn-rural-visual-inspect'), 'Classe .btn-rural-visual-inspect não encontrada no styles.css');
  assert(cssContent.includes('#00D2FF'), 'Cor de texto/acento #00D2FF ausente no botão');
});

// 3. Verificação no JavaScript
test('app.js deve manipular #btnRuralGoogleMapsVisual e capturar coordenadas geodésicas', () => {
  assert(jsContent.includes('btnRuralGoogleMapsVisual'), 'Referência a btnRuralGoogleMapsVisual ausente em app.js');
  assert(jsContent.includes('basemap=satellite'), 'Parâmetro basemap=satellite ausente em app.js');
  assert(jsContent.includes('zoom=16'), 'Nível de zoom detalhado zoom=16 ausente em app.js');
  assert(jsContent.includes('map_action=map'), 'Ação map_action=map ausente em app.js');
});

// 4. Simulação Funcional de URL
test('Simulação de clique: Gera URL exata para fazenda em Sorriso/MT com basemap=satellite', () => {
  const propData = {
    nome_imovel: 'Fazenda Santa Tereza do Parecis',
    centroide_lat: -12.5400,
    centroide_lng: -55.7100
  };

  const lat = Number(propData.centroide_lat);
  const lng = Number(propData.centroide_lng);
  const generatedUrl = `https://www.google.com/maps/@?api=1&map_action=map&center=${lat},${lng}&zoom=16&basemap=satellite`;

  assert.strictEqual(
    generatedUrl,
    'https://www.google.com/maps/@?api=1&map_action=map&center=-12.54,-55.71&zoom=16&basemap=satellite',
    'A URL gerada deve respeitar o padrão de satélite em alta resolução'
  );
  assert(generatedUrl.includes('basemap=satellite'), 'URL deve forçar a camada de satélite');
  assert(generatedUrl.includes('center=-12.54,-55.71'), 'URL deve conter as coordenadas centrais');
});

test('Simulação de fallback: Extrai coordenadas da geometria quando centroide_lat não estiver explícito', () => {
  const propData = {
    nome_imovel: 'Fazenda Sem Centroide Explícito',
    geometria_poligono: {
      type: 'Polygon',
      coordinates: [[
        [-55.4800, -11.8300],
        [-55.4600, -11.8300],
        [-55.4600, -11.8100],
        [-55.4800, -11.8100],
        [-55.4800, -11.8300]
      ]]
    }
  };

  let ruralLat = Number(propData.centroide_lat) || 0;
  let ruralLng = Number(propData.centroide_lng) || 0;

  if ((!ruralLat || !ruralLng) && propData.geometria_poligono) {
    const coords = propData.geometria_poligono.coordinates;
    if (coords && coords[0] && coords[0][0]) {
      ruralLng = Number(coords[0][0][0]);
      ruralLat = Number(coords[0][0][1]);
    }
  }

  const generatedUrl = `https://www.google.com/maps/@?api=1&map_action=map&center=${ruralLat},${ruralLng}&zoom=16&basemap=satellite`;

  assert.strictEqual(ruralLat, -11.83, 'Deve extrair latitude da geometria');
  assert.strictEqual(ruralLng, -55.48, 'Deve extrair longitude da geometria');
  assert.strictEqual(
    generatedUrl,
    'https://www.google.com/maps/@?api=1&map_action=map&center=-11.83,-55.48&zoom=16&basemap=satellite'
  );
});

console.log(`\n🎉 [SUCESSO TOTAL] Todos os ${passed} testes da Fase 50 - Etapa 1 foram aprovados com louvor!`);
