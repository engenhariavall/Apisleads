// Native fetch is available in Node 18+

async function verify() {
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/u;

  // 1. Check index.html served
  const resHtml = await fetch('http://localhost:3000');
  const html = await resHtml.text();
  const sparksSection = html.slice(html.indexOf('paneSparks'), html.indexOf('paneSparks') + 3000);
  console.log('--- Chips de Filtro Servidos ---');
  const chipMatches = sparksSection.match(/<button[^>]*class="sparks-filter-chip[^"]*"[^>]*>[\s\S]*?<\/button>/g) || [];
  chipMatches.forEach(c => console.log('  -> ' + c.replace(/\s+/g, ' ')));

  // 2. Check signals API
  const resSignals = await fetch('http://localhost:3000/api/sparks/signals');
  const signals = await resSignals.json();
  console.log('\n--- Sinais da API (' + signals.data.length + ' sinais) ---');
  let hasEmoji = false;
  signals.data.forEach(s => {
    const has = emojiRegex.test(s.trigger_texto) || emojiRegex.test(s.titulo);
    if (has) hasEmoji = true;
    console.log(`  [${has ? 'FAIL' : 'OK'}] ${s.spark_type}: ${s.trigger_texto}`);
  });

  // 3. Check dossier API
  if (signals.data.length > 0) {
    const resDossier = await fetch('http://localhost:3000/api/sparks/signals/' + signals.data[0].id + '/dossier');
    const dossier = await resDossier.json();
    console.log('\n--- Dossiê Raio-X (' + dossier.data.lead.razao_social + ') ---');
    console.log('Gatilho: ' + dossier.data.signal.trigger_texto);
    console.log('Gatilhos de scoring:');
    dossier.data.scoring_triggers.forEach(t => {
      console.log('  - ' + t.label + ' (' + t.pts + ')');
    });
  }

  console.log('\nRESULTADO FINAL: ' + (hasEmoji ? '❌ EMOJIS ENCONTRADOS' : '✅ 100% LIMPO E PROFISSIONAL'));
}

verify().catch(console.error);
