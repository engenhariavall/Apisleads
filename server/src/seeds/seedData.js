import db from '../config/database.js';
import crypto from 'crypto';

// Catálogo de Segmentos com Matriz de Inversão de CNAE (BUYER vs SUPPLIER)
const SEGMENTS_DATA = [
  {
    id: 'seg_agro',
    name: 'Agronegócio & Pecuária',
    icon: '🌾',
    description: 'Produtores rurais, fazendas, cooperativas agrícolas, pecuária e maquinários.',
    cnaes: [
      // Compradores Finais (ICP do Agronegócio)
      { code: '0115-6/00', desc: 'Cultivo de soja', target_type: 'BUYER' },
      { code: '0111-3/02', desc: 'Cultivo de milho', target_type: 'BUYER' },
      { code: '0113-0/00', desc: 'Cultivo de cana-de-açúcar', target_type: 'BUYER' },
      { code: '0151-2/01', desc: 'Criação de bovinos para corte', target_type: 'BUYER' },
      { code: '0151-2/02', desc: 'Criação de bovinos para leite', target_type: 'BUYER' },
      { code: '0161-0/99', desc: 'Atividades de apoio à agricultura não especificadas anteriormente', target_type: 'BUYER' },

      // Fornecedores / Revendas / Concorrentes (Geralmente excluídos por gestores de tráfego)
      { code: '0162-8/99', desc: 'Atividades de apoio à pecuária não especificadas anteriormente', target_type: 'SUPPLIER' },
      { code: '2833-0/00', desc: 'Fabricação de máquinas e equipamentos para a agricultura e pecuária', target_type: 'SUPPLIER' },
      { code: '3314-7/11', desc: 'Manutenção e reparação de máquinas e equipamentos para agricultura e pecuária', target_type: 'SUPPLIER' },
      { code: '4683-4/00', desc: 'Comércio atacadista de defensivos agrícolas, adubos e fertilizantes', target_type: 'SUPPLIER' },
      { code: '7490-1/03', desc: 'Serviços de agronomia e de consultoria às atividades agrícolas e pecuárias', target_type: 'SUPPLIER' }
    ]
  },
  {
    id: 'seg_saude',
    name: 'Saúde & Clínicas Médicas',
    icon: '🩺',
    description: 'Clínicas médicas, odontologia, estética avançada, laboratórios e centros de diagnóstico.',
    cnaes: [
      // Compradores (Clínicas e Consultórios)
      { code: '8630-5/01', desc: 'Atividade médica ambulatorial com recursos para realização de procedimentos cirúrgicos', target_type: 'BUYER' },
      { code: '8630-5/02', desc: 'Atividade médica ambulatorial com recursos para realização de exames complementares', target_type: 'BUYER' },
      { code: '8630-5/03', desc: 'Atividade médica ambulatorial restrita a consultas', target_type: 'BUYER' },
      { code: '8630-5/04', desc: 'Atividade odontológica', target_type: 'BUYER' },
      { code: '8650-0/01', desc: 'Atividades de enfermagem', target_type: 'BUYER' },
      { code: '8650-0/04', desc: 'Atividades de fisioterapia', target_type: 'BUYER' },

      // Fornecedores / Centros Técnicos
      { code: '8640-2/02', desc: 'Laboratórios de análises clínicas', target_type: 'SUPPLIER' },
      { code: '8640-2/05', desc: 'Serviços de diagnóstico por imagem com uso de radiação e ressonância', target_type: 'SUPPLIER' }
    ]
  },
  {
    id: 'seg_construcao',
    name: 'Construção Civil & Engenharia',
    icon: '🏗️',
    description: 'Construtoras, incorporadoras, empreiteiras, reformas comerciais e terraplenagem.',
    cnaes: [
      // Compradores (Construtoras e Empreiteiras)
      { code: '4120-4/00', desc: 'Construção de edifícios', target_type: 'BUYER' },
      { code: '4313-4/00', desc: 'Obras de terraplenagem', target_type: 'BUYER' },
      { code: '4330-4/04', desc: 'Serviços de pintura de edifícios em geral', target_type: 'BUYER' },

      // Prestadores Especializados / Fornecedores
      { code: '4321-5/00', desc: 'Instalação e manutenção elétrica', target_type: 'SUPPLIER' },
      { code: '4322-3/01', desc: 'Instalações hidráulicas, sanitárias e de gás', target_type: 'SUPPLIER' },
      { code: '7112-0/00', desc: 'Serviços de engenharia', target_type: 'SUPPLIER' }
    ]
  },
  {
    id: 'seg_juridico',
    name: 'Jurídico, Contábil & Consultoria',
    icon: '⚖️',
    description: 'Escritórios de advocacia, sociedades de contabilidade, auditoria e consultorias.',
    cnaes: [
      { code: '6911-7/01', desc: 'Serviços advocatícios', target_type: 'BUYER' },
      { code: '6920-6/01', desc: 'Atividades de contabilidade', target_type: 'BUYER' },
      { code: '6920-6/02', desc: 'Atividades de consultoria e auditoria contábil e tributária', target_type: 'SUPPLIER' },
      { code: '7020-4/00', desc: 'Atividades de consultoria em gestão empresarial', target_type: 'SUPPLIER' }
    ]
  },
  {
    id: 'seg_tech',
    name: 'Tecnologia & Marketing Digital',
    icon: '💻',
    description: 'Empresas de software SaaS, consultorias de TI, agências de marketing e publicidade.',
    cnaes: [
      { code: '6201-5/01', desc: 'Desenvolvimento de programas de computador sob encomenda', target_type: 'BUYER' },
      { code: '6202-3/00', desc: 'Desenvolvimento e licenciamento de programas de computador customizáveis', target_type: 'BUYER' },
      { code: '6311-9/00', desc: 'Tratamento de dados, provedores de serviços de aplicação e hospedagem', target_type: 'BUYER' },
      { code: '6204-0/00', desc: 'Consultoria em tecnologia da informação', target_type: 'SUPPLIER' },
      { code: '7311-4/00', desc: 'Agências de publicidade e marketing digital', target_type: 'SUPPLIER' },
      { code: '7319-0/02', desc: 'Promoção de vendas e publicidade no local de venda', target_type: 'SUPPLIER' }
    ]
  },
  {
    id: 'seg_industria',
    name: 'Indústria & Manufatura',
    icon: '⚙️',
    description: 'Indústrias de transformação, embalagens, metalurgia e confecções.',
    cnaes: [
      { code: '1099-6/99', desc: 'Fabricação de outros produtos alimentícios não especificados anteriormente', target_type: 'BUYER' },
      { code: '2511-0/00', desc: 'Fabricação de estruturas metálicas', target_type: 'SUPPLIER' },
      { code: '2222-6/00', desc: 'Fabricação de embalagens de material plástico', target_type: 'SUPPLIER' },
      { code: '1811-3/02', desc: 'Impressão de livros, revistas e outras publicações periódicas', target_type: 'SUPPLIER' }
    ]
  }
];

