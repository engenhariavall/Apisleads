/**
 * Ponto de entrada do módulo de Verticais de Mercado e Fusão de Dados
 */

import { AgroVertical } from './agroVertical.js';
import { LegalVertical } from './legalVertical.js';
import { HealthVertical } from './healthVertical.js';
import { ConstructionVertical } from './constructionVertical.js';
import { DataFusionEngine } from './dataFusionEngine.js';

export const VERTICALS_CATALOG = [
  {
    id: 'TODOS',
    name: 'Todas as Verticais',
    icon: '🌐',
    badgeColor: '#38BDF8',
    description: 'Visão unificada multissetorial com toda a base de empresas ativas.',
    metricLabel: 'Capital Social',
    metricUnit: 'R$',
    filterControls: []
  },
  AgroVertical.metadata,
  LegalVertical.metadata,
  HealthVertical.metadata,
  ConstructionVertical.metadata
];

export {
  AgroVertical,
  LegalVertical,
  HealthVertical,
  ConstructionVertical,
  DataFusionEngine
};
