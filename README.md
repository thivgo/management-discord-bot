# Management Discord Bot 🤖💼

## 📌 Sobre o Projeto
O **Management Discord Bot** é uma aplicação focada em automatizar e facilitar a administração de vendas e negócios diretamente pelo Discord. O bot utiliza armazenamento local estruturado para oferecer um controle prático e rápido de todos os aspectos fundamentais da sua loja.

## 🚀 Funcionalidades
O sistema foi modularizado para lidar com diferentes frentes da gestão:
- **📦 Produtos e Estoque:** Controle de disponibilidade de itens, cadastro e monitoramento (`products.json`, `stock.json`).
- **🛒 Controle de Pedidos:** Registro, formatação de mensagens e acompanhamento do status das compras (`orders.json`, `orderMessage.json`).
- **👥 Gerenciamento de Clientes:** Cadastro, histórico e mensagens automatizadas para os usuários (`clients.json`, `clientesMessage.json`).
- **💰 Fluxo de Caixa:** Monitoramento financeiro, registrando o histórico de entradas e saídas (`caixa.json`).

## 🛠️ Tecnologias Utilizadas
- **[JavaScript (Node.js)](https://nodejs.org/)** - Lógica principal.
- **[Discord.js](https://discord.js.org/)** - Interação com a API do Discord.
- **JSON** - Banco de dados local leve para armazenamento estruturado.

## ⚙️ Como executar o projeto localmente

### Pré-requisitos
- Node.js e NPM instalados na sua máquina.
- Um token de bot gerado no [Discord Developer Portal](https://discord.com/developers/applications).

### Instalação
1. Clone este repositório:
   ```bash
   git clone [https://github.com/thivgo/management-discord-bot.git](https://github.com/thivgo/management-discord-bot.git)
