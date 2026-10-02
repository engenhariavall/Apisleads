/**
 * FRENTE 3: Inteligência Artificial para Geração de Criativos & Copywriting
 * Ponto de entrada unificado do subsistema de IA
 */

import { generateContextualCopies, generateCampaignCopyPack, detectLeadSegment } from './copywritingEngine.js';
import { calculatePredictiveScore } from './predictiveLeadScore.js';

export { 
  generateContextualCopies, 
  generateCampaignCopyPack, 
  detectLeadSegment, 
  calculatePredictiveScore 
};