// Leads base fiéis aos prints do usuário
const BASE_LEADS = [
  {
    cnpj: '18.737.953/0001-00',
    razao_social: 'FAZENDA ROSARIO AGROPECUARIA LTDA',
    nome_fantasia: null,
    cnae_codigo: '0115-6/00',
    cnae_desc: 'Cultivo de soja',
    target_type: 'BUYER',
    natureza_juridica: '206-2 - Sociedade Empresária Limitada',
    porte: 'DEMAIS',
    capital_social: 12500000.00,
    logradouro: 'RODOVIA PR 151',
    numero: 'KM 142',
    bairro: 'ZONA RURAL',
    cep: '84001-970',
    municipio: 'PONTA GROSSA',
    uf: 'PR',
    telefone: '(42) 3220-4100',
    email: 'contato@fazendarosario.com.br'
  },
  {
    cnpj: '53.704.715/0001-91',
    razao_social: 'AGRO MARAVILHA LTDA',
    nome_fantasia: 'AGRO MARAVILHA LTDA',
    cnae_codigo: '0115-6/00',
    cnae_desc: 'Cultivo de soja',
    target_type: 'BUYER',
    natureza_juridica: '206-2 - Sociedade Empresária Limitada',
    porte: 'DEMAIS',
    capital_social: 8400000.00,
    logradouro: 'ESTRADA GERAL LINHA BOA VISTA',
    numero: 'S/N',
    bairro: 'INTERIOR',
    cep: '85540-000',
    municipio: 'MANGUEIRINHA',
    uf: 'PR',
    telefone: '(46) 3243-1580',
    email: 'financeiro@agromaravilha.agr.br'
  },
  {
    cnpj: '82.403.692/0001-83',
    razao_social: 'KRZYSNSKI & CIA LTDA',
    nome_fantasia: 'TRANSPORTADORA TOCAJIO',
    cnae_codigo: '0115-6/00',
    cnae_desc: 'Cultivo de soja',
    target_type: 'BUYER',
    natureza_juridica: '206-2 - Sociedade Empresária Limitada',
    porte: 'EPP',
    capital_social: 1850000.00,
    logradouro: 'AVENIDA CARLOS CAVALCANTI',
    numero: '4500',
    bairro: 'UVARANAS',
    cep: '84030-000',
    municipio: 'PONTA GROSSA',
    uf: 'PR',
    telefone: '(42) 3235-8890',
    email: 'operacional@tocajo.com.br'
  },
  {
    cnpj: '42.817.939/0001-93',
    razao_social: 'LUDVIG E BORTHOLAZZI LTDA',
    nome_fantasia: 'FAZENDA DOIS IRMAOS',
    cnae_codigo: '0115-6/00',
    cnae_desc: 'Cultivo de soja',
    target_type: 'BUYER',
    natureza_juridica: '206-2 - Sociedade Empresária Limitada',
    porte: 'DEMAIS',
    capital_social: 5600000.00,
    logradouro: 'ESTRADA DA FAIXA',
    numero: 'KM 12',
    bairro: 'ZONA RURAL',
    cep: '85980-000',
    municipio: 'GUAIRA',
    uf: 'PR',
    telefone: '(44) 3642-1200',
    email: 'doisirmaos@fazendabia.com.br'
  },
  {
    cnpj: '36.098.513/0001-24',
    razao_social: 'AGROPECUARIA PARAGUASSU LTDA',
    nome_fantasia: null,
    cnae_codigo: '0115-6/00',
    cnae_desc: 'Cultivo de soja',
    target_type: 'BUYER',
    natureza_juridica: '206-2 - Sociedade Empresária Limitada',
    porte: 'DEMAIS',
    capital_social: 4200000.00,
    logradouro: 'ESTRADA DO CURRAL ALTO',
    numero: 'S/N',
    bairro: 'ZONA RURAL',
    cep: '96230-000',
    municipio: 'SANTA VITORIA DO PALMAR',
    uf: 'RS',
    telefone: '(53) 3263-2211',
    email: 'administracao@paraguassuagro.com.br'
  },
  {
    cnpj: '30.648.625/0001-25',
    razao_social: 'LOURDES MAIRA MATEUS MAIA 09135764832',
    nome_fantasia: null,
    cnae_codigo: '2833-0/00',
    cnae_desc: 'Fabricação de máquinas e equipamentos para a agricultura e pecuária',
    target_type: 'SUPPLIER',
    natureza_juridica: '213-5 - Empresário Individual',
    porte: 'ME',
    capital_social: 120000.00,
    logradouro: 'RUA DO ROSARIO',
    numero: '1240',
    bairro: 'CENTRO',
    cep: '13400-186',
    municipio: 'PIRACICABA',
    uf: 'SP',
    telefone: '(19) 3433-7710',
    email: 'lourdes.maia@agroequip.com.br'
  },
  {
    cnpj: '49.963.214/0001-52',
    razao_social: 'KZ COMUNICACOES LTDA',
    nome_fantasia: 'K&Z COMUNICACOES II',
    cnae_codigo: '7311-4/00',
    cnae_desc: 'Agências de publicidade e marketing digital',
    target_type: 'SUPPLIER',
    natureza_juridica: '206-2 - Sociedade Empresária Limitada',
    porte: 'EPP',
    capital_social: 350000.00,
    logradouro: 'AVENIDA PAULISTA',
    numero: '1842',
    bairro: 'BELA VISTA',
    cep: '01310-200',
    municipio: 'SAO PAULO',
    uf: 'SP',
    telefone: '(11) 3105-8820',
    email: 'contato@kzcomunicacoes.com.br'
  },
  {
    cnpj: '51.082.413/0001-01',
    razao_social: "D'HRICO IMPORTACAO E EXPORTACAO LTDA",
    nome_fantasia: "D'HRICO IMPORTACAO E EXPORTACAO",
    cnae_codigo: '4683-4/00',
    cnae_desc: 'Comércio atacadista de defensivos agrícolas, adubos e fertilizantes',
    target_type: 'SUPPLIER',
    natureza_juridica: '206-2 - Sociedade Empresária Limitada',
    porte: 'DEMAIS',
    capital_social: 3200000.00,
    logradouro: 'RUA MARCILIO DIAS',
    numero: '890',
    bairro: 'SAO JOAQUIM',
    cep: '16050-300',
    municipio: 'ARACATUBA',
    uf: 'SP',
    telefone: '(18) 3622-9015',
    email: 'dhrico@agroquimica.com.br'
  },
  {
    cnpj: '04.948.053/0002-70',
    razao_social: 'EMBRASIL IMPRESSORA LTDA - EM RECUPERACAO JUDICIAL',
    nome_fantasia: null,
    cnae_codigo: '1811-3/02',
    cnae_desc: 'Impressão de livros, revistas e outras publicações periódicas',
    target_type: 'SUPPLIER',
    natureza_juridica: '206-2 - Sociedade Empresária Limitada',
    porte: 'DEMAIS',
    capital_social: 14500000.00,
    logradouro: 'RUA MARECHAL DEODORO',
    numero: '630',
    bairro: 'CENTRO',
    cep: '80010-010',
    municipio: 'CURITIBA',
    uf: 'PR',
    telefone: '(41) 3014-5500',
    email: 'financeiro@embrasilgrafica.com.br'
  },
  {
    cnpj: '57.704.302/0001-68',
    razao_social: '57.704.302 CHARLLES BRANDAO SILVA',
    nome_fantasia: null,
    cnae_codigo: '3314-7/11',
    cnae_desc: 'Manutenção e reparação de máquinas e equipamentos para agricultura e pecuária',
    target_type: 'SUPPLIER',
    natureza_juridica: '213-5 - Empresário Individual',
    porte: 'MEI',
    capital_social: 50000.00,
    logradouro: 'AVENIDA PERIMETRAL NORTE',
    numero: '3150',
    bairro: 'SETOR PROGRESSO',
    cep: '74560-550',
    municipio: 'GOIANIA',
    uf: 'GO',
    telefone: '(62) 3578-1900',
    email: 'charlles.manutencao@gmail.com'
  }
];

