# SmartPrint Lindóia — PDV (MERN Stack)

PDV completo para gráfica (grandes formatos / adesivagem) com controle fluido e intuitivo.
Substitui o Dix Sistema com tudo em um só lugar, telas integradas e envio de pedido via WhatsApp.

## Stack
- **Backend:** Node.js + Express + MongoDB (Mongoose) + JWT
- **Frontend:** React 18 + Vite + Tailwind CSS + React Router + Lucide Icons
- **Deploy sugerido:** GitHub + Render (Web Service p/ API, Static Site p/ front) + MongoDB Atlas

## Funcionalidades
- Fluxo comercial: **orçamento pendente → pedido aprovado → pedido concluído**; imprimir ou preparar envio do orçamento não o aprova
- Controle de pagamento: **aberto / parcial / pago / quitado** (recebimento parcial)
- Produção: **iniciar / pausar / retomar / concluir** (com histórico e timestamps)
- **Permissões por perfil:** Admin tem acesso total; Atendente opera pedidos, recebimentos e caixa; Produção consulta dados operacionais e avança etapas sem acesso a valores e custos
- **Usuários:** somente Admin cadastra e ativa/desativa usuários Atendente e Produção; defina uma senha inicial forte e comunique-a diretamente ao usuário
- A lista de pedidos separa **Pendente aprovação**, **Pendente execução** e **Concluído** em abas; busca, filtros financeiros/de produção e paginação continuam disponíveis
- **Envio do pedido/orçamento via WhatsApp** (wa.me com mensagem formatada) — disponível no Dashboard, Pedidos, Clientes e Contas a Receber
- **Pedido rápido** já aprovado e sem cliente obrigatório, para serviços de balcão como fotocópias; seletor pesquisável integrado por nome ou código
- Totais finais fracionários são arredondados para cima ao próximo real; quantidades e medidas permanecem fracionárias
- **Recibos de pagamento** — cada recebimento registrado gera um recibo individual para impressão ou envio via WhatsApp na tela do pedido
- **Impressão térmica de 80 mm** para orçamentos/pedidos, recibos individuais, saldos a receber e contas a pagar em aberto; a impressão A4 continua disponível
- **Agrupar pedidos por cliente** (tela de Clientes, expansível)
- **Desdobramento de pagamento em parcelas** (vencimentos individuais, baixa automática ou por parcela)
- **Contas a pagar** (consumo/insumos/aluguel etc.) com **aviso visual no Dashboard** (vencidas em vermelho, vencendo em até 3 dias em amarelo)
- **Urgências do dia no Dashboard:** contas vencidas ou com vencimento hoje e pedidos aprovados não entregues com prazo vencido/hoje ou prioridade alta/urgente
- **Contas a receber** com saldo devedor e próximos vencimentos dos pedidos aprovados; orçamentos pendentes não entram nos saldos financeiros
- Dashboard com KPIs e feed de pedidos recentes
- Catálogo de produtos por unidade, metro linear ou metro quadrado, com cadastro restrito a administradores
- Custos opcionais por unidade de venda, margem estimada no catálogo e snapshot histórico do custo por item; dados de custo e margens detalhadas só são expostos a administradores
- Serviços de instalação e deslocamento podem ser cadastrados no catálogo como itens separados; deslocamento aceita quantidade fracionária em km
- Histórico de clientes com dez pedidos recentes, saldo em aberto, forma de pagamento mais recente, ação para repetir pedido e edição; exclusão disponível apenas para administrador e bloqueada quando há pedidos vinculados
- Contas a receber registram forma de pagamento e link opcional para comprovante; lembretes de saldo são preparados para WhatsApp e enviados manualmente
- Fechamento diário de caixa para administrador/atendente, com saldo inicial, entradas por forma de pagamento, sangrias, conferência e diferenças
- Imagem de referência do produto e links para fotos/arte no pedido; anexos aparecem no detalhe, PDF e mensagem de WhatsApp
- Catálogo categorizado por tipo de serviço, com filtros por categoria no catálogo e no orçamento
- Orçamento exige cliente cadastrado com nome e telefone acima do limite configurado ou para Fachada/Veículos; pedido rápido permanece sem cadastro obrigatório
- PDF e WhatsApp incluem validade do orçamento e dados comerciais configurados; links são preparados para revisão e envio manual
- Venda de itens do catálogo em pedidos com preço validado no backend e snapshot histórico de preço e medidas
- Exportação de pedidos (Admin/Atendente) e movimentações financeiras (Admin) em CSV compatível com Excel, com período filtrável
- Interface adaptada para celular e tablet, com menu lateral recolhível e rolagem horizontal controlada nas tabelas; operação offline/PWA fica reservada para fase posterior

