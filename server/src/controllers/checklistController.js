import path from 'path';
import { fileURLToPath } from 'url';
import { getChecklistData } from '../services/checklistParser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CHECKLIST_PATH = path.resolve(__dirname, '../../../checklist.md');

export function getChecklist(req, res) {
  try {
    const data = getChecklistData(CHECKLIST_PATH);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.json(data);
  } catch (error) {
    console.error('Erro ao ler checklist.md:', error);
    res.status(500).json({
      error: 'Falha ao processar relatório de checklist',
      message: error.message
    });
  }
}