function generateAdditionalLeads() {
  const citiesByUf = {
    SP: ['SAO PAULO', 'PIRACICABA', 'CAMPINAS', 'RIBEIRAO PRETO', 'ARACATUBA', 'SOROCABA', 'SAO JOSE DO RIO PRETO'],
    PR: ['CURITIBA', 'LONDRINA', 'MARINGA', 'PONTA GROSSA', 'CASCAVEL', 'GUAIRA', 'MANGUEIRINHA', 'TOLEDO'],
    RS: ['PORTO ALEGRE', 'PASSO FUNDO', 'SANTA VITORIA DO PALMAR', 'CAXIAS DO SUL', 'PELOTAS', 'SANTA MARIA'],
    SC: ['FLORIANOPOLIS', 'JOINVILLE', 'CHAPECO', 'BLUMENAU', 'CRICIUMA', 'LAGES'],
    GO: ['GOIANIA', 'RIO VERDE', 'JATAI', 'ANAPOLIS', 'ITUMBIARA'],
    MT: ['CUIABA', 'RONDONOPOLIS', 'SORRISO', 'SINOP', 'LUCAS DO RIO VERDE', 'NOVA MUTUM'],
    MS: ['CAMPO GRANDE', 'DOURADOS', 'TRES LAGOAS', 'MARACAJU', 'SAO GABRIEL DO OESTE'],
    MG: ['BELO HORIZONTE', 'UBERLANDIA', 'UBERABA', 'PATOS DE MINAS', 'POUSO ALEGRE'],
    BA: ['SALVADOR', 'LUIS EDUARDO MAGALHAES', 'BARREIRAS', 'FEIRA DE SANTANA']
  };

  const prefixes = ['AGROPECUARIA', 'COMERCIAL', 'CLINICA', 'CONSTRUTORA', 'SOLUCOES', 'ADVOGADOS', 'LABORATORIO', 'IND'];
  const suffixes = ['DO BRASIL', 'SUL', 'CENTRO-OESTE', 'INTEGRADA', 'INOVACOES', 'PARTICIPACOES', 'SERVICOS'];
  const portes = ['MEI', 'ME', 'EPP', 'DEMAIS'];

  const leads = [];

  const allCnaes = [];
  SEGMENTS_DATA.forEach(seg => {
    seg.cnaes.forEach(c => allCnaes.push({ ...c, seg_id: seg.id }));
  });

  let counter = 1000;

  Object.entries(citiesByUf).forEach(([uf, cities]) => {
    cities.forEach(city => {
      const companiesPerCity = 12;
      for (let i = 0; i < companiesPerCity; i++) {
        counter++;
        const cnae = allCnaes[(counter) % allCnaes.length];
        const porte = portes[counter % portes.length];
        const capital = (counter * 1450) + (porte === 'DEMAIS' ? 2500000 : porte === 'EPP' ? 450000 : porte === 'ME' ? 120000 : 35000);

        const cnpjPrefix = String(10000000 + counter).padStart(8, '0');
        const formattedCnpj = `${cnpjPrefix.slice(0, 2)}.${cnpjPrefix.slice(2, 5)}.${cnpjPrefix.slice(5, 8)}/0001-${String(counter % 90 + 10)}`;

        const baseName = `${prefixes[counter % prefixes.length]} ${city} ${suffixes[counter % suffixes.length]}`;
        const razaoSocial = `${baseName} LTDA`;
        const nomeFantasia = counter % 2 === 0 ? baseName : null;

        const ddd = uf === 'SP' ? '11' : uf === 'PR' ? '41' : uf === 'RS' ? '51' : uf === 'SC' ? '48' : uf === 'GO' ? '62' : uf === 'MT' ? '65' : uf === 'MS' ? '67' : uf === 'MG' ? '31' : '71';
        const rawPhone = `${ddd}9${String(80000000 + counter).slice(0, 8)}`;
        const formattedPhone = `(${ddd}) 9${rawPhone.slice(3, 7)}-${rawPhone.slice(7)}`;

        leads.push({
          cnpj: formattedCnpj,
          razao_social: razaoSocial,
          nome_fantasia: nomeFantasia,
          cnae_codigo: cnae.code,
          cnae_desc: cnae.desc,
          target_type: cnae.target_type || 'BUYER',
          natureza_juridica: '206-2 - Sociedade Empresária Limitada',
          porte,
          capital_social: capital,
          logradouro: `AVENIDA BRASIL`,
          numero: String((counter % 900) + 10),
          bairro: 'CENTRO',
          cep: `${String(counter % 80000 + 10000).padStart(5, '0')}-000`,
          municipio: city,
          uf,
          telefone: formattedPhone,
          email: `contato@${baseName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com.br`
        });
      }
    });
  });

  return leads;
}

