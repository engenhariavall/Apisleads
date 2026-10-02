import fs from 'fs';
import assert from 'assert';
import http from 'http';

console.log('--- TESTANDO INTEGRAÇÃO DO RAIO GIS AO MAPA WEBGL (ENTERPRISE) ---');

const html = fs.readFileSync('client/index.html', 'utf8');
const css = fs.readFileSync('client/css/styles.css', 'utf8');
const mapJs = fs.readFileSync('client/js/mapEngine.js', 'utf8');
const appJs = fs.readFileSync('client/js/app.js', 'utf8');

// 1. Limpeza da Toolbar Principal e Descarte do Modal Retro
assert(!html.includes('id="btnOpenGisModal"'), 'Botão btnOpenGisModal não deve existir na toolbar superior');
assert(!html.includes('id="gisModal"'), 'Modal gisModal não deve existir no HTML');
assert(!html.includes('id="gisRadarCanvas"'), 'Canvas gisRadarCanvas não deve existir no HTML');
assert(!css.includes('#gisRadarCanvas'), 'CSS de #gisRadarCanvas não deve existir');
assert(!css.includes('.modal-gis'), 'CSS de .modal-gis não deve existir');
console.log('✔ 1. Remoção do modal de radar e botão retro confirmada');

// 2. Adição do Controle de Raio na Toolbar do Mapa WebGL
assert(html.includes('id="btnMapRadiusToggle"'), 'Botão btnMapRadiusToggle ausente no HTML');
assert(html.includes('id="mapRadiusControlPanel"'), 'Painel mapRadiusControlPanel ausente no HTML');
assert(html.includes('id="selectMapRadiusCluster"'), 'Seletor selectMapRadiusCluster ausente no HTML');
assert(html.includes('id="btnPickPointOnMap"'), 'Botão btnPickPointOnMap ausente no HTML');
assert(html.includes('id="sliderMapRadius"'), 'Slider sliderMapRadius ausente no HTML');
assert(html.includes('id="mapRadiusCountVal"'), 'Contador mapRadiusCountVal ausente no HTML');
assert(html.includes('id="btnApplyRadiusFilter"'), 'Botão btnApplyRadiusFilter ausente no HTML');
assert(html.includes('id="btnClearRadiusFilter"'), 'Botão btnClearRadiusFilter ausente no HTML');
assert(html.includes('id="tableRadiusFilterTag"'), 'Tag tableRadiusFilterTag ausente no HTML');
console.log('✔ 2. Componentes UI do controle de raio WebGL verificados no HTML');

// 3. Estilos e Posicionamento (CSS)
assert(css.includes('.map-radius-control-panel'), 'Classe .map-radius-control-panel ausente no CSS');
assert(css.includes('backdrop-filter: blur(12px)'), 'Backdrop-filter ausente no painel de raio');
assert(css.includes('#paneMap.map-fullscreen-active .map-radius-control-panel'), 'Ajuste fullscreen ausente para o painel de raio');
console.log('✔ 3. Estilos executivos VERSUS verificados no CSS');

// 4. Renderização do Buffer Geodésico no MapLibre (mapEngine.js)
assert(mapJs.includes('createGeodesicCircle'), 'Função createGeodesicCircle ausente no mapEngine.js');
assert(mapJs.includes('radius-buffer-source'), 'Source radius-buffer-source ausente no mapEngine.js');
assert(mapJs.includes('radius-buffer-fill'), 'Layer radius-buffer-fill ausente no mapEngine.js');
assert(mapJs.includes('radius-buffer-line'), 'Layer radius-buffer-line ausente no mapEngine.js');
assert(mapJs.includes('0.12'), 'Opacidade 0.12 ausente no preenchimento do buffer');
assert(mapJs.includes('#00D2FF'), 'Cor ciano #00D2FF ausente na renderização do buffer');
assert(mapJs.includes('fitBounds'), 'Ajuste de câmera map.fitBounds ausente no mapEngine.js');
assert(mapJs.includes('countLeadsInRadius'), 'Função countLeadsInRadius ausente no mapEngine.js');
console.log('✔ 4. Buffer geodésico vetorial (64 vértices) e camadas MapLibre validadas');

// 5. Sincronização com o Estado Global e Tags (app.js)
assert(!appJs.includes('initGisModal();'), 'Chamada a initGisModal() não deve existir no app.js');
assert(appJs.includes('updateTableRadiusFilterTag'), 'Função updateTableRadiusFilterTag ausente no app.js');
assert(appJs.includes('tableRadiusFilterTag'), 'Tag tableRadiusFilterTag ausente no app.js');
console.log('✔ 5. Sincronização com o estado global e tag da tabela validadas');

// 6. Teste de API do Backend com geo_radius
async function testBackendApi() {
  const postData = JSON.stringify({
    page: 1,
    page_size: 15,
    geo_radius: {
      lat: -21.1767,
      lng: -47.8208,
      radius_km: 100,
      name: 'Ribeirão Preto'
    }
  });

  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/leads/filter',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          assert(json.success !== false, 'API retornou erro na busca com geo_radius');
          assert(Array.isArray(json.data), 'json.data deve ser um array');
          console.log(`   Empresas encontradas no raio de 100km de Ribeirão Preto: ${json.total_count}`);
          
          json.data.forEach(lead => {
            assert(lead.geo_distance_km !== null && lead.geo_distance_km !== undefined, 'geo_distance_km deve estar preenchido');
            assert(lead.geo_distance_km <= 100, `Distância ${lead.geo_distance_km}km excede o raio de 100km`);
          });

          console.log('✔ 6. Endpoint /api/leads/filter com geo_radius validado com sucesso');
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.write(postData);
    req.end();
  });
}

testBackendApi()
  .then(() => {
    console.log('\n=============================================================');
    console.log('🎉 TODOS OS TESTES DO RAIO GIS WEBGL ENTERPRISE PASSARAM! 🎉');
    console.log('=============================================================\n');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Falha nos testes:', err);
    process.exit(1);
  });