### Impressão em 80 mm

Nas ações de impressão, escolha **80 mm** para abrir um documento formatado para bobina térmica no diálogo do navegador. A opção **Imprimir** continua gerando o PDF A4. O documento térmico é montado no navegador, e a impressora disponível é selecionada no próprio diálogo; o SmartPrint não faz pareamento BLE/USB. Os impressos incluem CNPJ 30.792.498/0001-33, endereço, CEP e telefone da Smart Print Lindóia.

## Usuários iniciais (criados no primeiro acesso ao banco)
| Perfil | E-mail | Senha |
|---|---|---|
| Administrador | admin@smartprint.com | admin123 |
| Atendente | atendente@smartprint.com | atend123 |
| Produção | producao@smartprint.com | prod123 |

> Troque as senhas após o primeiro acesso (edite direto no banco ou crie novo usuário).

---

## 1) Rodar localmente (VSCode)

Pré-requisitos: Node 18+ e MongoDB (local ou MongoDB Atlas).

### Backend
```bash
cd backend
cp .env.example .env   # edite MONGO_URI e JWT_SECRET
npm install
npm run dev            # http://localhost:5000
```
Se for usar MongoDB Atlas, cole a string de conexão em `MONGO_URI` (ex: `mongodb+srv://user:pass@cluster.../smartprint?retryWrites=true&w=majority`).

### Frontend
```bash
cd frontend
npm install
npm run dev            # http://localhost:5173
```
Em desenvolvimento o Vite faz proxy de `/api` → `http://localhost:5000` automaticamente.

---

## 2) Subir para o GitHub

```bash
git init
git add .
git commit -m "PDV SmartPrint Lindóia"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/smartprint-pdv.git
git push -u origin main
```

## 3) Deploy no Render + MongoDB Atlas

O repositório já inclui o arquivo `render.yaml` com a definição dos dois serviços. No Render, use **New → Blueprint**, selecione este repositório e confirme a criação. O Blueprint solicitará os valores secretos que não devem ser versionados.

### MongoDB Atlas
1. Crie um cluster gratuito em https://www.mongodb.com/atlas
2. Crie um usuário de banco e libere o IP **0.0.0.0/0** (Network Access) para o Render acessar
3. Copie a connection string (substitua user/password e coloque o nome do banco `smartprint`)

### Backend (Render → New → Web Service)
- Conecte o repositório do GitHub
- **Root Directory:** `backend`
- **Build Command:** `npm ci`
- **Start Command:** `npm start`
- **Environment Variables:**
  - `MONGO_URI` = string do Atlas
  - `JWT_SECRET` = uma chave aleatória forte
  - `CLIENT_URL` = URL do frontend (depois que criar o static site)
- Anote a URL da API (ex: `https://smartprint-api.onrender.com`)

### Frontend (Render → New → Static Site)
- Conecte o mesmo repositório
- **Root Directory:** `frontend`
- **Build Command:** `npm ci && npm run build`
- **Publish Directory:** `dist`
- **Environment Variable:** `VITE_API_URL` = URL da API do backend (ex: `https://smartprint-api.onrender.com`)
- **Redirects/Rewrites:** adicione Source `/*`, Destination `/index.html`, Action **Rewrite** (SPA fallback). A ação deve ser Rewrite para preservar a URL usada pelo React Router.

O `render.yaml` já declara essa regra para serviços gerenciados pelo Blueprint. Se o Static Site foi criado manualmente, editar o arquivo ou publicar um novo build não configura a regra no serviço existente: abra o Static Site **smartprintsite** no painel do Render, acesse **Redirects/Rewrites**, cadastre a regra acima e salve.

