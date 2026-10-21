export const hideOrderCosts = (value) => {
  if (Array.isArray(value)) return value.map(hideOrderCosts);
  if (value && typeof value.toObject === 'function') return hideOrderCosts(value.toObject());
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'costUnitPrice')
      .map(([key, item]) => [key, hideOrderCosts(item)])
  );
};

const pickFields = (value, fields) => Object.fromEntries(
  fields.filter((field) => value[field] !== undefined).map((field) => [field, value[field]])
);

export const projectProductionOrder = (value) => {
  if (Array.isArray(value)) return value.map(projectProductionOrder);
  const order = value?.toObject ? value.toObject() : value;
  if (!order || typeof order !== 'object') return order;
  if (!Array.isArray(order.items) || !order.number) return order;

  const client = order.client && typeof order.client === 'object'
    ? pickFields(order.client.toObject ? order.client.toObject() : order.client, ['name', 'phone'])
    : null;
  const productionHistory = (order.history || [])
    .filter(({ action }) => ['producao.alocada', 'producao_iniciada', 'pausado', 'retomado', 'etapa_concluida', 'concluido'].includes(action))
    .slice(-5)
    .map((event) => pickFields(event.toObject ? event.toObject() : event, ['action', 'by', 'at', 'note', 'assignedName', 'fromStage', 'toStage']));

  return {
    ...pickFields(order, [
      '_id', 'number', 'status', 'production', 'productionStage', 'skippedStages', 'priority',
      'deliveryDate', 'observations', 'attachments', 'createdAt', 'updatedAt',
      'productionStartedAt', 'productionPausedAt', 'completedAt',
    ]),
    ...(client ? { client } : {}),
    items: order.items.map((item) => pickFields(item, [
      'description', 'quantity', 'productName', 'saleUnit', 'measurements',
      'serviceName', 'material', 'finishing', 'applicationLocation',
      'promisedDate', 'artworkUrl', 'installationNotes',
    ])),
    ...(order.populated?.('productionAssignee') || order.productionAssignee?.name
      ? { productionAssignee: pickFields(order.productionAssignee.toObject ? order.productionAssignee.toObject() : order.productionAssignee, ['_id', 'name', 'role']) }
      : {}),
    ...(productionHistory.length ? { productionHistory } : {}),
  };
};

export const applyOrderRoleVisibility = (value, role) => {
  if (role === 'admin') return value;
  if (role !== 'producao') return hideOrderCosts(value);
  if (Array.isArray(value)) return value.map(projectProductionOrder);
  if (!value || typeof value !== 'object') return value;
  if (value.toObject) return projectProductionOrder(value);
  if (Array.isArray(value.items) && !value.number) {
    return { ...value, items: value.items.map(projectProductionOrder) };
  }
  return projectProductionOrder(value);
};
