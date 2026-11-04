import test from 'node:test';
import assert from 'node:assert/strict';
import Proposal from '../models/Proposal.js';

test('proposal model stores technical & commercial structure fields', async () => {
  const proposalData = {
    number: '00001',
    projectTitle: 'Renovação e Restauração da Comunicação Visual em Vidros',
    projectDescription: 'Desmontagem técnica, descontaminação dos vidros...',
    areasContemplated: 'Fachada Frontal Fixa: 02 vidros fixos...',
    executionProcess: 'Remoção, Limpeza, Preparação...',
    specialCourtesy: 'Cortesia especial limpeza da placa',
    items: [{ description: 'Serviço completo', quantity: 1, unitPrice: 3670 }],
  };

  const p = new Proposal(proposalData);
  await p.validate();
  assert.equal(p.projectTitle, 'Renovação e Restauração da Comunicação Visual em Vidros');
  assert.equal(p.totalAmount, 3670);
  assert.equal(p.specialCourtesy, 'Cortesia especial limpeza da placa');
});