Depois, confira acesso direto e refresh em `/pedidos`, `/clientes`, `/produtos` e `/pedidos/ID_DO_PEDIDO`. O servidor deve responder com `index.html` e HTTP 200, mantendo o caminho no navegador. Sem sessão, o aplicativo exibirá o login; com sessão, a rota solicitada será renderizada.

Pronto: acesse a URL do static site, faça login com um dos usuários acima e comece a cadastrar clientes e orçamentos.

### Variáveis do frontend

Em produção, `VITE_API_URL` deve ser a URL pública do backend, sem barra no final, por exemplo `https://smartprint-api.onrender.com`. O frontend usa o proxy do Vite apenas durante o desenvolvimento local.

### Login por ambiente

`npm run build` gera o frontend de produção: os campos de login iniciam vazios, e o acesso rápido e suas credenciais de demonstração são excluídos do bundle. A condição usa `import.meta.env.PROD`, do Vite, definida durante o build; configurar apenas o `NODE_ENV` da API não altera um frontend já publicado.

`npm run dev` mantém os três atalhos de demonstração. Para homologação, use esse acesso apenas em ambiente restrito de desenvolvimento; builds estáticos, inclusive `--mode staging`, mantêm a proteção de produção. Não publique um build com `NODE_ENV=development`.

Essa alteração não troca as senhas já salvas no MongoDB. Os usuários padrão existentes devem ter suas senhas alteradas antes do uso em produção; a inicialização da API ainda cria os usuários padrão ausentes.

---

## Estrutura
```
smartprint-pdv/
├── backend/
│   ├── server.js            # entrada da API
│   ├── config/              # conexão MongoDB + seed de usuários
│   ├── models/              # User, Client, Product, Order, Payable, CashSession
│   ├── routes/              # auth, clients, products, orders, payables, dashboard, cash
│   └── middleware/          # auth JWT
└── frontend/
    └── src/
        ├── pages/           # Login, Dashboard, Orders, OrderForm, OrderDetail, Clients, Products, Payables, Receivables, CashRegister
        ├── components/      # Layout, Badges, Modal, WhatsAppButton
        └── context/         # AuthContext
```

### Catálogo e preços por medida

Administradores acessam **Produtos** no menu para cadastrar, editar, pesquisar e desativar produtos. Cada produto tem preço por unidade, metro linear, metro quadrado ou quilômetro; a desativação é lógica e mantém os registros existentes. As sugestões de instalação/envelopamento/deslocamento preenchem somente nome, categoria e unidade: cadastre os preços e custos reais.

No cadastro de um pedido, selecione um produto do catálogo e informe a quantidade ou as medidas correspondentes. O backend calcula o total usando o preço vigente no momento da inclusão e grava nome, unidade, preço, custo e medidas no item do pedido. Alterações futuras no catálogo não modificam o histórico; pedidos legados sem custo não são preenchidos retroativamente, e itens livres continuam disponíveis.

O Dashboard mostra a margem por categoria somente para administradores. Margens são sinalizadas como incompletas quando itens não têm snapshot de custo. O custo de catálogo é uma estimativa gravada ao montar o pedido, não uma apuração de consumo real da produção.

O menu **Fechamento de caixa** está disponível para administrador e atendente. Entradas são apuradas pelos pagamentos registrados no dia (incluindo histórico legado), no fuso de São Paulo. O fechamento guarda os valores conferidos e diferenças; consulte datas anteriores pelo seletor. Comprovantes e fotos são registrados por link HTTP(S); upload direto de arquivos não está configurado.

## Configurações comerciais do backend

As configurações abaixo são opcionais, exceto que os limites numéricos, quando informados, devem ser válidos. A API falha explicitamente na inicialização se `QUOTE_VALIDITY_DAYS` ou `ORDER_CLIENT_REQUIRED_THRESHOLD` estiver inválida.

