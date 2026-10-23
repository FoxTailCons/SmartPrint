import { getOrderBalance, getOrderDiscountTotal } from './orderBalance.js';

export const printCompany = {
  name: 'SMART PRINT LINDÓIA',
  cnpj: '30.792.498/0001-33',
  address: 'Rua Doutor Francisco Tozzi, 235',
  neighborhood: 'Jardim Redentor',
  city: 'Lindóia-SP',
  zipCode: '13958-040',
  phone: '(19) 99803-1407',
};

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]));

const formatMoney = (value) => Number(value || 0).toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const formatDate = (value) => value
  ? new Date(value).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  : '—';

const formatCivilDate = (value) => {
  if (!value) return '—';
  const date = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : formatDate(value);
};

const header = `
  <header class="center">
    <h1>${printCompany.name}</h1>
    <div>CNPJ: ${printCompany.cnpj}</div>
    <div>${printCompany.address}</div>
    <div>${printCompany.neighborhood} · ${printCompany.city}</div>
    <div>CEP: ${printCompany.zipCode}</div>
    <div>Tel: ${printCompany.phone}</div>
  </header>`;

const documentHtml = (title, content) => `<!doctype html>
  <html lang="pt-BR">
    <head>
      <meta charset="utf-8">
      <title>${escapeHtml(title)}</title>
      <style>
        * { box-sizing: border-box; }
        @page { size: 80mm auto; margin: 0; }
        body { width: 72mm; margin: 0 auto; padding: 4mm 0; color: #111; font: 12px Arial, sans-serif; }
        header { border-bottom: 1px dashed #111; padding-bottom: 8px; margin-bottom: 10px; line-height: 1.45; }
        h1 { margin: 0 0 4px; font-size: 16px; }
        h2 { margin: 0 0 10px; font-size: 14px; text-align: center; }
        .center { text-align: center; }
        .line { display: flex; justify-content: space-between; gap: 8px; margin: 4px 0; }
        .block { margin: 8px 0; padding-bottom: 7px; border-bottom: 1px dashed #999; }
        .item { margin: 8px 0; }
        .muted { color: #444; font-size: 11px; }
        .total { border-top: 1px solid #111; padding-top: 6px; font-size: 14px; font-weight: bold; }
        .balance { margin-top: 6px; font-weight: bold; }
        .notes { white-space: pre-wrap; overflow-wrap: anywhere; }
        @media screen { body { margin: 20px auto; } }
      </style>
    </head>
    <body>${header}${content}</body>
  </html>`;

const documentLabel = (order) => (
  ['aprovado', 'concluido'].includes(order?.status) || Number(order?.amountPaid || 0) > 0
    ? 'PEDIDO'
    : 'ORÇAMENTO'
);

const itemTotal = (item) => Number(item.total ?? (
  Number(item.quantity || 0) * Number(item.unitPrice || 0)
  + Number(item.installationFee || 0)
  + Number(item.travelFee || 0)
));

export function buildOrderThermalHtml(order) {
  const number = escapeHtml(order?.number || '—');
  const items = (order?.items || []).map((item) => `
    <div class="item block">
      <div><strong>${escapeHtml(item.description || 'Item')}</strong></div>
      <div class="line"><span>${escapeHtml(item.quantity ?? 0)} × ${formatMoney(item.unitPrice)}</span><strong>${formatMoney(itemTotal(item))}</strong></div>
    </div>`).join('');
  const subtotal = Number(order?.totalValue || 0);
  const discount = Number(order?.discount || 0);
  const total = Number(order?.finalValue ?? Math.max(0, subtotal - discount));
  const paid = Number(order?.amountPaid || 0);
  const paymentDiscounts = getOrderDiscountTotal(order);
  const balance = getOrderBalance(order);
  const client = order?.client || {};
  const clientAddress = [
    [client.address, client.addressNumber].filter(Boolean).join(', '),
    client.addressComplement,
  ].filter(Boolean).join(' - ');
  const clientDetails = [
    ['CPF/CNPJ', client.document],
    ['Inscrição Estadual', client.stateRegistration],
    ['Telefone', client.phone],
    ['Contato', client.contact],
    ['E-mail', client.email],
    ['Endereço', clientAddress],
    ['Bairro', client.neighborhood],
    ['Cidade', [client.city, client.state].filter(Boolean).join(' - ')],
    ['CEP', client.zipCode],
  ].filter(([, value]) => value)
    .map(([label, value]) => `<div><strong>${label}:</strong> ${escapeHtml(value)}</div>`)
    .join('');
  const paymentLines = (order?.payments || []).filter((payment) => !payment.canceledAt).map((payment) => `
    <div class="line"><span>${escapeHtml(payment.method || 'Pagamento')} · ${formatDate(payment.paidAt)}</span><span>${formatMoney(payment.amount)}</span></div>`).join('');
  const content = `
    <h2>${documentLabel(order)} Nº ${number}</h2>
    <div class="block">
      <div><strong>Cliente:</strong> ${escapeHtml(client.name || 'Cliente não cadastrado')}</div>
      ${clientDetails}
      <div><strong>Emissão:</strong> ${formatDate(order?.createdAt)}</div>
      ${order?.deliveryDate ? `<div><strong>Entrega:</strong> ${formatCivilDate(order.deliveryDate)}</div>` : ''}
    </div>
    <div><strong>ITENS</strong></div>
    ${items || '<div class="muted">Nenhum item informado.</div>'}
    <div class="line"><span>Subtotal</span><span>${formatMoney(subtotal)}</span></div>
    ${discount ? `<div class="line"><span>Desconto</span><span>-${formatMoney(discount)}</span></div>` : ''}
    <div class="line total"><span>TOTAL</span><span>${formatMoney(total)}</span></div>
    <div class="line"><span>Recebido</span><span>${formatMoney(paid)}</span></div>
    ${paymentDiscounts > 0 ? `<div class="line"><span>Descontos no pagamento</span><span>${formatMoney(paymentDiscounts)}</span></div>` : ''}
    <div class="line balance"><span>Saldo</span><span>${formatMoney(balance)}</span></div>
    ${paymentLines ? `<div class="block"><strong>PAGAMENTOS</strong>${paymentLines}</div>` : ''}
    ${order?.observations ? `<div class="block notes"><strong>Observações:</strong> ${escapeHtml(order.observations)}</div>` : ''}
  `;
  return documentHtml(`${documentLabel(order)} ${number}`, content);
}

