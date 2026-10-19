# SmartPrint Lindóia — PDV (MERN Stack)

PDV completo para gráfica (grandes formatos / adesivagem) com controle fluido e intuitivo.
Substitui o Dix Sistema com tudo em um só lugar, telas integradas e envio de pedido via WhatsApp.

## Stack
- **Backend:** Node.js + Express + MongoDB (Mongoose) + JWT
- **Frontend:** React 18 + Vite + Tailwind CSS + React Router + Lucide Icons
- **Deploy sugerido:** GitHub + Render (Web Service p/ API, Static Site p/ front) + MongoDB Atlas

## Funcionalidades
- Orçamento / Pedidos com status: **pendente → aprovado → concluído**
- Controle de pagamento: **aberto / parcial / pago / quitado** (recebimento parcial)
- Produção: **iniciar / pausar / retomar / concluir** (com histórico e timestamps)
- **3 usuários** (Admin, Atendente, Produção) — todos podem operar pedidos
- **Envio do pedido/orçamento via WhatsApp** (wa.me com mensagem formatada) — disponível no Dashboard, Pedidos, Clientes e Contas a Receber
- **Recibos de pagamento** — impressão individual pelo diálogo do navegador ou envio via WhatsApp na tela do pedido
- **Agrupar pedidos por cliente** (tela de Clientes, expansível)
- **Desdobramento de pagamento em parcelas** (vencimentos individuais, baixa automática ou por parcela)
- **Contas a pagar** (consumo/insumos/aluguel etc.) com **aviso visual no Dashboard** (vencidas em vermelho, vencendo em até 3 dias em amarelo)
- **Contas a receber** com saldo devedor e próximos vencimentos
- Dashboard com KPIs e feed de pedidos recentes
- Catálogo de produtos por unidade, metro linear ou metro quadrado, com cadastro restrito a administradores
- Venda de itens do catálogo em pedidos com preço validado no backend e snapshot histórico de preço e medidas

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
- **Rewrite/Redirect rule:** adicione `/*` → `/index.html` (SPA fallback)

Pronto: acesse a URL do static site, faça login com um dos usuários acima e comece a cadastrar clientes e orçamentos.

### Variáveis do frontend

Em produção, `VITE_API_URL` deve ser a URL pública do backend, sem barra no final, por exemplo `https://smartprint-api.onrender.com`. O frontend usa o proxy do Vite apenas durante o desenvolvimento local.

---

## Estrutura
```
smartprint-pdv/
├── backend/
│   ├── server.js            # entrada da API
│   ├── config/              # conexão MongoDB + seed de usuários
│   ├── models/              # User, Client, Product, Order, Payable
│   ├── routes/              # auth, clients, products, orders, payables, dashboard
│   └── middleware/          # auth JWT
└── frontend/
    └── src/
        ├── pages/           # Login, Dashboard, Orders, OrderForm, OrderDetail, Clients, Products, Payables, Receivables
        ├── components/      # Layout, Badges, Modal, WhatsAppButton
        └── context/         # AuthContext
```

### Catálogo e preços por medida

Administradores acessam **Produtos** no menu para cadastrar, editar, pesquisar e desativar produtos. Cada produto tem preço por unidade, metro linear ou metro quadrado; a desativação é lógica e mantém os registros existentes.

No cadastro de um pedido, selecione um produto do catálogo e informe a quantidade ou as medidas correspondentes. O backend calcula o total usando o preço vigente no momento da inclusão e grava nome, unidade, preço e medidas no item do pedido. Alterações futuras no catálogo não modificam o histórico; itens livres continuam disponíveis.

## Próximos passos sugeridos
- Trocar senha padrão dos usuários / criar tela de gestão de usuários
- Gerar PDF do orçamento (ex: pdfmake)
- Integração com WhatsApp Business API (ao invés de wa.me)
- Backup automático do MongoDB Atlas