| Variável | Padrão | Descrição |
|---|---:|---|
| `QUOTE_VALIDITY_DAYS` | `7` | Dias corridos de validade dos orçamentos pendentes |
| `ORDER_CLIENT_REQUIRED_THRESHOLD` | `100` | Total final em reais a partir do qual orçamentos comuns exigem cliente |
| `BUSINESS_ADDRESS` | vazio | Endereço mostrado no PDF e na mensagem quando configurado |
| `BUSINESS_PHONE` | vazio | Telefone comercial mostrado quando configurado |
| `BUSINESS_PIX_KEY` | vazio | Chave PIX mostrada somente para pagamento por PIX |
| `BUSINESS_INSTAGRAM` | `@smartprint.lindoia` | Identificação do Instagram comercial |

Pedido rápido/venda de balcão continua isento da exigência de cliente, mesmo quando ultrapassa o limite. Orçamentos comuns também exigem cliente para categorias Fachada e Veículos, sem depender do total. O WhatsApp abre uma mensagem pré-preenchida; o envio continua manual e a preparação do link não registra confirmação de entrega.

## Próximos passos sugeridos
- Trocar senha padrão dos usuários / criar tela de gestão de usuários
- Integração com WhatsApp Business API (ao invés de wa.me)
- Backup automático do MongoDB Atlas

## Atendimento e produção da gráfica

- **Pedido rápido (`/pedido-rapido`, F2):** pesquise por nome ou código no próprio campo de produto, selecione um produto por unidade, informe quantidade e pagamento e confirme. Cliente é opcional. A API calcula o preço, registra o recebimento integral e entrega o serviço; a confirmação permite imprimir o recibo. Esse fluxo não entra na fila de produção.
- **Falha de conexão no balcão:** use “Tentar a mesma venda novamente”. A tentativa fica salva na sessão do navegador por usuário, inclusive após refresh ou navegar para outra tela, para consultar o mesmo pedido sem novo recebimento. Não limpe o armazenamento nem feche a aba enquanto uma venda estiver pendente. Uma rejeição explícita de dados libera a correção do formulário.
- **Faixas no produto:** administradores cadastram mínimos inclusivos e preços em Produtos. Para “acima de 20 un”, informe mínimo **21**; para “acima de 300 un”, mínimo **301**. O maior mínimo atingido define o preço unitário. Não há conversão automática dos SKUs antigos nem preços comerciais inventados: cadastre a tabela real no produto escolhido. Pedidos salvos mantêm a tabela de preço histórica; legados sem tabela mantêm o preço unitário salvo.
- **Calculadora:** em um orçamento, use “Calcular por dimensão”: largura × altura em metros ou centímetros, peças, material m² do catálogo e instalação/deslocamento opcionais. Os acréscimos são cobrados uma vez por item. O resultado preenche o item com serviço, medidas e material; itens livres continuam disponíveis.
- **Especificações por item:** abra “Material, acabamento, arte e instalação” para preencher material, acabamento, local de aplicação, prazo, link HTTP(S) da arte e notas de instalação. Os campos preenchidos aparecem no detalhe, PDF e texto preparado para WhatsApp. Upload de arquivos não faz parte desta versão.
- **Produção (`/producao`):** Arte → Aprovação do cliente → Impressão → Instalação → Entregue. A tela atende também ao perfil Produção, permite avançar etapas, abrir detalhes e filtrar prazo/prioridade. Etapas desnecessárias podem ser dispensadas no orçamento ou durante a execução. Pausar/retomar continua disponível no detalhe. Entrega não quita pagamento automaticamente.
- O Kanban mostra pedidos aprovados e entregues nos últimos sete dias, priorizando urgência e prazo. Usa a data de entrega ou, na ausência dela, o primeiro prazo por item. Datas civis seguem o calendário de São Paulo. Pedidos legados mantêm compatibilidade: produção ativa/pausada corresponde a Impressão; concluídos a Entregue.
- Vendas rápidas concluídas possuem recibo individual e não podem ser editadas, agregadas ou excluídas, preservando a identificação usada em novas tentativas.

### Verificação local

Execute `npm test` em `backend` e `frontend`, e `npm run build` em `frontend`. Não é necessário acessar o banco de produção para essas suítes. Os testes de persistência usam modelos simulados; a validação com MongoDB real deve ser realizada em homologação antes de publicar.