export function runSeed() {
  console.log('🌱 Repovoando banco de dados com Matriz de ICP (Compradores vs Fornecedores)...');

  // Limpa tabelas antes do repovoamento
  db.exec('DELETE FROM segment_cnaes; DELETE FROM segments; DELETE FROM leads;');

  const insertSegmentStmt = db.prepare(`
    INSERT OR REPLACE INTO segments (id, name, icon, description)
    VALUES (?, ?, ?, ?)
  `);

  const insertSegmentCnaeStmt = db.prepare(`
    INSERT OR REPLACE INTO segment_cnaes (id, segment_id, cnae_code, cnae_description, target_type)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const seg of SEGMENTS_DATA) {
    insertSegmentStmt.run(seg.id, seg.name, seg.icon, seg.description);
    for (const cnae of seg.cnaes) {
      const cnaeId = crypto.randomUUID();
      insertSegmentCnaeStmt.run(cnaeId, seg.id, cnae.code, cnae.desc, cnae.target_type);
    }
  }

  const insertLeadStmt = db.prepare(`
    INSERT OR REPLACE INTO leads (
      id, cnpj, cnpj_raw, razao_social, nome_fantasia,
      cnae_principal_codigo, cnae_principal_descricao, cnaes_secundarios,
      natureza_juridica, porte, capital_social, target_type,
      logradouro, numero, bairro, cep, municipio, uf,
      telefone, telefone_sanitized, email
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?
    )
  `);

  const allLeadsToInsert = [...BASE_LEADS, ...generateAdditionalLeads()];

  db.exec('BEGIN TRANSACTION;');
  try {
    for (const lead of allLeadsToInsert) {
      const id = crypto.randomUUID();
      const cnpjRaw = lead.cnpj.replace(/\D/g, '');
      const phoneSanitized = lead.telefone ? lead.telefone.replace(/\D/g, '') : null;

      insertLeadStmt.run(
        id,
        lead.cnpj,
        cnpjRaw,
        lead.razao_social,
        lead.nome_fantasia,
        lead.cnae_codigo,
        lead.cnae_desc,
        JSON.stringify([]),
        lead.natureza_juridica,
        lead.porte,
        lead.capital_social,
        lead.target_type,
        lead.logradouro,
        lead.numero,
        lead.bairro,
        lead.cep,
        lead.municipio,
        lead.uf,
        lead.telefone,
        phoneSanitized,
        lead.email
      );
    }
    db.exec('COMMIT;');
    console.log(`✅ ${allLeadsToInsert.length} leads corporativos indexados com Matriz de ICP.`);
  } catch (error) {
    db.exec('ROLLBACK;');
    console.error('❌ Erro durante a transação de seed:', error);
    throw error;
  }
}

if (process.argv[1]?.endsWith('seedData.js')) {
  runSeed();
}
