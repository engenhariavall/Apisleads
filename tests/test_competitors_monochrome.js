import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function testCompetitorsMonochrome() {
  const htmlPath = path.join(__dirname, '..', 'client', 'index.html');
  const jsPath = path.join(__dirname, '..', 'client', 'js', 'app.js');
  const mapJsPath = path.join(__dirname, '..', 'client', 'js', 'mapEngine.js');
  const cssPath = path.join(__dirname, '..', 'client', 'css', 'styles.css');

  const html = fs.readFileSync(htmlPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');
  const mapJs = fs.readFileSync(mapJsPath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');

  // Check paneCompetitors in index.html
  const compStart = html.indexOf('id="paneCompetitors"');
  if (compStart === -1) throw new Error('paneCompetitors not found in index.html');
  const compEnd = html.indexOf('<!-- ===', compStart);
  const compSlice = html.substring(compStart, compEnd);

  const forbiddenEmojis = ['🕵️', '🕵', '🔍', '📍', '🌐', '🎯', '🗺️', '🗺', '🚨', '⚠️', '✅'];
  for (const emoji of forbiddenEmojis) {
    if (compSlice.includes(emoji)) {
      throw new Error(`Found forbidden emoji in paneCompetitors: "${emoji}"`);
    }
  }

  // Check legendCompetitorsSection in index.html
  const legStart = html.indexOf('id="legendCompetitorsSection"');
  if (legStart !== -1) {
    const legEnd = html.indexOf('<!-- VISÃO 3', legStart);
    const legSlice = html.substring(legStart, legEnd);
    for (const emoji of forbiddenEmojis) {
      if (legSlice.includes(emoji)) {
        throw new Error(`Found forbidden emoji in legendCompetitorsSection: "${emoji}"`);
      }
    }
  }

  // Check app.js competitor and gaps renderers
  const compFuncSlice = js.substring(js.indexOf('window.renderCompetitorsTable'), js.indexOf('// Handler de Consulta de Concorrente'));
  for (const emoji of forbiddenEmojis) {
    if (compFuncSlice.includes(emoji)) {
      throw new Error(`Found forbidden emoji in competitor/gaps functions in app.js: "${emoji}"`);
    }
  }

  // Check mapEngine.js popup
  if (mapJs.includes('🚨 CONCORRENTE')) {
    throw new Error('Found forbidden emoji in mapEngine.js competitor popup');
  }

  // Check styles.css for competitor glows/cyan gradients
  const compRowIdx = css.indexOf('.competitor-row.selected-competitor');
  if (compRowIdx !== -1) {
    const compRowBlock = css.substring(compRowIdx, compRowIdx + 150);
    if (compRowBlock.includes('#00D2FF')) {
      throw new Error('Found neon cyan border on selected competitor in styles.css');
    }
  }

  console.log('✅ Competitors & Gaps Monochrome Audit passed with 100% success! Zero forbidden emojis or flashy gradients found.');
}

try {
  testCompetitorsMonochrome();
} catch (err) {
  console.error('❌ Competitors & Gaps Monochrome Audit failed:', err.message);
  process.exit(1);
}
