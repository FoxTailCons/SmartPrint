import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalogOrderItem, normalizeItemMetadata } from '../services/orderItemPricing.js';
import Order from '../models/Order.js';
import { effectiveStage, nextProductionStage, calendarDate, boardOrders } from '../services/productionWorkflow.js';

const product = { _id: '507f1f77bcf86cd799439011', name: 'Cópia', saleUnit: 'unit', price: 1, category: 'xerox_impressao', priceTiers: [{minQuantity:21,price:0.8},{minQuantity:301,price:0.5}] };
test('catalog order items take their category from the persisted product', async (t) => {
  t.mock.method(Product, 'findById', async () => ({ ...product, category: 'fachada', active: true }));
  const [item] = await buildOrderItems([{ productId: product._id, quantity: 1, category: 'papelaria' }]);
  assert.equal(item.category, 'fachada');
});
test('free order items treat an empty category as uncategorized', async () => {
  const [item] = await buildOrderItems([{ description: 'Cópia avulsa', quantity: 1, unitPrice: 1, category: '' }]);
  assert.equal(item.category, undefined);
});
test('tiers use inclusive thresholds and historical basis', () => {
  for (const [quantity, price] of [[20,1],[21,.8],[300,.8],[301,.5]]) assert.equal(buildCatalogOrderItem({product,quantity}).unitPrice,price);
  const saved = buildCatalogOrderItem({product,quantity:20});
  assert.equal(buildCatalogOrderItem({product:{...product,price:99,priceTiers:[]},quantity:301,pricingSnapshot:saved}).unitPrice,.5);
  assert.equal(buildCatalogOrderItem({product,quantity:301,pricingSnapshot:{productName:'Old',saleUnit:'unit',unitPrice:2}}).unitPrice,2);
});
test('metadata validates URLs, real calendar dates and nonnegative fees', () => {
  for(const data of [{artworkUrl:'javascript:alert(1)'},{promisedDate:'2026-02-30'},{installationFee:-1},{travelFee:Infinity}]) assert.throws(()=>normalizeItemMetadata(data));
  assert.equal(normalizeItemMetadata({promisedDate:'2026-10-20',artworkUrl:'https://example.org/art'}).promisedDate,'2026-10-20');
});
test('model totals include fees without multiplying fees by quantity', async()=>{
  const order = new Order({number:'T1',items:[{description:'Banner',quantity:2,unitPrice:10,installationFee:5,travelFee:2}]});
  await order.validate(); assert.equal(order.totalValue,27); assert.equal(order.finalValue,27);
});
test('legacy stages, configured skips, conflicts and calendar deadlines',()=>{
  assert.equal(effectiveStage({production:'pausado'}),'impressao');
  assert.equal(effectiveStage({status:'concluido'}),'entregue');
  assert.equal(nextProductionStage({productionStage:'arte',skippedStages:['aprovacao_cliente']},'arte').toStage,'impressao');
  assert.throws(()=>nextProductionStage({productionStage:'arte'},'impressao'),/alterada/);
  assert.equal(calendarDate('2026-10-20'),'2026-10-20');
  const rows = [{status:'aprovado',priority:'normal',deliveryDate:'2026-10-20'},{status:'aprovado',priority:'urgente',deliveryDate:'2026-10-19'}];
  assert.equal(boardOrders(rows,{deadline:'today'},new Date('2026-10-20T12:00:00Z')).length,1);
  assert.equal(boardOrders(rows,{},new Date('2026-10-20T12:00:00Z'))[0].priority,'urgente');
});
import { createQuickSaleHandler, createProductionAdvanceHandler, createWhatsappHandler, buildWhatsappText, itemDocumentDetails, buildOrderItems, buildQuoteValidityDate, normalizeWhatsappPhone } from '../routes/orders.js';
import Product from '../models/Product.js';
const response = () => ({statusCode:200,status(value){this.statusCode=value;return this;},json(value){this.body=value;return this;}});
const user = {_id:'507f1f77bcf86cd799439099',name:'Atendente'};
test('quick sale saves paid and delivered order once, ignores submitted prices, retry returns same receipt',async()=>{
  let saved, calls = 0;
  const OrderModel = {findOne:async()=>saved,create:async(value)=>{calls++; assert.equal(value.payments[0].amount,17);assert.equal(value.status,'concluido');assert.equal(value.productionStage,'entregue'); saved={...value,_id:'sale'};return saved;}};
  const handler = createQuickSaleHandler({OrderModel,ProductModel:{findById:async()=>({...product,active:true})}});
  const req = {user,body:{items:[{productId:product._id,quantity:21,unitPrice:0}],paymentMethod:'pix',requestId:'req-1'}};
  const res=response();await handler(req,res);assert.equal(res.statusCode,201);assert.equal(res.body.amountPaid,17);assert.equal(res.body.items[0].unitPrice,.8);assert.equal(res.body.items[0].category,'xerox_impressao');
  const retry=response();await handler(req,retry);assert.equal(retry.statusCode,200);assert.equal(retry.body._id,'sale');assert.equal(calls,1);
});
test('quick sale failure never performs a second partial payment write',async()=>{
  let writes=0;
  const handler=createQuickSaleHandler({OrderModel:{findOne:async()=>null,create:async()=>{writes++;throw new Error('save failed');}},ProductModel:{findById:async()=>({...product,active:true})}});
  const res=response();await handler({user,body:{items:[{productId:product._id,quantity:1}],paymentMethod:'dinheiro',requestId:'fail'}},res);
  assert.equal(writes,1);assert.equal(res.statusCode,500);assert.ok(!res.body.message.includes('save failed'));
});
test('quick sale racing duplicate key returns already persisted receipt',async()=>{
  let reads=0;
  const handler=createQuickSaleHandler({OrderModel:{findOne:async()=>++reads===1?null:{_id:'won'},create:async()=>{throw Object.assign(new Error('duplicate'),{code:11000});}},ProductModel:{findById:async()=>({...product,active:true})}});
  const res=response();await handler({user,body:{items:[{productId:product._id,quantity:1}],paymentMethod:'pix',requestId:'race'}},res);assert.equal(res.statusCode,200);assert.equal(res.body._id,'won');
});
test('production uses atomic current-stage predicate and records final delivery',async()=>{
  let changes,filter;
  const handler=createProductionAdvanceHandler({OrderModel:{findById:async()=>({_id:product._id,status:'aprovado',production:'em_producao',productionStage:'impressao',skippedStages:['instalacao']}),findOneAndUpdate:async(f,u)=>{filter=f;changes=u;return u.$set;}}});
  const res=response();await handler({params:{id:product._id},user,body:{expectedStage:'impressao'}},res);
  assert.equal(filter.productionStage,'impressao');assert.equal(changes.$set.status,'concluido');assert.equal(changes.$set.productionStage,'entregue');assert.equal(changes.$push.history.fromStage,'impressao');assert.ok(changes.$set.completedAt);
});
test('production racing update and paused requests cannot advance',async()=>{
  let writes=0;
  const model={findById:async()=>({_id:product._id,status:'aprovado',production:'em_producao',productionStage:'arte'}),findOneAndUpdate:async()=>{writes++;return null;}};
  const handler=createProductionAdvanceHandler({OrderModel:model});const res=response();await handler({params:{id:product._id},user,body:{expectedStage:'arte'}},res);assert.equal(res.statusCode,409);
  model.findById=async()=>({status:'aprovado',production:'pausado',productionStage:'arte'});const paused=response();await handler({params:{id:product._id},user,body:{expectedStage:'arte'}},paused);assert.equal(paused.statusCode,400);assert.equal(writes,1);
});
test('metadata and fees survive resolver edits and appear in document text',async(t)=>{
  t.mock.method(Product,'findById',async()=>({...product,active:true}));
  const [item]=await buildOrderItems([{productId:product._id,quantity:2,serviceName:'Plotagem',material:'Vinil',finishing:'Laminado',artworkUrl:'https://example.org/arte',installationFee:10,travelFee:5}]);
  assert.equal(item.total,17);assert.match(item.description,/Plotagem.*Vinil/);
  assert.ok(itemDocumentDetails(item).some(line=>line.includes('Laminado')));
  const text=buildWhatsappText({number:'M-1',items:[item],totalValue:item.total,finalValue:item.total},null);assert.match(text,/Laminado/);assert.match(text,/https:\/\/example.org\/arte/);
});
test('quote WhatsApp text includes validity and configured business data only when applicable', () => {
  const order = {
    number: 'Q-1', status: 'pendente', amountPaid: 0, createdAt: '2026-10-20T15:00:00Z',
    items: [{ description: 'Banner 2x1', quantity: 1, unitPrice: 120, total: 120 }],
    totalValue: 120, finalValue: 120, paymentMethod: 'pix',
  };
  const text = buildWhatsappText(order, null, {
    quoteValidityDays: 7, clientRequiredThreshold: 100, businessAddress: 'Rua Teste',
    businessPhone: '', businessPixKey: 'pix@example.org', businessInstagram: '@smartprint.lindoia',
  });
  assert.match(text, /Válido até: 27\/10\/2026/);
  assert.match(text, /Rua Teste/);
  assert.match(text, /PIX: pix@example.org/);
  assert.match(text, /@smartprint\.lindoia/);
  assert.equal(buildQuoteValidityDate({ ...order, status: 'aprovado' }, 7), null);
  assert.equal(normalizeWhatsappPhone('(51) 99999-9999'), '5551999999999');
  assert.equal(normalizeWhatsappPhone('+55 51 99999-9999'), '5551999999999');
  assert.equal(normalizeWhatsappPhone('123'), null);
});