export function buildBalanceThermalHtml(order) {
  const total = Number(order?.finalValue || 0);
  const paid = Number(order?.amountPaid || 0);
  const paymentDiscounts = getOrderDiscountTotal(order);
  const balance = getOrderBalance(order);
  const openInstallments = (order?.installments || []).filter((installment) => !installment.paid);
  const installments = (order?.installments || []).flatMap((installment, index) => (
    installment.paid ? [] : [`
      <div class="line"><span>Parcela ${index + 1} · ${formatCivilDate(installment.dueDate)}</span><span>${formatMoney(installment.amount)}</span></div>`]
  )).join('');
  const content = `
    <h2>PENDÊNCIA · PEDIDO #${escapeHtml(order?.number || '—')}</h2>
    <div class="block">
      <div><strong>Cliente:</strong> ${escapeHtml(order?.client?.name || 'Cliente não cadastrado')}</div>
      ${order?.client?.phone ? `<div><strong>Telefone:</strong> ${escapeHtml(order.client.phone)}</div>` : ''}
      <div><strong>Data:</strong> ${formatDate(new Date())}</div>
    </div>
    <div class="line"><span>Total do pedido</span><span>${formatMoney(total)}</span></div>
    <div class="line"><span>Já recebido</span><span>${formatMoney(paid)}</span></div>
    ${paymentDiscounts > 0 ? `<div class="line"><span>Descontos aplicados</span><span>${formatMoney(paymentDiscounts)}</span></div>` : ''}
    <div class="line total balance"><span>Saldo em aberto</span><span>${formatMoney(balance)}</span></div>
    ${openInstallments.length ? `<div class="block"><strong>PARCELAS EM ABERTO</strong>${installments}</div>` : ''}
  `;
  return documentHtml(`Pendência pedido ${order?.number || ''}`, content);
}

export function buildPayableThermalHtml(payable) {
  const content = `
    <h2>CONTA A PAGAR</h2>
    <div class="block">
      <div><strong>Descrição:</strong> ${escapeHtml(payable?.description || '—')}</div>
      <div><strong>Categoria:</strong> ${escapeHtml(payable?.category || '—')}</div>
      <div><strong>Vencimento:</strong> ${formatCivilDate(payable?.dueDate)}</div>
      <div><strong>Status:</strong> ${payable?.paid ? 'Paga' : 'Em aberto'}</div>
      ${payable?.recurring ? '<div>Conta recorrente</div>' : ''}
    </div>
    <div class="line total"><span>VALOR</span><span>${formatMoney(payable?.value)}</span></div>
    ${payable?.notes ? `<div class="block notes"><strong>Observações:</strong> ${escapeHtml(payable.notes)}</div>` : ''}
  `;
  return documentHtml('Conta a pagar', content);
}

export function buildPaymentThermalHtml(text) {
  const lines = String(text || '')
    .replace(/^\*SMART PRINT\*\n/, '')
    .split('\n')
    .map((line) => line.replace(/\*/g, '').trim())
    .filter(Boolean);
  const title = escapeHtml(lines.shift() || 'RECIBO DE PAGAMENTO');
  const content = `<h2>${title}</h2>${lines.map((line) => `<div class="line"><span>${escapeHtml(line)}</span></div>`).join('')}`;
  return documentHtml(title, content);
}

export function openThermalPrintWindow() {
  return window.open('', '_blank', 'width=420,height=760');
}

export function writeThermalPrint(printWindow, html) {
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 350);
}

export function printThermalHtml(html) {
  const printWindow = openThermalPrintWindow();
  if (!printWindow) {
    alert('Seu navegador bloqueou a janela de impressão. Permita pop-ups e tente novamente.');
    return;
  }
  try {
    writeThermalPrint(printWindow, html);
  } catch (error) {
    printWindow.close();
    alert(error.message);
  }
}
