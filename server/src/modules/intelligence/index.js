/**
 * INTELIGÊNCIA CADASTRAL & GRAFO SOCIETÁRIO (PADRÃO VERSUS)
 * Exportador Central de Módulos de Inteligência
 */

export { resolveRealCategory } from './categoryResolver.js';
export { calculateVitalityIndex } from './vitalityEngine.js';
export {
  EconomicGroupsEngine,
  resolveEconomicGroups,
  enrichLeadsWithEconomicGroups,
  getEconomicGroupDossier
} from './economicGroupsEngine.js';
export {
  getDemographicAnalysis,
  enrichLeadWithMacroData,
  getSectoralNicheMetrics
} from './demographicsEngine.js';
export { calculateIcpFitScore } from './icpScoringEngine.js';
export { calculateGtmMarketFunnel } from './gtmMetricsEngine.js';