test('WhatsApp text rejects orders without persisted items and totals', () => {
  assert.throws(() => buildWhatsappText({ number: 'Q-2', items: [], finalValue: 0 }), /itens/);
  assert.throws(() => buildWhatsappText({ number: 'Q-3', items: [{ description: 'Item', quantity: 1, unitPrice: 1, total: 1 }], finalValue: Infinity }), /total/);
  assert.throws(() => buildWhatsappText({ number: 'Q-4', items: [{ description: 'Item', quantity: 1, unitPrice: NaN, total: 1 }], finalValue: 1 }), /valores inválidos/);
});
test('WhatsApp handler asks for a temporary destination and never marks the order sent', async () => {
  const order = {
    number: 'W-1', client: null, status: 'pendente', items: [{ description: 'Cópia', quantity: 1, unitPrice: 1, total: 1 }],
    totalValue: 1, finalValue: 1, whatsappSentAt: null,
  };
  const handler = createWhatsappHandler({ OrderModel: { findById: () => ({ populate: async () => order }) } });
  const request = (phone) => ({ params: { id: product._id }, query: phone ? { phone } : {} });
  const initial = response();
  await handler(request(), initial);
  assert.equal(initial.body.requiresPhone, true);
  const prepared = response();
  await handler(request('(51) 99999-9999'), prepared);
  assert.equal(prepared.body.phone, '5551999999999');
  assert.match(prepared.body.link, /^https:\/\/wa\.me\/5551999999999\?/);
  assert.equal(order.whatsappSentAt, null);
});
import { normalizePriceTiers } from '../services/orderItemPricing.js';
test('tier tables reject duplicates, zero thresholds and nonfinite or negative prices',()=>{
  for(const tiers of [[{minQuantity:0,price:1}],[{minQuantity:1,price:-1}],[{minQuantity:1,price:Infinity}],[{minQuantity:1,price:1},{minQuantity:1,price:2}],{}]) assert.throws(()=>normalizePriceTiers(tiers));
  assert.ok(Order.schema.indexes().some(([fields,options])=>fields.quickSaleKey===1&&options.unique&&options.sparse));
});
test('saved item metadata is retained when quantity-only edits omit optional fields',async(t)=>{
  t.mock.method(Product,'findById',async()=>({...product,active:true}));
  const previous={_id:'507f191e810c19729de860ea',productId:product._id,productName:product.name,saleUnit:'unit',unitPrice:1,material:'Papel',installationFee:4};
  const [updated]=await buildOrderItems([{_id:previous._id,productId:product._id,quantity:2}],{id:()=>previous});
  assert.equal(updated.material,'Papel');assert.equal(updated.total,6);
});
test('board honors promised-date fallback and date-only PDF/WhatsApp deadlines',()=>{
  const row={status:'aprovado',items:[{promisedDate:'2026-10-20'}]};
  assert.equal(boardOrders([row],{deadline:'today'},new Date('2026-10-21T01:00:00Z')).length,1);
  const text=buildWhatsappText({number:'D-1',status:'aprovado',deliveryDate:new Date('2026-10-20T00:00:00Z'),items:[{description:'Cópia',quantity:1,unitPrice:1,total:1}],totalValue:1,finalValue:1},null);
  assert.match(text,/20\/10\/2026/);
});
import { mergeProductionWorkflow } from '../services/productionWorkflow.js';
import { createProductionStateHandler } from '../routes/orders.js';
test('merge retains earliest applicable stage, common skips and latest delivery',()=>{
  const merged=mergeProductionWorkflow([{status:'aprovado',productionStage:'aprovacao_cliente',skippedStages:['instalacao']},{status:'aprovado',productionStage:'impressao',skippedStages:['instalacao','arte']}]);
  assert.equal(merged.productionStage,'aprovacao_cliente');assert.deepEqual(merged.skippedStages,['instalacao']);
  const completed=mergeProductionWorkflow([{status:'concluido',completedAt:new Date('2026-10-19')},{status:'concluido',completedAt:new Date('2026-10-20')}]);
  assert.equal(completed.productionStage,'entregue');assert.equal(completed.completedAt.toISOString().slice(0,10),'2026-10-20');
  assert.throws(()=>mergeProductionWorkflow([{quickSaleKey:'sale'}]),/balc/);
});
test('legacy production controls use guarded atomic updates and reject interleaving changes',async()=>{
  for(const [action,production] of [['start','nao_iniciado'],['pause','em_producao'],['resume','pausado']]) {
    let filter,update;
    const handler=createProductionStateHandler(action,{OrderModel:{findById:async()=>({_id:product._id,status:'aprovado',production,productionStage:'arte'}),findOneAndUpdate:async(f,u)=>{filter=f;update=u;return null;}}});
    const res=response();await handler({params:{id:product._id},user,body:{note:'Esperando material'}},res);
    assert.equal(filter.status,'aprovado');assert.equal(filter.production,production);assert.equal(filter.productionStage,'arte');assert.equal(res.statusCode,409);assert.ok(update.$push.history);
  }
});
import { createOrderDeleteHandler } from '../routes/orders.js';
test('quick-sale receipt cannot be deleted and lose its retry key',async()=>{
  let deletes=0;
  const handler=createOrderDeleteHandler({OrderModel:{findById:async()=>({quickSaleKey:'sale'}),findByIdAndDelete:async()=>{deletes++;}}});
  const res=response();await handler({params:{id:product._id}},res);assert.equal(res.statusCode,400);assert.equal(deletes,0);
});
import { initialProductionStage } from '../services/productionWorkflow.js';
import { createProductionBoardHandler } from '../routes/orders.js';
test('new quotes start at first configured applicable stage',()=>{
  assert.equal(initialProductionStage(), 'arte');
  assert.equal(initialProductionStage(['arte','aprovacao_cliente']), 'impressao');
  assert.throws(()=>initialProductionStage('arte'));
});
test('delivered orders never count as overdue and board query bounds concluded history',async()=>{
  const now=new Date('2026-10-20T12:00:00Z');
  const delivered={status:'concluido',productionStage:'entregue',completedAt:now,deliveryDate:'2026-10-19'};
  assert.equal(boardOrders([delivered],{deadline:'overdue'},now).length,0);
  assert.equal(boardOrders([delivered],{deadline:'all'},now).length,1);
  let filter;
  const handler=createProductionBoardHandler({now:()=>now,OrderModel:{find:(value)=>{filter=value;return{populate(){return this;},lean:async()=>[]};}}});
  await handler({query:{}},response());assert.equal(filter.$or[0].status,'aprovado');assert.equal(filter.$or[1].status,'concluido');assert.equal(filter.$or[1].completedAt.$gte.toISOString(),'2026-10-13T12:00:00.000Z');
});
test('uncertain committed quick sale returns 500 and retry resolves original receipt',async()=>{
  let saved,calls=0;
  const handler=createQuickSaleHandler({OrderModel:{findOne:async()=>saved,create:async(value)=>{calls++;saved={...value,_id:'committed'};throw new Error('private connection error');}},ProductModel:{findById:async()=>({...product,active:true})}});
  const req={user,body:{items:[{productId:product._id,quantity:1}],paymentMethod:'pix',requestId:'uncertain'}};
  const first=response();await handler(req,first);assert.equal(first.statusCode,500);assert.ok(!first.body.message.includes('private'));
  const retry=response();await handler(req,retry);assert.equal(retry.statusCode,200);assert.equal(retry.body._id,'committed');assert.equal(calls,1);
});
test('all operational stages cannot be dispensed on creation or edits',async()=>{
  const skippedStages=['arte','aprovacao_cliente','impressao','instalacao'];
  assert.throws(()=>initialProductionStage(skippedStages),/etapa/);
  const order=new Order({number:'ALLSKIP',items:[{description:'Banner',quantity:1,unitPrice:10}],skippedStages});
  await assert.rejects(order.validate(),/etapa/);
});
