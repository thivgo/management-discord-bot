const {
  Client, GatewayIntentBits, Partials, Routes, SlashCommandBuilder, REST, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, Events
} = require('discord.js');
const { TOKEN, CLIENT_ID, GUILD_ID, ADMIN_ROLE, USER_ROLE, FINALIZED_CHANNEL_ID, CHANNEL_CAIXA, CHANNEL_SAIDAS, CHANNEL_CLIENTES, CHANNEL_PRODUTOS, START_CHANNEL_ID, CHANNEL_ESTOQUE } = require('./config');
const fs = require('fs');
// const products = require('./products.json'); // Removido, productsData é carregado em loadProducts

let orders = new Map();
let caixa = 0;
let orderMessageId = null;
let stockMessage = null;

let productsData = {}; // Variável para armazenar os produtos

function loadProducts() {
  try {
    if (fs.existsSync('./products.json')) {
      const data = fs.readFileSync('./products.json', 'utf8');
      productsData = data ? JSON.parse(data) : {};
    } else {
      productsData = {};
      saveProducts({}); // Cria o arquivo se não existir
    }
  } catch (err) {
    console.error('Erro ao carregar produtos:', err);
    productsData = {};
  }
}

function saveProducts(data) {
  try {
    fs.writeFileSync('./products.json', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Erro ao salvar produtos:', err);
  }
}

// Carregar encomendas do arquivo
function loadOrders() {
  try {
    if (fs.existsSync('./orders.json')) { // Verifica se o arquivo existe
      const data = fs.readFileSync('./orders.json', 'utf8');
      orders = new Map(Object.entries(data ? JSON.parse(data) : {}));
    } else {
      orders = new Map();
      saveOrders(); // Cria o arquivo se não existir
    }
  } catch (err) {
    console.error('Erro ao carregar encomendas:', err);
    orders = new Map();
    saveOrders();
  }
}


// Salvar encomendas no arquivo
function saveOrders() {
  try {
    const data = JSON.stringify(Object.fromEntries(orders), null, 2);
    fs.writeFileSync('./orders.json', data);
  } catch (err) {
    console.error('Erro ao salvar encomendas:', err);
  }
}

// Clientes
let clients = new Map()
let clientesMessageId = null; // Adicionar variável para guardar o ID da mensagem de clientes

function loadClients() {
  try {
     if (fs.existsSync('./clients.json')) { // Verifica se o arquivo existe
      const data = fs.readFileSync('./clients.json', 'utf8');
      const rawClients = data ? JSON.parse(data) : {};
      // Ajustar nome -> cliente caso necessário
      for (const [postal, client] of Object.entries(rawClients)) {
        if (client.nome && !client.cliente) {
          client.cliente = client.nome;
          delete client.nome;
        }
      }
      clients = new Map(Object.entries(rawClients));
    } else {
      clients = new Map();
      saveClients(); // Cria o arquivo se não existir
    }
  } catch (err) {
    console.error('Erro ao carregar clientes:', err);
    clients = new Map();
    saveClients();
  }
}

function saveClients() {
  try {
    const data = JSON.stringify(Object.fromEntries(clients), null, 2);
    fs.writeFileSync('./clients.json', data);
  } catch (err) {
    console.error('Erro ao salvar clientes:', err);
  }
}

function loadClientesMessageId() { // Nova função para carregar o ID da mensagem
  try {
    if (fs.existsSync('./clientesMessage.json')) {
      const data = fs.readFileSync('./clientesMessage.json', 'utf8');
      clientesMessageId = data ? JSON.parse(data).messageId : null;
    } else {
      clientesMessageId = null;
      saveClientesMessageId(null); // Cria o arquivo vazio se não existir
    }
  } catch (err) {
    console.error('Erro ao carregar ID da mensagem de clientes:', err);
    clientesMessageId = null;
  }
}

function saveClientesMessageId(messageId) { // Nova função para salvar o ID da mensagem
  try {
    fs.writeFileSync('./clientesMessage.json', JSON.stringify({ messageId }));
  } catch (err) {
    console.error('Erro ao salvar ID da mensagem de clientes:', err);
  }
}

// Função para verificar se o usuário tem permissão
function hasPermission(member) {
  return member.roles.cache.has(ADMIN_ROLE) || member.roles.cache.has(USER_ROLE);
}

function loadCaixa() {
  try {
     if (fs.existsSync('./caixa.json')) { // Verifica se o arquivo existe
      const data = fs.readFileSync('./caixa.json', 'utf8');
      caixa = parseFloat(data) || 0;
    } else {
      caixa = 0;
      saveCaixa(); // Cria o arquivo se não existir
    }
  } catch (err) {
    console.error('Erro ao carregar caixa:', err);
    caixa = 0;
    saveCaixa();
  }
}

function saveCaixa() {
  try {
    fs.writeFileSync('./caixa.json', caixa.toFixed(2).toString().replace('.',',')); // Salva com 2 casas decimais e vírgula
  } catch (err) {
    console.error('Erro ao salvar caixa:', err);
  }
}

async function atualizarCaixaChannel(client) {
  try {
    const channel = await client.channels.fetch(CHANNEL_CAIXA);
    if (!channel) {
      console.error('Canal de caixa não encontrado');
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('💰 Caixa')
      .setDescription(`Saldo atual:\n# $${caixa.toFixed(2).replace('.', ',')}`)
      .setColor('Yellow')
      .setTimestamp();

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('btn_entrada_caixa')
          .setLabel('📥 Registrar Entrada')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('btn_saida_caixa')
          .setLabel('📤 Registrar Saída')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('btn_atualizar_caixa')
          .setLabel('🔄 Atualizar')
          .setStyle(ButtonStyle.Secondary),
      );


    const messages = await channel.messages.fetch({ limit: 10 }); // Buscar mais mensagens para encontrar a do bot
    const botMessage = messages.find(msg => msg.author.id === client.user.id);

    if (botMessage) {
      await botMessage.edit({ embeds: [embed], components: [row] });
    } else {
      await channel.send({ embeds: [embed], components: [row] });
    }
  } catch (error) {
    console.error('Erro ao atualizar canal de caixa:', error);
  }
}

async function atualizarClientesChannel(client, page = 1, interaction = null) {
  try {
    const channel = await client.channels.fetch(CHANNEL_CLIENTES);
    if (!channel) {
      console.error('Canal de clientes não encontrado');
      if (interaction && !interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '❌ Canal de clientes não encontrado.', flags: 64 });
      }
      return;
    }

    const clientEntries = Array.from(clients.entries());
    const totalClientes = clientEntries.length;
    const clientsPerPage = 23;
    const totalPossiblePages = Math.ceil(totalClientes / clientsPerPage);

    page = Math.max(1, Math.min(page, totalPossiblePages > 0 ? totalPossiblePages : 1));

    const embedLimit = 4000;
    const safetyMargin = 100;
    let currentDescription = '';
    const clientsForPage = [];
    let actualClientsOnPage = 0;

    const startIndex = (page - 1) * clientsPerPage;
    for (let i = startIndex; i < clientEntries.length; i++) {
        const [postal, c] = clientEntries[i];
        const clientBlock = `👤 **Cliente:** ${c.cliente}\n📨 **Postal:** ${postal}\n🏢 **Empresa:** ${c.empresa}\n🌆 **Cidade:** ${c.cidade}`;
        const blockToAdd = currentDescription.length > 0 ? '\n\n' + clientBlock : clientBlock;

        if (currentDescription.length + blockToAdd.length > embedLimit - safetyMargin) {
            break;
        }

        currentDescription += blockToAdd;
        clientsForPage.push(clientEntries[i]);
        actualClientsOnPage++;

        if (actualClientsOnPage === clientsPerPage) {
            break;
        }
    }

    const totalPages = totalPossiblePages;

    const embed = new EmbedBuilder()
      .setTitle(`📋 Lista de Contatos ${totalPages > 1 ? `(Página ${page}/${totalPages})` : ''}`)
      .setColor('Blue')
      .setDescription(currentDescription || 'Nenhum contato cadastrado ainda.');

    if (page === totalPages || totalPages <= 1) {
       embed.addFields({ name: '📊 Total de Contatos Cadastrados:', value: `${totalClientes}`, inline: true });
    }

    const buttonRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('btn_add_cliente')
          .setLabel('➕ Adicionar Cliente')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('btn_edit_cliente')
          .setLabel('✏️ Editar Cliente')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('btn_remove_cliente')
          .setLabel('❌ Remover Cliente')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('btn_atualizar_clientes')
          .setLabel('🔄 Atualizar')
          .setStyle(ButtonStyle.Secondary),
      );

    const paginationRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`page_clientes|${page - 1}|${totalPages}`)
                .setLabel('⬅️ Anterior')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page === 1),
            new ButtonBuilder()
                .setCustomId(`page_clientes|${page + 1}|${totalPages}`)
                .setLabel('Próxima ➡️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page === totalPages || totalPages <= 1)
        );

    let botMessage = null;
    if (clientesMessageId) {
        try {
            botMessage = await channel.messages.fetch(clientesMessageId);
        } catch (error) {
            console.error('Erro ao buscar mensagem de clientes pelo ID salvo:', error);
            clientesMessageId = null;
        }
    }

    if (!botMessage) {
        try {
            const messages = await channel.messages.fetch({ limit: 10 });
            botMessage = messages.find(msg => msg.author.id === client.user.id);
        } catch (error) {
            console.error('Erro ao buscar mensagens do canal:', error);
        }
    }

    try {
        if (botMessage) {
            await botMessage.edit({ 
                embeds: [embed], 
                components: [buttonRow, paginationRow]
            });
            
            if (botMessage.id !== clientesMessageId) {
                saveClientesMessageId(botMessage.id);
                clientesMessageId = botMessage.id;
            }
        } else {
            const newMessage = await channel.send({ 
                embeds: [embed], 
                components: [buttonRow, paginationRow]
            });
            saveClientesMessageId(newMessage.id);
            clientesMessageId = newMessage.id;
        }

        if (interaction) {
            if (interaction.isChatInputCommand() && interaction.commandName === 'clientes' && interaction.replied) {
                try {
                    const originalReply = await interaction.fetchReply();
                    if (originalReply) {
                        await originalReply.delete().catch(console.error);
                    }
                } catch (error) {
                    console.error('Erro ao deletar resposta inicial do comando /clientes:', error);
                }
            } else if (interaction.isButton() && !interaction.replied && !interaction.deferred) {
                await interaction.deferUpdate().catch(console.error);
            }
        }
    } catch (error) {
        console.error('Erro ao atualizar mensagem de clientes:', error);
        if (interaction && !interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ Ocorreu um erro ao atualizar a lista de clientes.', flags: 64 }).catch(console.error);
        }
    }
  } catch (error) {
    console.error('Erro ao atualizar canal de clientes:', error);
    if (interaction && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '❌ Ocorreu um erro ao atualizar o canal de clientes.', flags: 64 }).catch(console.error);
    }
  }
}

async function atualizarProdutosChannel(client, page = 1) {
  try {
    const channel = await client.channels.fetch(CHANNEL_PRODUTOS);
    if (!channel) {
      console.error('Canal de produtos não encontrado');
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('📦 Lista de Produtos')
      .setColor('Blue');

    // Verifica se existem categorias
    if (Object.keys(productsData).length === 0) {
      embed.setDescription('Nenhuma categoria e produto cadastrado ainda.\nUse os botões abaixo para adicionar categorias e produtos.');
    } else {
      // Preparar dados para paginação
      const allCategories = Object.entries(productsData);
      const maxFieldsPerPage = 23; // Limite de segurança
      
      // Calcular total de páginas
      let totalPages = 1;
      let currentFieldsCount = 0;
      
      for (const [categoria, produtos] of allCategories) {
        const produtosCount = Object.keys(produtos).length;
        if (currentFieldsCount + produtosCount > maxFieldsPerPage) {
          totalPages++;
          currentFieldsCount = produtosCount;
        } else {
          currentFieldsCount += produtosCount;
        }
      }
      
      // Determinar quais categorias mostrar na página atual
      let categoriesInPage = [];
      let fieldsCount = 0;
      let currentPage = 1;
      
      for (const [categoria, produtos] of allCategories) {
        const produtosCount = Object.keys(produtos).length;
        
        // Se adicionar esta categoria ultrapassaria o limite, vai para próxima página
        if (fieldsCount + produtosCount > maxFieldsPerPage) {
          currentPage++;
          fieldsCount = produtosCount;
        } else {
          fieldsCount += produtosCount;
        }
        
        // Se estamos na página desejada, adicionar à lista
        if (currentPage === page) {
          categoriesInPage.push([categoria, produtos]);
        }
      }
      
      // Construir descrição da página atual
      const pageDescription = categoriesInPage
        .map(([categoria, produtos]) => {
          const produtosList = Object.entries(produtos)
            .map(([nome, preco]) => `• ${nome}: $${parseFloat(preco).toFixed(2).replace('.', ',')}`)
            .join('\n');
          return `**${categoria}**\n${produtosList}`;
        })
        .join('\n\n');
      
      embed.setDescription(pageDescription || 'Nenhum produto nesta página.');
      
      // Adicionar informações de paginação no footer
      if (totalPages > 1) {
        embed.setFooter({ text: `Página ${page} de ${totalPages}` });
      }
    }

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('btn_add_produto')
          .setLabel('➕ Adicionar Produto')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('btn_edit_produto')
          .setLabel('✏️ Modificar Produto')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('btn_add_categoria')
          .setLabel('➕ Adicionar Categoria')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('btn_atualizar_produtos')
          .setLabel('🔄 Atualizar')
          .setStyle(ButtonStyle.Secondary),
      );

    // Nova ActionRow para os botões de remoção
    const removeRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('btn_remove_produto')
          .setLabel('🗑️ Remover Produto')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('btn_remove_categoria')
          .setLabel('🗑️ Remover Categoria')
          .setStyle(ButtonStyle.Danger)
      );

    // Calcular total de páginas para os botões de navegação (reutilizar cálculo anterior)
    let totalPages = 1;
    if (Object.keys(productsData).length > 0) {
      const allCategories = Object.entries(productsData);
      const maxFieldsPerPage = 23;
      let tempFieldsCount = 0;
      
      for (const [categoria, produtos] of allCategories) {
        const produtosCount = Object.keys(produtos).length;
        if (tempFieldsCount + produtosCount > maxFieldsPerPage) {
          totalPages++;
          tempFieldsCount = produtosCount;
        } else {
          tempFieldsCount += produtosCount;
        }
      }
    }

    // ActionRow para botões de paginação (só aparece se houver mais de 1 página)
    let paginationRow = null;
    if (totalPages > 1) {
      paginationRow = new ActionRowBuilder();
      
      // Botão página anterior
      if (page > 1) {
        paginationRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`btn_produtos_page_${page - 1}`)
            .setLabel('⬅️ Página Anterior')
            .setStyle(ButtonStyle.Secondary)
        );
      }
      
      // Botão próxima página
      if (page < totalPages) {
        paginationRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`btn_produtos_page_${page + 1}`)
            .setLabel('Próxima Página ➡️')
            .setStyle(ButtonStyle.Secondary)
        );
      }
    }

    const messages = await channel.messages.fetch({ limit: 10 }); // Buscar mais mensagens para encontrar a do bot
    const botMessage = messages.find(msg => msg.author.id === client.user.id);

    const components = [row, removeRow];
    if (paginationRow) {
      components.push(paginationRow);
    }

    if (botMessage) {
      await botMessage.edit({ embeds: [embed], components: components });
    } else {
      await channel.send({ embeds: [embed], components: components });
    }
  } catch (error) {
    console.error('Erro ao atualizar canal de produtos:', error);
  }
}


function loadOrderMessageId() {
  try {
    if (fs.existsSync('./orderMessage.json')) {
      const data = fs.readFileSync('./orderMessage.json', 'utf8');
      orderMessageId = data ? JSON.parse(data).messageId : null;
    } else {
      orderMessageId = null; // Arquivo não existe, inicializa como null
      saveOrderMessageId(null); // Cria o arquivo vazio
    }
  } catch (err) {
    console.error('Erro ao carregar ID da mensagem de encomenda:', err);
    orderMessageId = null;
  }
}

function saveOrderMessageId(messageId) {
  try {
    fs.writeFileSync('./orderMessage.json', JSON.stringify({ messageId }));
  } catch (err) {
    console.error('Erro ao salvar ID da mensagem de encomenda:', err);
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences
  ],
  partials: [Partials.Channel, Partials.Message]
});

client.once(Events.ClientReady, async () => {
  console.log(`✅ Bot online como ${client.user.tag}`);
  loadOrders();
  loadClients();
  loadCaixa();
  loadProducts(); // Carregar produtos ao iniciar
  loadOrderMessageId(); // Carregar o ID da mensagem de encomenda ao iniciar
  loadClientesMessageId(); // Carregar o ID da mensagem de clientes
  await atualizarCaixaChannel(client);
  await atualizarClientesChannel(client); // Atualizar canal de clientes ao iniciar
  await atualizarProdutosChannel(client); // Atualizar canal de produtos ao iniciar
  await atualizarEncomendasChannel(client); // Agora usa o ID salvo
  await atualizarEstoqueChannel(client);

  const commands = [
    new SlashCommandBuilder()
      .setName('encomenda')
      .setDescription('📦 Cria uma nova encomenda e permite adicionar produtos'),
    new SlashCommandBuilder()
      .setName('ping')
      .setDescription('🏓 Verifica a Latência do bot'),
    new SlashCommandBuilder()
      .setName('clear')
      .setDescription('🧹 Apaga uma quantidade de mensagens do canal.')
      .addIntegerOption(option =>
        option.setName('quantidade')
          .setDescription('Quantidade de mensagens a apagar (máximo 100)')
          .setRequired(true)),
    new SlashCommandBuilder()
      .setName('entrada')
      .setDescription('📥 Registrar uma entrada do caixa'),
    new SlashCommandBuilder()
      .setName('saida')
      .setDescription('📤Registrar uma saída do caixa'),
    new SlashCommandBuilder()
      .setName('addcliente')
      .setDescription('➕ Adiciona um novo cliente ao banco de dados'),
    new SlashCommandBuilder()
      .setName('removecliente')
      .setDescription('❌ Remove um cliente da lista pelo número'),
    new SlashCommandBuilder()
      .setName('editar_cliente')
      .setDescription('✏️ Edita os dados de um cliente existente'),
    new SlashCommandBuilder()
      .setName('addproduto')
      .setDescription('➕ Adiciona um novo produto'),
    new SlashCommandBuilder()
      .setName('modificarproduto')
      .setDescription('✏️ Modifica um produto existente'),
    new SlashCommandBuilder()
      .setName('add_categoria')
      .setDescription('➕ Adiciona uma nova categoria de produtos'),
    new SlashCommandBuilder()
      .setName('clientes')
      .setDescription('📋 Lista os clientes cadastrados'),
    new SlashCommandBuilder()
      .setName('listarprodutos')
      .setDescription('📋 Lista todos os produtos disponíveis')
  ];
  const rest = new REST({ version: '10' }).setToken(TOKEN);

  try {
    console.log('🔄 Registrando comandos...');
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
      body: commands,
    });
    console.log('✅ Comandos registrados com sucesso');
  } catch (err) {
    console.error('Erro ao registrar comandos:', err);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  // Verifica permissão antes de qualquer interação
  if (!hasPermission(interaction.member)) {
    if (interaction.isRepliable()) {
      return interaction.reply({
        content: '❌ Você não tem permissão para usar este bot. Apenas funcionários podem usar.',
        flags: 64
      });
    }
    return;
  }

  // Handler para comandos slash
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'ping') {
      const startTime = Date.now();
      const reply = await interaction.reply({
        content: 'Pong!',
        withResponse: true
      });
      const endTime = Date.now();
      const ping = endTime - startTime;
      return interaction.editReply(`🏓Pong! Latência: ${ping}ms`);
    }

    if (interaction.commandName === 'clear') {
      const quantidade = interaction.options.getInteger('quantidade');

      if (!interaction.member.roles.cache.has(ADMIN_ROLE)) {
        return interaction.reply({
          content: '❌ Você não tem permissão para usar este comando.', flags: 64});
      }

      if (!interaction.member.permissions.has('ManageMessages')) {
        return interaction.reply({ content: '❌ Você não tem permissão para apagar mensagens.', flags: 64 });
      }

      if (quantidade < 1 || quantidade > 501) {
        return interaction.reply({ content: '❌ Insira um número entre 1 e 500.', flags: 64 });
      }

      try {
        const deleted = await interaction.channel.bulkDelete(quantidade, true);
        return interaction.reply({ content: `🧹 ${deleted.size} mensagens foram apagadas com sucesso.`, flags: 64 });
      } catch (err) {
        console.error('Erro ao apagar mensagens:', err);
        return interaction.reply({ content: '❌ Não foi possível apagar as mensagens. Talvez sejam antigas demais.', flags: 64 });
      }
    }

    if (interaction.commandName === 'addcliente') {
      const modal = new ModalBuilder()
        .setCustomId('modal_adicionar_cliente')
        .setTitle('Adicionar Novo Cliente');

      const nomeInput = new TextInputBuilder()
        .setCustomId('nome')
        .setLabel('Nome do Cliente')
        .setPlaceholder('Digite o nome do cliente')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const postalInput = new TextInputBuilder()
        .setCustomId('postal')
        .setLabel('Código Postal')
        .setPlaceholder('Digite o código postal')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const empresaInput = new TextInputBuilder()
        .setCustomId('empresa')
        .setLabel('Empresa')
        .setPlaceholder('Digite o nome da empresa')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const cidadeInput = new TextInputBuilder()
        .setCustomId('cidade')
        .setLabel('Cidade')
        .setPlaceholder('Digite a cidade')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const row1 = new ActionRowBuilder().addComponents(nomeInput);
      const row2 = new ActionRowBuilder().addComponents(postalInput);
      const row3 = new ActionRowBuilder().addComponents(empresaInput);
      const row4 = new ActionRowBuilder().addComponents(cidadeInput);
      modal.addComponents(row1, row2, row3, row4);

      await interaction.showModal(modal);
    }

    if (interaction.commandName === 'clientes') {
      // A lógica de exibição agora está na função atualizarClientesChannel
      // Apenas chame a função, ela gerenciará o envio/edição da mensagem principal.
      // A resposta inicial efêmera será gerenciada dentro de atualizarClientesChannel se a mensagem principal for enviada/encontrada.
       if (!interaction.replied && !interaction.deferred) {
            await interaction.deferReply({ ephemeral: true }); // Adia a resposta inicial do comando
       }
      await atualizarClientesChannel(client, 1, interaction); // Passa a interação para que atualizarClientesChannel possa deletar a resposta de deferimento
      // Não precisa de return aqui, a interação foi adiada e será tratada por atualizarClientesChannel
    }

    if (interaction.commandName === 'removecliente') {
      const modal = new ModalBuilder()
        .setCustomId('modal_remover_cliente')
        .setTitle('Remover Cliente');

      const postalInput = new TextInputBuilder()
        .setCustomId('postal')
        .setLabel('Código Postal do Cliente para remover')
        .setPlaceholder('Digite o código postal do cliente')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const row = new ActionRowBuilder().addComponents(postalInput);
      modal.addComponents(row);

      return await interaction.showModal(modal);
    }

    if (interaction.commandName === 'editar_cliente') {
      try {
        // Adiar a resposta imediatamente para evitar timeout
        await interaction.deferReply({ flags: 64 });
        
        console.log('Modal Editar Cliente submetido.');
        const postal = interaction.fields.getTextInputValue('postal');
        const nome = interaction.fields.getTextInputValue('nome');
        const empresa = interaction.fields.getTextInputValue('empresa');
        const cidade = interaction.fields.getTextInputValue('cidade');
        console.log(`Postal: ${postal}, Novo Nome: ${nome}, Nova Empresa: ${empresa}, Nova Cidade: ${cidade}`);

        if (!clients.has(postal)) {
          await interaction.editReply({ content: `❌ Cliente com número (postal) ${postal} não encontrado.` });
          console.log(`Cliente com postal ${postal} não encontrado para edição.`);
          return;
        }

        const clienteAntigo = clients.get(postal);
        clients.set(postal, { cliente: nome, empresa, cidade, postal });
        saveClients();
        console.log('Clientes salvos após edição.');
        await atualizarClientesChannel(client);
        console.log('Canal de clientes atualizado após edição.');

        await interaction.editReply({
          content: `✅ Cliente atualizado com sucesso!\n\n**Antes:**\nNome: ${clienteAntigo.cliente}\nEmpresa: ${clienteAntigo.empresa}\nCidade: ${clienteAntigo.cidade}\n\n**Depois:**\nNome: ${nome}\nEmpresa: ${empresa}\nCidade: ${cidade}`
        });
        console.log('Resposta efêmera enviada para editar cliente.');
        return;
      } catch (error) {
        console.error('Erro ao processar modal_editar_cliente:', error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '❌ Ocorreu um erro ao editar o cliente.', flags: 64 });
        } else {
          await interaction.editReply({ content: '❌ Ocorreu um erro ao editar o cliente.' });
        }
        console.error('Erro capturado no handler de modal editar cliente.');
        return;
      }
    }

    if (interaction.commandName === 'entrada') {
      const modal = new ModalBuilder()
        .setCustomId('modal_entrada')
        .setTitle('Registrar Entrada do Caixa');

      const valorInput = new TextInputBuilder()
        .setCustomId('valor')
        .setLabel('Valor da Entrada')
        .setPlaceholder('Valor da entrada')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const motivoInput = new TextInputBuilder()
        .setCustomId('motivo')
        .setLabel('Motivo da Entrada')
        .setPlaceholder('Descreva o motivo da entrada.')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const row1 = new ActionRowBuilder().addComponents(valorInput);
      const row2 = new ActionRowBuilder().addComponents(motivoInput);
      modal.addComponents(row1, row2);

      await interaction.showModal(modal);
    }

    if (interaction.commandName === 'saida') {
      const modal = new ModalBuilder()
        .setCustomId('modal_saida')
        .setTitle('Registrar Saída do Caixa');

      const valorInput = new TextInputBuilder()
        .setCustomId('valor')
        .setLabel('Valor da Saída')
        .setPlaceholder('Valor da saída')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const motivoInput = new TextInputBuilder()
        .setCustomId('motivo')
        .setLabel('Motivo da Saída')
        .setPlaceholder('Descreva o motivo da saída.')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const row1 = new ActionRowBuilder().addComponents(valorInput);
      const row2 = new ActionRowBuilder().addComponents(motivoInput);
      modal.addComponents(row1, row2);

      await interaction.showModal(modal);
    }

    if (interaction.commandName === 'encomenda') {
      const orderId = `${interaction.channel.id}-${interaction.user.id}-${Date.now()}`;
      orders.set(orderId, {
        id: orderId,
        cliente: '',
        postal: '',
        empresa: '',
        cidade: '',
        obs: '',
        items: {},
        selected: null,
        selectedCategoria: null,
        selectedProduto: null,
        userId: interaction.user.id
      });

      saveOrders();

      const embed = generateOrderEmbed(orderId, orders.get(orderId));
      await interaction.reply({
        embeds: [embed],
        components: limitComponents([...buildProductSelectors(orderId), ...buildItemControls(orderId, orders.get(orderId))]),
      });
    }

    if (interaction.commandName === 'addproduto') {
      const modal = new ModalBuilder()
        .setCustomId('modal_add_produto')
        .setTitle('Adicionar Novo Produto');

      const categoriaInput = new TextInputBuilder()
        .setCustomId('categoria')
        .setLabel('Categoria')
        .setPlaceholder('Digite a categoria do produto')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const nomeInput = new TextInputBuilder()
        .setCustomId('nome')
        .setLabel('Nome do Produto')
        .setPlaceholder('Digite o nome do produto')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const precoInput = new TextInputBuilder()
        .setCustomId('preco')
        .setLabel('Preço')
        .setPlaceholder('Digite o preço do produto')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const row1 = new ActionRowBuilder().addComponents(categoriaInput);
      const row2 = new ActionRowBuilder().addComponents(nomeInput);
      const row3 = new ActionRowBuilder().addComponents(precoInput);
      modal.addComponents(row1, row2, row3);

      return await interaction.showModal(modal);
    }

    if (interaction.commandName === 'modificarproduto') {
      const modal = new ModalBuilder()
        .setCustomId('modal_edit_produto')
        .setTitle('Modificar Produto');

      const categoriaInput = new TextInputBuilder()
        .setCustomId('categoria')
        .setLabel('Categoria')
        .setPlaceholder('Digite a categoria do produto')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const nomeInput = new TextInputBuilder()
        .setCustomId('nome')
        .setLabel('Nome do Produto')
        .setPlaceholder('Digite o nome do produto')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const precoInput = new TextInputBuilder()
        .setCustomId('preco')
        .setLabel('Novo Preço')
        .setPlaceholder('Digite o novo preço do produto')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const row1 = new ActionRowBuilder().addComponents(categoriaInput);
      const row2 = new ActionRowBuilder().addComponents(nomeInput);
      const row3 = new ActionRowBuilder().addComponents(precoInput);
      modal.addComponents(row1, row2, row3);

      return await interaction.showModal(modal);
    }

    if (interaction.commandName === 'add_categoria') {
      const modal = new ModalBuilder()
        .setCustomId('modal_add_categoria')
        .setTitle('Adicionar Nova Categoria');

      const categoriaInput = new TextInputBuilder()
        .setCustomId('categoria')
        .setLabel('Nome da Categoria')
        .setPlaceholder('Digite o nome da categoria')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const row = new ActionRowBuilder().addComponents(categoriaInput);
      modal.addComponents(row);

      return await interaction.showModal(modal);
    }

    if (interaction.commandName === 'listarprodutos') {
      const products = loadProducts(); // Recarrega produtos para garantir dados recentes
      let message = '📋 **Lista de Produtos:**\n\n';

      const categories = Object.keys(productsData); // Use productsData global
      if (categories.length === 0) {
          message += 'Nenhum produto cadastrado ainda.';
      } else {
          categories.forEach(categoria => {
              message += `**${categoria}**\n`;
              const produtos = productsData[categoria]; // Use productsData global
              const productNames = Object.keys(produtos);
              if (productNames.length === 0) {
                  message += 'Nenhum produto nesta categoria.\n';
              } else {
                  productNames.forEach(nome => {
                      message += `- ${nome}: $${parseFloat(produtos[nome]).toFixed(2).replace('.', ',')}\n`;
                  });
              }
              message += '\n';
          });
      }


      return interaction.reply({
        content: message,
        flags: 64
      });
    }
  }

  // Handler para botões
  if (interaction.isButton()) {
    const customId = interaction.customId;

    // Handlers para os botões de paginação de clientes
    if (customId.startsWith('page_clientes')) {
        const [, requestedPageStr, totalPagesStr] = customId.split('|');
        const requestedPage = parseInt(requestedPageStr);
        const totalPages = parseInt(totalPagesStr);

        if (!isNaN(requestedPage) && requestedPage >= 1 && requestedPage <= totalPages) {
            await interaction.deferUpdate(); // Adia a interação do botão de paginação
            await atualizarClientesChannel(client, requestedPage, interaction); // Passa a interação para que atualizarClientesChannel possa deletar a resposta de deferimento
        } else {
             if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'Página inválida.', flags: 64 });
             }
        }
        return; // <-- Manter return para sair do handler de botões de paginação
    }

    // Handlers para os botões dos canais de clientes, caixa e produtos existentes
    if (customId === 'btn_add_cliente') {
      const modal = new ModalBuilder()
        .setCustomId('modal_adicionar_cliente')
        .setTitle('Adicionar Novo Cliente');

      const nomeInput = new TextInputBuilder()
        .setCustomId('nome')
        .setLabel('Nome do Cliente')
        .setPlaceholder('Digite o nome do cliente')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const postalInput = new TextInputBuilder()
        .setCustomId('postal')
        .setLabel('Código Postal')
        .setPlaceholder('Digite o código postal')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const empresaInput = new TextInputBuilder()
        .setCustomId('empresa')
        .setLabel('Empresa')
        .setPlaceholder('Digite o nome da empresa')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const cidadeInput = new TextInputBuilder()
        .setCustomId('cidade')
        .setLabel('Cidade')
        .setPlaceholder('Digite a cidade')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const row1 = new ActionRowBuilder().addComponents(nomeInput);
      const row2 = new ActionRowBuilder().addComponents(postalInput);
      const row3 = new ActionRowBuilder().addComponents(empresaInput);
      const row4 = new ActionRowBuilder().addComponents(cidadeInput);
      modal.addComponents(row1, row2, row3, row4);

      return await interaction.showModal(modal);
    }

    if (customId === 'btn_edit_cliente') {
      const modal = new ModalBuilder()
        .setCustomId('modal_editar_cliente')
        .setTitle('Editar Cliente');

      const postalInput = new TextInputBuilder()
        .setCustomId('postal')
        .setLabel('Código Postal do Cliente a Editar')
        .setPlaceholder('Digite o código postal do cliente')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const nomeInput = new TextInputBuilder()
        .setCustomId('nome')
        .setLabel('Novo Nome')
        .setPlaceholder('Digite o novo nome do cliente')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const empresaInput = new TextInputBuilder()
        .setCustomId('empresa')
        .setLabel('Nova Empresa')
        .setPlaceholder('Digite o novo nome da empresa')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const cidadeInput = new TextInputBuilder()
        .setCustomId('cidade')
        .setLabel('Nova Cidade')
        .setPlaceholder('Digite a nova cidade')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const row1 = new ActionRowBuilder().addComponents(postalInput);
      const row2 = new ActionRowBuilder().addComponents(nomeInput);
      const row3 = new ActionRowBuilder().addComponents(empresaInput);
      const row4 = new ActionRowBuilder().addComponents(cidadeInput);
      modal.addComponents(row1, row2, row3, row4);

      return await interaction.showModal(modal);
    }

    if (customId === 'btn_remove_cliente') {
      const modal = new ModalBuilder()
        .setCustomId('modal_remover_cliente')
        .setTitle('Remover Cliente');

      const postalInput = new TextInputBuilder()
        .setCustomId('postal')
        .setLabel('Código Postal do Cliente para remover')
        .setPlaceholder('Digite o código postal do cliente')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const row = new ActionRowBuilder().addComponents(postalInput);
      modal.addComponents(row);

      return await interaction.showModal(modal);
    }

    if (customId === 'btn_atualizar_clientes') {
      await atualizarClientesChannel(client, 1, interaction);
      // return await interaction.reply({ content: '✅ Lista de clientes atualizada.', flags: 64 }); // Removido para evitar double reply
    }

    // Handlers para os botões do canal de caixa
    if (customId === 'btn_entrada_caixa') {
      const modal = new ModalBuilder()
        .setCustomId('modal_entrada')
        .setTitle('Registrar Entrada do Caixa');

      const valorInput = new TextInputBuilder()
        .setCustomId('valor')
        .setLabel('Valor da Entrada')
        .setPlaceholder('Valor da entrada')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const motivoInput = new TextInputBuilder()
        .setCustomId('motivo')
        .setLabel('Motivo da Entrada')
        .setPlaceholder('Descreva o motivo da entrada.')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const row1 = new ActionRowBuilder().addComponents(valorInput);
      const row2 = new ActionRowBuilder().addComponents(motivoInput);
      modal.addComponents(row1, row2);

      return await interaction.showModal(modal);
    }

    if (customId === 'btn_saida_caixa') {
      const modal = new ModalBuilder()
        .setCustomId('modal_saida')
        .setTitle('Registrar Saída do Caixa');

      const valorInput = new TextInputBuilder()
        .setCustomId('valor')
        .setLabel('Valor da Saída')
        .setPlaceholder('Valor da saída')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const motivoInput = new TextInputBuilder()
        .setCustomId('motivo')
        .setLabel('Motivo da Saída')
        .setPlaceholder('Descreva o motivo da saída.')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const row1 = new ActionRowBuilder().addComponents(valorInput);
      const row2 = new ActionRowBuilder().addComponents(motivoInput);
      modal.addComponents(row1, row2);

      return await interaction.showModal(modal);
    }

    if (customId === 'btn_atualizar_caixa') {
      await atualizarCaixaChannel(client);
      return await interaction.reply({ content: '✅ Saldo do caixa atualizado.', flags: 64 });
    }

    // Handlers para os botões do canal de produtos
    if (customId === 'btn_add_produto') {
      const modal = new ModalBuilder()
        .setCustomId('modal_add_produto')
        .setTitle('Adicionar Novo Produto');

      const categoriaInput = new TextInputBuilder()
        .setCustomId('categoria')
        .setLabel('Categoria')
        .setPlaceholder('Digite a categoria do produto')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const nomeInput = new TextInputBuilder()
        .setCustomId('nome')
        .setLabel('Nome do Produto')
        .setPlaceholder('Digite o nome do produto')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const precoInput = new TextInputBuilder()
        .setCustomId('preco')
        .setLabel('Preço')
        .setPlaceholder('Digite o preço do produto')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const row1 = new ActionRowBuilder().addComponents(categoriaInput);
      const row2 = new ActionRowBuilder().addComponents(nomeInput);
      const row3 = new ActionRowBuilder().addComponents(precoInput);
      modal.addComponents(row1, row2, row3);

      return await interaction.showModal(modal);
    }

    if (customId === 'btn_edit_produto') {
      const modal = new ModalBuilder()
        .setCustomId('modal_edit_produto')
        .setTitle('Modificar Produto');

      const categoriaInput = new TextInputBuilder()
        .setCustomId('categoria')
        .setLabel('Categoria')
        .setPlaceholder('Digite a categoria do produto')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const nomeInput = new TextInputBuilder()
        .setCustomId('nome')
        .setLabel('Nome do Produto')
        .setPlaceholder('Digite o nome do produto')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const precoInput = new TextInputBuilder()
        .setCustomId('preco')
        .setLabel('Novo Preço')
        .setPlaceholder('Digite o novo preço do produto')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const row1 = new ActionRowBuilder().addComponents(categoriaInput);
      const row2 = new ActionRowBuilder().addComponents(nomeInput);
      const row3 = new ActionRowBuilder().addComponents(precoInput);
      modal.addComponents(row1, row2, row3);

      return await interaction.showModal(modal);
    }

    if (customId === 'btn_add_categoria') {
      const modal = new ModalBuilder()
        .setCustomId('modal_add_categoria')
        .setTitle('Adicionar Nova Categoria');

      const categoriaInput = new TextInputBuilder()
        .setCustomId('categoria')
        .setLabel('Nome da Categoria')
        .setPlaceholder('Digite o nome da categoria')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const row = new ActionRowBuilder().addComponents(categoriaInput);
      modal.addComponents(row);

      return await interaction.showModal(modal);
    }

    if (customId === 'btn_atualizar_produtos') {
      await atualizarProdutosChannel(client);
      return await interaction.reply({ content: '✅ Lista de produtos atualizada.', flags: 64 });
    }

    // Handler para botões de paginação de produtos
    if (customId.startsWith('btn_produtos_page_')) {
      const page = parseInt(customId.split('_')[3]);
      await atualizarProdutosChannel(client, page);
      return await interaction.reply({ content: `✅ Página ${page} carregada.`, flags: 64 });
    }

    // Handler para botões de paginação de produtos em encomendas
    if (customId.startsWith('produto_page_')) {
      const [, , orderId, page] = customId.split('_');
      const order = orders.get(orderId);
      if (!order) return interaction.reply({ content: '❌ Encomenda não encontrada.', flags: 64 });
      
      const embed = generateOrderEmbed(order.id, order);
      return await interaction.update({
        embeds: [embed],
        components: limitComponents([...buildProductSelectors(order.id, order.selectedCategoria, order.selectedProduto, parseInt(page)), ...buildItemControls(order.id, order)])
      });
    }

    // --- Novos Handlers para botões de remoção de produtos ---
    if (customId === 'btn_remove_produto') {
      const modal = new ModalBuilder()
        .setCustomId('modal_remove_produto')
        .setTitle('Remover Produto');

      const categoriaInput = new TextInputBuilder()
        .setCustomId('categoria')
        .setLabel('Categoria do Produto')
        .setPlaceholder('Digite a categoria do produto')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const nomeInput = new TextInputBuilder()
        .setCustomId('nome')
        .setLabel('Nome do Produto')
        .setPlaceholder('Digite o nome do produto para remover')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const row1 = new ActionRowBuilder().addComponents(categoriaInput);
      const row2 = new ActionRowBuilder().addComponents(nomeInput);
      modal.addComponents(row1, row2);

      return await interaction.showModal(modal);
    }

    // --- Novos Handlers para botões de remoção de categorias ---
    if (customId === 'btn_remove_categoria') {
      const modal = new ModalBuilder()
        .setCustomId('modal_remove_categoria')
        .setTitle('Remover Categoria');

      const categoriaInput = new TextInputBuilder()
        .setCustomId('categoria')
        .setLabel('Nome da Categoria para remover')
        .setPlaceholder('Digite o nome da categoria')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const row = new ActionRowBuilder().addComponents(categoriaInput);
      modal.addComponents(row);

      return await interaction.showModal(modal);
    }

    // Handlers existentes para botões relacionados a encomendas (usando split '|')
    const [action, orderId] = interaction.customId.split('|');

    if (action === 'entrega_sim') {
      try {
      const message = await interaction.message.fetch();
      const embed = EmbedBuilder.from(message.embeds[0])
          .setColor('Green')
          .setFooter({ text: 'Status: Entrega Efetuada ✅' })
        .addFields(
            { name: '👤 Entrega efetuada por:', value: `<@${interaction.user.id}>`, inline: true }
          );

        // Encontrar a encomenda finalizada para obter o valor total
        // A encomenda finalizada é salva com todos os dados antes de ser enviada para o canal FINALIZED_CHANNEL_ID
        // Precisamos recarregar as encomendas para encontrar a que foi finalizada
        loadOrders(); // Recarrega as encomendas (incluindo as finalizadas temporariamente salvas)
        const order = orders.get(orderId); // Tenta buscar a encomenda finalizada

        if (order) {
          // Calcular o valor total da encomenda
          const totalEncomenda = Object.entries(order.items).reduce((sum, [item, data]) => {
             let preco = 0;
             // Buscar o preço pelo nome do produto em todas as categorias
             for (const categoria in productsData) {
               if (productsData[categoria][item]) {
                 preco = parseFloat(productsData[categoria][item]) || 0;
                 break;
               }
             }
             return sum + (preco * data.quantidade);
           }, 0);

          caixa += totalEncomenda; // Adiciona o valor ao caixa
          saveCaixa(); // Salva o novo saldo do caixa

          // Criar e enviar embed detalhado da entrada para o canal de saídas
          const embedEntrada = new EmbedBuilder()
            .setTitle('📥 Entrada de Caixa (Encomenda Finalizada)')
        .addFields(
              { name: '💵 Valor:', value: `$ ${totalEncomenda.toFixed(2).replace('.', ',')}` },
              {
                name: '📦 Detalhes da Encomenda:',
                value: order.cliente ? `Pagamento da encomenda do(a) cliente ${order.cliente}` : 'Pagamento da encomenda de cliente não identificado'
              },
              { name: '💰 Novo Saldo:', value: `$ ${caixa.toFixed(2).replace('.', ',')}` },
              { name: '👤 Registrado por:', value: `<@${interaction.user.id}>` }
            )
            .setColor('Green')
            .setTimestamp();

          const canalSaidas = client.channels.cache.get(CHANNEL_SAIDAS);
          if (canalSaidas) {
            await canalSaidas.send({ embeds: [embedEntrada] });
          }

          await atualizarCaixaChannel(client); // Atualiza a mensagem do caixa no canal principal

          // Remover a encomenda finalizada do Map orders após adicionar ao caixa
          orders.delete(orderId);
      saveOrders();
        }

        const updatedRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`entrega_sim|${orderId}`)
            .setLabel("🚚 Efetuada")
            .setStyle(ButtonStyle.Success)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId(`entrega_atraso|${orderId}`)
            .setLabel("⚠️ Atraso")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId(`entrega_cancelar|${orderId}`)
            .setLabel("🛑 Cancelar")
            .setStyle(ButtonStyle.Danger)
            .setDisabled(true)
        );

        await interaction.update({ embeds: [embed], components: [updatedRow] });
      } catch (error) {
        console.error('Erro ao processar entrega efetuada:', error);
        return interaction.reply({ content: '❌ Ocorreu um erro ao registrar a entrega efetuada.', flags: 64 });
      }
    }

    if (action === 'entrega_atraso') {
      try {
          const modal = new ModalBuilder()
            .setCustomId(`modal_atraso|${orderId}`)
          .setTitle('Motivo do Atraso');

          const motivoInput = new TextInputBuilder()
            .setCustomId('motivo')
          .setLabel('Motivo')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

          const row = new ActionRowBuilder().addComponents(motivoInput);
          modal.addComponents(row);

        return await interaction.showModal(modal);

      } catch (error) {
        console.error('Erro ao mostrar modal de atraso:', error);
        return interaction.reply({ content: '❌ Ocorreu um erro ao solicitar o motivo do atraso.', flags: 64 });
      }
    }

    if (action === 'entrega_cancelar') {
      try {
      const modal = new ModalBuilder()
          .setCustomId(`modal_cancelar|${orderId}`)
          .setTitle('Motivo do Cancelamento');

      const motivoInput = new TextInputBuilder()
        .setCustomId('motivo')
          .setLabel('Motivo')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

        const row = new ActionRowBuilder().addComponents(motivoInput);
        modal.addComponents(row);

        return await interaction.showModal(modal);

      } catch (error) {
        console.error('Erro ao mostrar modal de cancelamento:', error);
        return interaction.reply({ content: '❌ Ocorreu um erro ao solicitar o motivo do cancelamento.', flags: 64 });
      }
    }

    if (action === 'aumentar') {
      const orderId = interaction.customId.split('|')[1];
      const order = orders.get(orderId);
      if (!order || !order.selected) return interaction.reply({ content: '❌ Nenhum item selecionado para aumentar a quantidade.', flags: 64 }); // Adicionado resposta

      const modal = new ModalBuilder()
        .setCustomId(`modal_quantidade|${orderId}`)
        .setTitle('Aumentar Quantidade');

      const quantidadeInput = new TextInputBuilder()
        .setCustomId('nova_quantidade')
        .setLabel('Nova Quantidade')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Digite a quantidade a ser adicionada')
        .setRequired(true);

      const row = new ActionRowBuilder().addComponents(quantidadeInput);
      modal.addComponents(row);
      return interaction.showModal(modal);
    }

    if (action === 'diminuir') {
      const orderId = interaction.customId.split('|')[1];
      const order = orders.get(orderId);
      if (!order || !order.selected) return interaction.reply({ content: '❌ Nenhum item selecionado para diminuir a quantidade.', flags: 64 }); // Adicionado resposta

      const modal = new ModalBuilder()
        .setCustomId(`modal_diminuir|${orderId}`)
        .setTitle('Diminuir Quantidade');

      const diminuirInput = new TextInputBuilder()
        .setCustomId('novo_diminuir')
        .setLabel('Quantidade a Diminuir')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Digite a quantidade a ser diminuída')
        .setRequired(true);

      const row = new ActionRowBuilder().addComponents(diminuirInput);
      modal.addComponents(row);
      return interaction.showModal(modal);
    }

    if (action === 'produzir') {
      const orderId = interaction.customId.split('|')[1];
      const order = orders.get(orderId);
      if (!order || !order.selected) return interaction.reply({ content: '❌ Nenhum item selecionado para registrar produção.', flags: 64 }); // Adicionado resposta

      const modal = new ModalBuilder()
        .setCustomId(`modal_produzido|${orderId}`)
        .setTitle('Registrar Produção');

      const produzidoInput = new TextInputBuilder()
        .setCustomId('novo_produzido')
        .setLabel('Quantidade Produzida')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Digite a quantidade produzida')
        .setRequired(true);

      const row = new ActionRowBuilder().addComponents(produzidoInput);
      modal.addComponents(row);
      return interaction.showModal(modal);
    }

    if (action === 'remover_item') {
      const orderId = interaction.customId.split('|')[1];
      const order = orders.get(orderId);
      if (!order || !order.selected) return interaction.reply({ content: '❌ Nenhum item selecionado para remover.', flags: 64 });

      const removedItem = order.selected;
      delete order.items[removedItem];
      order.selected = null; // Limpa a seleção
      order.selectedProduto = null; // Limpa a seleção do produto no menu
      saveOrders();

      const embed = generateOrderEmbed(order.id, order);
      // Reconstroi os componentes, excluindo o item removido e redefinindo seletores
      return await interaction.update({
        embeds: [embed],
        components: [
          ...buildProductSelectors(order.id, order.selectedCategoria, order.selectedProduto),
          ...buildItemControls(order.id, order)
        ]
      });
    }

    if (action === 'atualizar') {
      const orderId = interaction.customId.split('|')[1];
      const order = orders.get(orderId);
      if (!order) return interaction.reply({ content: '❌ Encomenda não encontrada.', flags: 64 });

      // Apenas regenerar e atualizar o embed e componentes com base nos dados atuais da order
      const embed = generateOrderEmbed(order.id, order);
      return await interaction.update({ embeds: [embed], components: limitComponents([...buildProductSelectors(order.id, order.selectedCategoria, order.selectedProduto), ...buildItemControls(order.id, order)]) });
    }

    if (action === 'preencher_dados') {
      const orderId = interaction.customId.split('|')[1];
      const order = orders.get(orderId);
      if (!order || !order.selected) return interaction.reply({ content: '❌ Nenhum item selecionado para preencher dados.', flags: 64 }); // Adicionado resposta

      const modal = new ModalBuilder()
        .setCustomId(`formulario_cliente|${orderId}`) // CustomId ajustado para incluir orderId
        .setTitle('Dados do Cliente');

      const clienteInput = new TextInputBuilder()
        .setCustomId('cliente')
        .setLabel('Nome do Cliente')
        .setStyle(TextInputStyle.Short)
        .setValue(order.cliente || '')
        .setRequired(true);

      const postalInput = new TextInputBuilder()
        .setCustomId('postal')
        .setLabel('Código Postal')
        .setStyle(TextInputStyle.Short)
        .setValue(order.postal || '')
        .setRequired(true);

      const empresaInput = new TextInputBuilder()
        .setCustomId('empresa')
        .setLabel('Empresa')
        .setStyle(TextInputStyle.Short)
        .setValue(order.empresa || '')
        .setRequired(false); // Empresa não é obrigatório

      const cidadeInput = new TextInputBuilder()
        .setCustomId('cidade')
        .setLabel('Cidade')
        .setStyle(TextInputStyle.Short)
        .setValue(order.cidade || '')
        .setRequired(true);

      const obsInput = new TextInputBuilder()
        .setCustomId('obs')
        .setLabel('Observações')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(order.obs || '')
        .setRequired(false);

      const row1 = new ActionRowBuilder().addComponents(clienteInput);
      const row2 = new ActionRowBuilder().addComponents(postalInput);
      const row3 = new ActionRowBuilder().addComponents(empresaInput);
      const row4 = new ActionRowBuilder().addComponents(cidadeInput);
      const row5 = new ActionRowBuilder().addComponents(obsInput);

      modal.addComponents(row1, row2, row3, row4, row5);

      return await interaction.showModal(modal);
    }


    if (action === 'usar_cliente') {
      const orderId = interaction.customId.split('|')[1];
      const order = orders.get(orderId);
      if (!order) return interaction.reply({ content: '❌ Encomenda não encontrada.', flags: 64 });

      const modal = new ModalBuilder()
        .setCustomId(`modal_usar_cliente|${orderId}`)
        .setTitle('Buscar Cliente por Postal');

      const postalInput = new TextInputBuilder()
        .setCustomId('postal_cliente')
        .setLabel('Código Postal do Cliente')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Digite o código postal')
        .setRequired(true);

      const row = new ActionRowBuilder().addComponents(postalInput);
      modal.addComponents(row);

      return await interaction.showModal(modal);
    }

     if (action === 'editar_obs') {
        const orderId = interaction.customId.split('|')[1];
        const order = orders.get(orderId);
        if (!order) return interaction.reply({ content: '❌ Encomenda não encontrada.', flags: 64 }); // Adicionado resposta

        const modal = new ModalBuilder()
            .setCustomId(`editar_obs_modal|${orderId}`) // CustomId ajustado para incluir orderId
            .setTitle('Editar Observações');

        const obsInput = new TextInputBuilder()
            .setCustomId('nova_obs')
            .setLabel('Novas Observações')
            .setStyle(TextInputStyle.Paragraph)
            .setValue(order.obs || '')
            .setRequired(false);

        const row = new ActionRowBuilder().addComponents(obsInput);
        modal.addComponents(row);

        return await interaction.showModal(modal);
    }


    if (action === 'finalizar') {
      const orderId = interaction.customId.split('|')[1];
      const order = orders.get(orderId);
      if (!order) return interaction.reply({ content: '❌ Encomenda não encontrada.', flags: 64 });

      try {
        if (Object.keys(order.items).length === 0) {
          return interaction.reply({ content: '❌ Adicione pelo menos um item antes de finalizar a encomenda!', flags: 64 });
        }

        const embed = generateOrderEmbed(order.id, order)
          .setColor('Yellow')
          .setFooter({ text: 'Status: Entrega Pendente 🕐' });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`entrega_sim|${order.id}`)
            .setLabel("🚚 Efetuada")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`entrega_atraso|${order.id}`)
            .setLabel("⚠️ Atraso")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`entrega_cancelar|${order.id}`)
            .setLabel("🛑 Cancelar")
            .setStyle(ButtonStyle.Danger)
        );

        const targetChannel = await client.channels.fetch(FINALIZED_CHANNEL_ID);
        if (!targetChannel) {
          return interaction.reply({ content: '❌ Erro: Canal de entregas não encontrado!', flags: 64 });
        }

        // Salvar a encomenda antes de enviar para o canal de finalizados
        saveOrders(); // Salva a encomenda antes de removê-la do Map global

        await targetChannel.send({ embeds: [embed], components: [row] });
        await interaction.message.delete();

        // A encomenda será removida do Map e do arquivo quando a entrega for efetuada ou cancelada/atrasada
        // orders.delete(order.id);
        // saveOrders();

        return interaction.reply({ content: "📦 Encomenda finalizada e enviada para o canal de entregas!", flags: 64 }); // Mensagem efêmera
      } catch (error) {
        console.error('Erro ao finalizar encomenda:', error);
        return interaction.reply({ content: '❌ Ocorreu um erro ao finalizar a encomenda. Por favor, tente novamente.', flags: 64 });
      }
    }

    if (interaction.customId === 'btn_nova_encomenda') {
      const orderId = `${interaction.channel.id}-${interaction.user.id}-${Date.now()}`;
      orders.set(orderId, {
        id: orderId,
        cliente: '',
        postal: '',
        empresa: '',
        cidade: '',
        obs: '',
        items: {},
        selected: null,
        selectedCategoria: null,
        selectedProduto: null,
        userId: interaction.user.id
      });

      saveOrders();

      const embed = generateOrderEmbed(orderId, orders.get(orderId));
      await interaction.reply({
        embeds: [embed],
        components: limitComponents([...buildProductSelectors(orderId), ...buildItemControls(orderId, orders.get(orderId))]),
      });
    }
  }

  // Adicionar return aqui para sair do handler de botões
  if (interaction.isButton()) {
      return; // Garante que nenhuma outra lógica seja executada após um botão ser processado
  }

  // Handler para seleção de menu (removido duplicado; único handler mantido mais abaixo)

  // Handler para modais
  if (interaction.isModalSubmit()) {
    const [customId, orderId] = interaction.customId.split('|');

    if (customId === 'modal_atraso') {
      try {
        console.log(`Modal Atraso submetido para orderId: ${orderId}`);
        const motivo = interaction.fields.getTextInputValue('motivo');
        console.log(`Motivo do atraso: ${motivo}`);
        // Buscar a mensagem original que continha o botão (a mensagem no canal de finalizados)
        const message = await interaction.channel.messages.fetch(interaction.message.id);
        console.log('Mensagem original encontrada.');

        const embed = EmbedBuilder.from(message.embeds[0])
          .setColor('Yellow')
          .setFooter({ text: 'Status: Atrasado ⚠️' })
          .addFields(
            { name: '👤 Registrado por:', value: `<@${interaction.user.id}>`, inline: true },
            { name: '📝 Motivo do Atraso:', value: motivo, inline: false }
          );

        const updatedRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`entrega_sim|${orderId}`)
            .setLabel("🚚 Efetuada")
            .setStyle(ButtonStyle.Success)
            .setDisabled(false),
          new ButtonBuilder()
            .setCustomId(`entrega_atraso|${orderId}`)
            .setLabel("⚠️ Atraso")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId(`entrega_cancelar|${orderId}`)
            .setLabel("🛑 Cancelar")
            .setStyle(ButtonStyle.Danger)
            .setDisabled(false)
        );

        // Usa message.edit para atualizar a mensagem no canal de finalizados
        await message.edit({ embeds: [embed], components: [updatedRow] });
        console.log('Mensagem de entrega atualizada para Atrasado.');
        // Responde à interação de submissão do modal (mensagem efêmera de confirmação)
        await interaction.reply({ content: '✅ Atraso registrado com sucesso.', flags: 64 });
        console.log('Resposta efêmera enviada.');
        return; // Encerrar o handler
      } catch (error) {
        console.error(`Erro ao processar modal de atraso para orderId ${orderId}:`, error);
        if (!interaction.replied && !interaction.deferred) {
             await interaction.reply({ content: '❌ Ocorreu um erro ao registrar o motivo do atraso.', flags: 64 });
        }
        console.error('Erro capturado no handler de modal atraso.');
        return; // Encerrar em caso de erro
      }
    }

    if (customId === 'modal_cancelar') {
      try {
        console.log(`Modal Cancelar submetido para orderId: ${orderId}`);
        const motivo = interaction.fields.getTextInputValue('motivo');
        console.log(`Motivo do cancelamento: ${motivo}`);
        // Buscar a mensagem original que continha o botão (a mensagem no canal de finalizados)
        const message = await interaction.channel.messages.fetch(interaction.message.id);
        console.log('Mensagem original encontrada.');

        const embed = EmbedBuilder.from(message.embeds[0])
          .setColor('Red')
          .setFooter({ text: 'Status: Cancelado ❌' })
           .addFields(
            { name: '👤 Registrado por:', value: `<@${interaction.user.id}>`, inline: true },
            { name: '📝 Motivo do Cancelamento:', value: motivo, inline: false }
          );

        const updatedRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
            .setCustomId(`entrega_sim|${orderId}`)
            .setLabel("✅ Efetuada")
            .setStyle(ButtonStyle.Success)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId(`entrega_atraso|${orderId}`)
            .setLabel("⚠️ Atraso")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId(`entrega_cancelar|${orderId}`)
            .setLabel("🛑 Cancelar")
      .setStyle(ButtonStyle.Danger)
            .setDisabled(true)
        );

        // Usa message.edit para atualizar a mensagem no canal de finalizados
        await message.edit({ embeds: [embed], components: [updatedRow] });
        console.log('Mensagem de entrega atualizada para Cancelado.');
        // Responde à interação de submissão do modal (mensagem efêmera de confirmação)
        await interaction.reply({ content: '✅ Cancelamento registrado com sucesso.', flags: 64 });
        console.log('Resposta efêmera enviada.');
        return; // Encerrar o handler

      } catch (error) {
        console.error(`Erro ao processar modal de cancelamento para orderId ${orderId}:`, error);
         if (!interaction.replied && !interaction.deferred) {
             await interaction.reply({ content: '❌ Ocorreu um erro ao registrar o motivo do cancelamento.', flags: 64 });
        }
        console.error('Erro capturado no handler de modal cancelar.');
        return; // Encerrar em caso de erro
      }
    }

    if (customId === 'modal_entrada') {
      try {
        console.log('Modal Entrada submetido.');
        const valorStr = interaction.fields.getTextInputValue('valor').replace(',', '.');
        const motivo = interaction.fields.getTextInputValue('motivo');
        console.log(`Valor: ${valorStr}, Motivo: ${motivo}`);
        const valor = parseFloat(valorStr);

        if (isNaN(valor) || valor <= 0) {
          await interaction.reply({ content: '❌ Valor inválido.', flags: 64 });
          console.log('Valor inválido na entrada.');
          return;
        }

        caixa += valor;
        console.log(`Novo saldo do caixa: ${caixa}`);
        const embed = new EmbedBuilder()
          .setTitle('📥 Entrada de Caixa')
          .addFields(
            { name: '💵 Valor:', value: `$ ${valor.toFixed(2).replace('.', ',')}` },
            { name: '📝 Motivo:', value: motivo },
            { name: '💰 Novo Saldo:', value: `$ ${caixa.toFixed(2).replace('.', ',')}` },
            { name: '👤 Registrado por:', value: `<@${interaction.user.id}>` }
          )
          .setColor('Green')
          .setTimestamp();

        const canalSaidas = client.channels.cache.get(CHANNEL_SAIDAS);
        if (canalSaidas) {
          await canalSaidas.send({ embeds: [embed] });
          console.log('Embed de entrada enviado para canal de saídas.');
        }

        saveCaixa();
        console.log('Caixa salvo.');
        await atualizarCaixaChannel(client);
        console.log('Canal do caixa atualizado.');
        await interaction.reply({ content: '✅ Entrada registrada com sucesso.', flags: 64 });
        console.log('Resposta efêmera enviada para entrada.');
        return;
      } catch (error) {
        console.error('Erro ao processar entrada:', error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '❌ Ocorreu um erro ao processar a entrada.', flags: 64 });
        }
        console.error('Erro capturado no handler de modal entrada.');
        return;
      }
    }

    if (customId === 'modal_saida') {
      try {
        console.log('Modal Saída submetido.');
        const valorStr = interaction.fields.getTextInputValue('valor').replace(',', '.');
        const motivo = interaction.fields.getTextInputValue('motivo');
        console.log(`Valor: ${valorStr}, Motivo: ${motivo}`);
        const valor = parseFloat(valorStr);

        if (isNaN(valor) || valor <= 0) {
          await interaction.reply({ content: '❌ Valor inválido.', flags: 64 });
          console.log('Valor inválido na saída.');
          return;
        }

        if (valor > caixa) {
          await interaction.reply({ content: '❌ Valor maior que o saldo atual.', flags: 64 });
          console.log('Valor maior que o saldo atual na saída.');
          return;
        }

        caixa -= valor;
        console.log(`Novo saldo do caixa: ${caixa}`);
        const embed = new EmbedBuilder()
          .setTitle('📤 Saída de Caixa')
          .addFields(
            { name: '💵 Valor', value: `$ ${valor.toFixed(2).replace('.', ',')}` },
            { name: '📝 Motivo', value: motivo },
            { name: '💰 Novo Saldo', value: `$ ${caixa.toFixed(2).replace('.', ',')}` },
            { name: '👤 Registrado por', value: `<@${interaction.user.id}>` }
          )
          .setColor('Red')
          .setTimestamp();

        const canalSaidas = client.channels.cache.get(CHANNEL_SAIDAS);
        if (canalSaidas) {
          await canalSaidas.send({ embeds: [embed] });
          console.log('Embed de saída enviado para canal de saídas.');
        }

    saveCaixa();
        console.log('Caixa salvo.');
        await atualizarCaixaChannel(client);
        console.log('Canal do caixa atualizado.');
        await interaction.reply({ content: '✅ Saída registrada com sucesso.', flags: 64 });
        console.log('Resposta efêmera enviada para saída.');
        return;
      } catch (error) {
        console.error('Erro ao processar saída:', error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '❌ Ocorreu um erro ao processar a saída.', flags: 64 });
        }
        console.error('Erro capturado no handler de modal saída.');
        return;
      }
    }

    if (customId === 'modal_adicionar_cliente') {
      try {
        console.log('Modal Adicionar Cliente submetido.');
        const nome = interaction.fields.getTextInputValue('nome');
        const postal = interaction.fields.getTextInputValue('postal');
        const empresa = interaction.fields.getTextInputValue('empresa');
        const cidade = interaction.fields.getTextInputValue('cidade');
        console.log(`Nome: ${nome}, Postal: ${postal}, Empresa: ${empresa}, Cidade: ${cidade}`);

        if (clients.has(postal)) {
          await interaction.reply({ content: `⚠️ Já existe um cliente com o postal **${postal}**.`, flags: 64 });
          console.log(`Cliente com postal ${postal} já existe.`);
          return;
        }

        clients.set(postal, { cliente: nome, empresa, cidade, postal });
        saveClients();
        console.log('Clientes salvos.');
        await atualizarClientesChannel(client);
        console.log('Canal de clientes atualizado.');
        await interaction.reply({ content: `✅ Cliente **${nome}** adicionado com sucesso! Número (postal): **${postal}**`, flags: 64 });
        console.log('Resposta efêmera enviada para adicionar cliente.');
        return;
      } catch (error) {
        console.error('Erro ao processar modal_adicionar_cliente:', error);
        if (!interaction.replied && !interaction.deferred) {
           await interaction.reply({ content: '❌ Ocorreu um erro ao adicionar o cliente.', flags: 64 });
        }
        console.error('Erro capturado no handler de modal adicionar cliente.');
        return;
      }
    }

    if (customId === 'modal_remover_cliente') {
      try {
        console.log('Modal Remover Cliente submetido.');
        const postal = interaction.fields.getTextInputValue('postal');
        console.log(`Postal para remover: ${postal}`);

        if (!clients.has(postal)) {
          await interaction.reply({ content: `❌ Cliente com número (postal) ${postal} não encontrado.`, flags: 64 });
          console.log(`Cliente com postal ${postal} não encontrado para remoção.`);
          return;
        }

        const nome = clients.get(postal).cliente;
        clients.delete(postal);
        saveClients();
        console.log('Clientes salvos após remoção.');
        await atualizarClientesChannel(client);
        console.log('Canal de clientes atualizado após remoção.');
        await interaction.reply({ content: `✅ Cliente **${nome}** (postal ${postal}) removido com sucesso.`, flags: 64 });
        console.log('Resposta efêmera enviada para remover cliente.');
        return;
      } catch (error) {
        console.error('Erro ao processar modal_remover_cliente:', error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '❌ Ocorreu um erro ao remover o cliente.', flags: 64 });
        }
        console.error('Erro capturado no handler de modal remover cliente.');
        return;
      }
    }

    if (customId === 'modal_editar_cliente') {
      try {
        // Adiar a resposta imediatamente para evitar timeout
        await interaction.deferReply({ flags: 64 });
        
        console.log('Modal Editar Cliente submetido.');
        const postal = interaction.fields.getTextInputValue('postal');
        const nome = interaction.fields.getTextInputValue('nome');
        const empresa = interaction.fields.getTextInputValue('empresa');
        const cidade = interaction.fields.getTextInputValue('cidade');
        console.log(`Postal: ${postal}, Novo Nome: ${nome}, Nova Empresa: ${empresa}, Nova Cidade: ${cidade}`);

        if (!clients.has(postal)) {
          await interaction.editReply({ content: `❌ Cliente com número (postal) ${postal} não encontrado.` });
          console.log(`Cliente com postal ${postal} não encontrado para edição.`);
          return;
        }

        const clienteAntigo = clients.get(postal);
        clients.set(postal, { cliente: nome, empresa, cidade, postal });
        saveClients();
        console.log('Clientes salvos após edição.');
        await atualizarClientesChannel(client);
        console.log('Canal de clientes atualizado após edição.');

        await interaction.editReply({
          content: `✅ Cliente atualizado com sucesso!\n\n**Antes:**\nNome: ${clienteAntigo.cliente}\nEmpresa: ${clienteAntigo.empresa}\nCidade: ${clienteAntigo.cidade}\n\n**Depois:**\nNome: ${nome}\nEmpresa: ${empresa}\nCidade: ${cidade}`
        });
        console.log('Resposta efêmera enviada para editar cliente.');
        return;
      } catch (error) {
        console.error('Erro ao processar modal_editar_cliente:', error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '❌ Ocorreu um erro ao editar o cliente.', flags: 64 });
        } else {
          await interaction.editReply({ content: '❌ Ocorreu um erro ao editar o cliente.' });
        }
        console.error('Erro capturado no handler de modal editar cliente.');
        return;
      }
    }

    if (customId === 'modal_add_produto') {
      try {
        console.log('Modal Adicionar Produto submetido.');
        const categoria = interaction.fields.getTextInputValue('categoria').toUpperCase();
        const nome = interaction.fields.getTextInputValue('nome').toUpperCase();
        const preco = parseFloat(interaction.fields.getTextInputValue('preco').replace(',', '.'));
        console.log(`Categoria: ${categoria}, Nome: ${nome}, Preço: ${preco}`);

        if (isNaN(preco) || preco <= 0) {
          await interaction.reply({
            content: '❌ Preço inválido!',
            flags: 64
          });
          console.log('Preço inválido para adicionar produto.');
          return;
        }

        if (!productsData[categoria]) {
           await interaction.reply({ // Responde efêmero se a categoria não existe
             content: '❌ Esta categoria não existe! Crie-a primeiro usando o botão "Adicionar Categoria".',
             flags: 64
           });
           console.log(`Categoria ${categoria} não existe para adicionar produto.`);
           return;
         }

        if (productsData[categoria][nome]) {
          await interaction.reply({
            content: '❌ Este produto já existe nesta categoria!',
            flags: 64
          });
          console.log(`Produto ${nome} já existe na categoria ${categoria}.`);
          return;
        }

        productsData[categoria][nome] = preco;
        saveProducts(productsData);
        console.log('Produtos salvos após adicionar.');
        await atualizarProdutosChannel(client);
        console.log('Canal de produtos atualizado após adicionar.');

        await interaction.reply({
          content: `✅ Produto "${nome}" adicionado com sucesso na categoria "${categoria}"!`,
          flags: 64
        });
        console.log('Resposta efêmera enviada para adicionar produto.');
        return;
      } catch (error) {
        console.error('Erro ao processar modal_add_produto:', error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '❌ Ocorreu um erro ao adicionar o produto.', flags: 64 });
        }
        console.error('Erro capturado no handler de modal adicionar produto.');
        return;
      }
    }

    if (customId === 'modal_edit_produto') {
      try {
        console.log('Modal Editar Produto submetido.');
        const categoria = interaction.fields.getTextInputValue('categoria').toUpperCase();
        const nome = interaction.fields.getTextInputValue('nome').toUpperCase();
        const preco = parseFloat(interaction.fields.getTextInputValue('preco').replace(',', '.'));
        console.log(`Categoria: ${categoria}, Nome: ${nome}, Novo Preço: ${preco}`);

        if (isNaN(preco) || preco <= 0) {
          await interaction.reply({
            content: '❌ Preço inválido!',
            flags: 64
          });
          console.log('Preço inválido para editar produto.');
          return;
        }

        if (!productsData[categoria] || !productsData[categoria][nome]) {
          await interaction.reply({
            content: '❌ Produto não encontrado!',
            flags: 64
          });
          console.log(`Produto ${nome} na categoria ${categoria} não encontrado para edição.`);
          return;
        }

        productsData[categoria][nome] = preco;
        saveProducts(productsData);
        console.log('Produtos salvos após edição.');
        await atualizarProdutosChannel(client);
        console.log('Canal de produtos atualizado após edição.');

        await interaction.reply({
          content: `✅ Preço do produto "${nome}" atualizado para $${preco.toFixed(2).replace('.',',')}!`, // Formatando preço na resposta
          flags: 64
        });
        console.log('Resposta efêmera enviada para editar produto.');
        return;
      } catch (error) {
        console.error('Erro ao processar modal_edit_produto:', error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '❌ Ocorreu um erro ao editar o produto.', flags: 64 });
        }
        console.error('Erro capturado no handler de modal editar produto.');
        return;
      }
    }

    if (customId === 'modal_add_categoria') {
      try {
        console.log('Modal Adicionar Categoria submetido.');
        const categoria = interaction.fields.getTextInputValue('categoria').toUpperCase();
        console.log(`Nova Categoria: ${categoria}`);

        if (productsData[categoria]) {
          await interaction.reply({
            content: '❌ Esta categoria já existe!',
            flags: 64
          });
          console.log(`Categoria ${categoria} já existe.`);
          return;
        }

        productsData[categoria] = {};
        saveProducts(productsData);
        console.log('Produtos salvos após adicionar categoria.');
        await atualizarProdutosChannel(client);
        console.log('Canal de produtos atualizado após adicionar categoria.');

        await interaction.reply({
          content: `✅ Categoria "${categoria}" criada com sucesso!`,
          flags: 64
        });
        console.log('Resposta efêmera enviada para adicionar categoria.');
        return;
      } catch (error) {
        console.error('Erro ao processar modal_add_categoria:', error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '❌ Ocorreu um erro ao adicionar a categoria.', flags: 64 });
        }
        console.error('Erro capturado no handler de modal adicionar categoria.');
        return;
      }
    }

    if (customId === 'modal_remove_produto') {
      try {
        console.log('Modal Remover Produto submetido.');
        const categoria = interaction.fields.getTextInputValue('categoria').toUpperCase();
        const nome = interaction.fields.getTextInputValue('nome').toUpperCase();
        console.log(`Categoria: ${categoria}, Nome: ${nome}`);

        if (!productsData[categoria]) {
          await interaction.reply({
            content: '❌ Esta categoria não existe!',
            flags: 64
          });
          console.log(`Categoria ${categoria} não existe para remover produto.`);
          return;
        }

        if (!productsData[categoria][nome]) {
          await interaction.reply({
            content: '❌ Este produto não existe nesta categoria!',
            flags: 64
          });
          console.log(`Produto ${nome} não existe na categoria ${categoria}.`);
          return;
        }

        const preco = productsData[categoria][nome];
        delete productsData[categoria][nome];
        saveProducts(productsData);
        console.log('Produtos salvos após remover produto.');
        await atualizarProdutosChannel(client);
        console.log('Canal de produtos atualizado após remover produto.');

        await interaction.reply({
          content: `✅ Produto "${nome}" (R$ ${preco.toFixed(2).replace('.', ',')}) removido com sucesso da categoria "${categoria}"!`,
          flags: 64
        });
        console.log('Resposta efêmera enviada para remover produto.');
        return;
      } catch (error) {
        console.error('Erro ao processar modal_remove_produto:', error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '❌ Ocorreu um erro ao remover o produto.', flags: 64 });
        }
        console.error('Erro capturado no handler de modal remover produto.');
        return;
      }
    }

    if (customId === 'modal_remove_categoria') {
      try {
        console.log('Modal Remover Categoria submetido.');
        const categoria = interaction.fields.getTextInputValue('categoria').toUpperCase();
        console.log(`Categoria para remover: ${categoria}`);

        if (!productsData[categoria]) {
          await interaction.reply({
            content: '❌ Esta categoria não existe!',
            flags: 64
          });
          console.log(`Categoria ${categoria} não existe para remover.`);
          return;
        }

        const produtosNaCategoria = Object.keys(productsData[categoria]).length;
        if (produtosNaCategoria > 0) {
          // Remover todos os produtos da categoria
          delete productsData[categoria];
          saveProducts(productsData);
          console.log('Produtos salvos após remover categoria.');
          await atualizarProdutosChannel(client);
          console.log('Canal de produtos atualizado após remover categoria.');

          await interaction.reply({
            content: `✅ Categoria "${categoria}" e seus ${produtosNaCategoria} produto(s) foram removidos com sucesso!`,
            flags: 64
          });
          console.log('Resposta efêmera enviada para remover categoria.');
          return;
        }

        delete productsData[categoria];
        saveProducts(productsData);
        console.log('Produtos salvos após remover categoria.');
        await atualizarProdutosChannel(client);
        console.log('Canal de produtos atualizado após remover categoria.');

        await interaction.reply({
          content: `✅ Categoria "${categoria}" removida com sucesso!`,
          flags: 64
        });
        console.log('Resposta efêmera enviada para remover categoria.');
        return;
      } catch (error) {
        console.error('Erro ao processar modal_remove_categoria:', error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '❌ Ocorreu um erro ao remover a categoria.', flags: 64 });
        }
        console.error('Erro capturado no handler de modal remover categoria.');
        return;
      }
    }

    if (customId === 'modal_usar_cliente') {
      const order = orders.get(orderId);
      if (!order) return interaction.reply({ content: '❌ Encomenda não encontrada.', flags: 64 });

      const postal = interaction.fields.getTextInputValue('postal_cliente');
      const clienteEncontrado = clients.get(postal);

      if (!clienteEncontrado) {
        // Responder efêmero ao modal submit
        await interaction.reply({ content: `❌ Nenhum cliente encontrado com o postal ${postal}.`, flags: 64 });
        return; // Encerrar o handler
      }

      order.cliente = clienteEncontrado.cliente;
      order.postal = clienteEncontrado.postal;
      order.empresa = clienteEncontrado.empresa;
      order.cidade = clienteEncontrado.cidade;

      saveClients(); // Salvar cliente atualizado (caso tenha mudado algo)
      saveOrders(); // Salvar encomenda com dados do cliente

      const embed = generateOrderEmbed(order.id, order);
      // Atualiza a mensagem com os dados do cliente preenchidos
      // Responder efêmero à submissão do modal e depois atualizar a mensagem original
      await interaction.reply({ content: '✅ Dados do cliente preenchidos.', flags: 64 });
       // Encontrar a mensagem da encomenda original para atualizar
       const originalMessage = await interaction.channel.messages.fetch(interaction.message.id);
       await originalMessage.edit({
           embeds: [embed],
           components: [
               ...buildProductSelectors(order.id, order.selectedCategoria, order.selectedProduto),
               ...buildItemControls(order.id, order)
           ]
       });
       return; // Encerrar o handler
    }

    if (customId === 'modal_quantidade') {
      const order = orders.get(orderId);
      if (!order || !order.selected) {
         await interaction.reply({ content: '❌ Encomenda ou item não encontrado.', flags: 64 });
         return;
      }

      const quantidade = parseInt(interaction.fields.getTextInputValue('nova_quantidade'));
      if (!isNaN(quantidade) && quantidade >= 0) { // Quantidade pode ser 0 para remover o item
        const item = order.selected;
         if (quantidade === 0) {
             delete order.items[item];
             order.selected = null;
             order.selectedProduto = null;
         } else {
            order.items[item].quantidade = quantidade;
            order.items[item].produzido = Math.min(order.items[item].produzido, quantidade);
         }
        saveOrders();
        const embed = generateOrderEmbed(order.id, order);
        // Atualizar a mensagem original usando interaction.update
        return await interaction.update({
            content: '✅ Quantidade atualizada.',
            embeds: [embed],
            components: limitComponents([...buildProductSelectors(order.id, order.selectedCategoria, order.selectedProduto), ...buildItemControls(order.id, order)])
        });
      } else { // Responder se a quantidade for inválida
         await interaction.reply({ content: '❌ Quantidade inválida. Insira um número maior ou igual a zero.', flags: 64 });
         return; // Encerrar o handler
      }
    }


    if (customId === 'modal_diminuir') {
      const order = orders.get(orderId);
      if (!order || !order.selected) {
          await interaction.reply({ content: '❌ Encomenda ou item não encontrado.', flags: 64 });
          return;
      }

      const diminuir = parseInt(interaction.fields.getTextInputValue('novo_diminuir'));
      if (!isNaN(diminuir) && diminuir > 0) {
        const item = order.selected;
        const novaQuantidade = Math.max(0, (order.items[item]?.quantidade || 0) - diminuir); // Usar 0 se quantidade for undefined
        if (novaQuantidade === 0) {
            delete order.items[item];
            order.selected = null;
            order.selectedProduto = null;
        } else {
           order.items[item].quantidade = novaQuantidade;
           order.items[item].produzido = Math.min(order.items[item].produzido, novaQuantidade);
        }
        saveOrders();
        const embed = generateOrderEmbed(order.id, order);
         await interaction.reply({ content: '✅ Quantidade diminuída.', flags: 64 }); // Resposta efêmera
          // Encontrar a mensagem da encomenda original para atualizar
          const originalMessage = await interaction.channel.messages.fetch(interaction.message.id);
          await originalMessage.edit({
              embeds: [embed],
              components: limitComponents([...buildProductSelectors(order.id, order.selectedCategoria, order.selectedProduto), ...buildItemControls(order.id, order)])
          });
         return;
      } else { // Responder se a quantidade for inválida
        await interaction.reply({ content: '❌ Quantidade a diminuir inválida. Insira um número maior que zero.', flags: 64 });
        return; // Encerrar o handler
      }
    }


    if (customId === 'modal_produzido') {
      const order = orders.get(orderId);
      if (!order || !order.selected) {
          await interaction.reply({ content: '❌ Encomenda ou item não encontrado.', flags: 64 });
          return;
      }

      const produzido = parseInt(interaction.fields.getTextInputValue('novo_produzido'));
      if (!isNaN(produzido) && produzido >= 0) {
        const item = order.selected;
        const max = order.items[item]?.quantidade || 0; // Usar 0 se quantidade for undefined
        // Garante que a quantidade produzida não exceda a quantidade total
        order.items[item].produzido = Math.min(produzido, max);
        saveOrders();
        const embed = generateOrderEmbed(order.id, order);
         await interaction.reply({ content: '✅ Produção registrada.', flags: 64 }); // Resposta efêmera
        // Encontrar a mensagem da encomenda original para atualizar
        const originalMessage = await interaction.channel.messages.fetch(interaction.message.id);
        await originalMessage.edit({
            embeds: [embed],
            components: limitComponents([...buildProductSelectors(order.id, order.selectedCategoria, order.selectedProduto), ...buildItemControls(order.id, order)])
        });
        return;
      } else { // Responder se a quantidade for inválida
         await interaction.reply({ content: '❌ Quantidade produzida inválida. Insira um número maior ou igual a zero.', flags: 64 });
         return; // Encerrar o handler
      }
    }

    if (customId === 'formulario_cliente') {
      const order = orders.get(orderId);
      if (!order) {
        await interaction.reply({ content: '❌ Encomenda não encontrada.', flags: 64 });
        return;
      }
      order.cliente = interaction.fields.getTextInputValue('cliente');
      order.postal = interaction.fields.getTextInputValue('postal');
      order.empresa = interaction.fields.getTextInputValue('empresa');
      order.cidade = interaction.fields.getTextInputValue('cidade');
      order.obs = interaction.fields.getTextInputValue('obs');
      saveOrders();
      const embed = generateOrderEmbed(order.id, order);
      // Use interaction.update para modificar a mensagem original da encomenda
      return await interaction.update({ embeds: [embed], components: limitComponents([...buildProductSelectors(orderId, order.selectedCategoria, order.selectedProduto), ...buildItemControls(orderId, order)]) });
    }

    if (customId === 'editar_obs_modal') {
      const order = orders.get(orderId);
      if (!order) {
        await interaction.reply({ content: '❌ Encomenda não encontrada.', flags: 64 });
        return;
      }
      const novaObs = interaction.fields.getTextInputValue('nova_obs');
      order.obs = novaObs;
      saveOrders();
      const embed = generateOrderEmbed(order.id, order);
      // Use interaction.update para modificar a mensagem original da encomenda
      return await interaction.update({ embeds: [embed], components: limitComponents([...buildProductSelectors(orderId, order.selectedCategoria, order.selectedProduto), ...buildItemControls(orderId, order)]) });
    }
  }

  // Handler para seleção de menu (removido duplicado abaixo)
  if (interaction.isStringSelectMenu()) {
    const [action, orderId] = interaction.customId.split('|');
    const order = orders.get(orderId);

    if (!order) return;

    if (action === 'selecionar_categoria') {
      const categoria = interaction.values[0];
      if (categoria === 'none') {
          order.selectedCategoria = null;
          order.selectedProduto = null;
          order.selected = null; // Limpa a seleção do item
           // Atualiza a mensagem com os seletores resetados
          const embed = generateOrderEmbed(orderId, order);
          return interaction.update({
             embeds: [embed],
             components: limitComponents([...buildProductSelectors(orderId, null, null), ...buildItemControls(orderId, order)])
           });
      }

      // Se a categoria mudou, limpa o produto selecionado
      if (order.selectedCategoria !== categoria) {
        order.selectedProduto = null;
        order.selected = null; // Limpa a seleção do item
      }
      order.selectedCategoria = categoria;
      saveOrders(); // Salva a mudança de categoria e item selecionado

      const embed = generateOrderEmbed(orderId, order);
      return interaction.update({
        embeds: [embed],
        components: limitComponents([...buildProductSelectors(orderId, categoria, order.selectedProduto), ...buildItemControls(orderId, order)])
      });
    }

    if (action === 'selecionar_produto') {
      const produto = interaction.values[0];
      if (produto === 'none') {
          order.selectedProduto = null;
          order.selected = null; // Limpa a seleção do item
          saveOrders(); // Salva a remoção do produto
          const embed = generateOrderEmbed(orderId, order);
          return interaction.update({
            embeds: [embed],
             components: limitComponents([...buildProductSelectors(orderId, order.selectedCategoria, null), ...buildItemControls(orderId, order)])
           });
      }

      if (!order.items[produto]) {
        order.items[produto] = { quantidade: 1, produzido: 0 };
      }
      order.selected = produto;
      order.selectedProduto = produto;
      saveOrders();

      const embed = generateOrderEmbed(orderId, order);
      return interaction.update({
        embeds: [embed],
        components: limitComponents([...buildProductSelectors(orderId, order.selectedCategoria, produto), ...buildItemControls(orderId, order)])
      });
    }
  }

  // Handler para modais - Já incluídos acima para melhor organização
  /*
  if (interaction.isModalSubmit()) {
     // ... handlers de modal submissão ...
  }
  */
});


// Helpers
function generateOrderEmbed(id, order) {
  const total = Object.entries(order.items).reduce((sum, [item, data]) => {
    let preco = 0;
    for (const categoria in productsData) {
      if (productsData[categoria] && productsData[categoria][item]) { // Verifica se categoria e item existem
        preco = parseFloat(productsData[categoria][item]) || 0;
        break;
      }
    }
    return sum + (preco * data.quantidade);
  }, 0).toFixed(2);

  const itemLines = Object.entries(order.items)
    .map(([item, data]) => {
      let preco = 0;
      for (const categoria in productsData) {
        if (productsData[categoria] && productsData[categoria][item]) { // Verifica se categoria e item existem
          preco = parseFloat(productsData[categoria][item]) || 0;
          break;
        }
      }
      const status = data.produzido >= data.quantidade ? "✅" : "❌";
      return `• ${data.quantidade}x ${item} ($${preco.toFixed(2).replace('.', ',')}) - ${data.produzido}/${data.quantidade} ${status}`;
    })
    .join("\n");

  return new EmbedBuilder()
    .setTitle(`🔔 NOVA ENCOMENDA - ${new Date().toLocaleDateString("pt-BR")}`)
    .setColor("Green")
    .addFields(
      { name: "📄 Informações do Cliente", value: `**Cliente:** ${order.cliente || "-"}\n**Postal:** ${order.postal || "-"}\n**Empresa:** ${order.empresa || "-"}\n**Cidade:** ${order.cidade || "-"}\n**Observações:** ${order.obs || "-"}` },
      { name: "👤 Criado por:", value: `<@${order.userId}>` },
      { name: "📦 Pedido:", value: itemLines || "Nenhum item adicionado." },
      { name: "💰 VALOR TOTAL:", value: `$${total.replace('.',',')}` } // Formata total com vírgula
    );
}


function buildProductSelectors(orderId, selectedCategoria = null, selectedProduto = null, produtoPage = 1) {
  const categorias = Object.keys(productsData);

  const categoriaOptions = categorias.map(cat => ({
      label: cat,
      value: cat,
      description: `${Object.keys(productsData[cat]).length} produtos nesta categoria`,
      default: cat === selectedCategoria
  }));

  // Adiciona opção "Nenhum" para limpar a seleção de categoria
  categoriaOptions.unshift({
      label: 'Limpar Categoria',
      value: 'none',
      description: 'Limpa a seleção de categoria e produto'
  });


  const categoriaRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`selecionar_categoria|${orderId}`)
      .setPlaceholder(selectedCategoria || "Selecione uma categoria")
      .addOptions(categoriaOptions)
  );

  let produtoRow;
  if (selectedCategoria && productsData[selectedCategoria]) {
    const produtosNaCategoria = Object.keys(productsData[selectedCategoria]);
    const maxOptionsPerPage = 24; // Limite de 24 + 1 opção "Nenhum" = 25 total
    
    // Calcular paginação
    const totalPages = Math.ceil(produtosNaCategoria.length / maxOptionsPerPage);
    const startIndex = (produtoPage - 1) * maxOptionsPerPage;
    const endIndex = Math.min(startIndex + maxOptionsPerPage, produtosNaCategoria.length);
    const produtosNaPagina = produtosNaCategoria.slice(startIndex, endIndex);
    
    const produtoOptions = produtosNaPagina.map(prod => ({
        label: prod,
        value: prod,
        description: `$${parseFloat(productsData[selectedCategoria][prod]).toFixed(2).replace('.', ',')}`, // Garantir que preco é número
        default: prod === selectedProduto
    }));

    // Adiciona opção "Nenhum" para limpar a seleção de produto
     produtoOptions.unshift({
        label: 'Remover Produto',
        value: 'none',
        description: 'Remove o produto selecionado do pedido'
    });

    produtoRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`selecionar_produto|${orderId}`)
        .setPlaceholder(selectedProduto || `Selecione um produto (Página ${produtoPage}/${totalPages})`)
        .setDisabled(false)
        .addOptions(produtoOptions)
    );
  } else {
    produtoRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`selecionar_produto|${orderId}`)
        .setPlaceholder("Selecione uma categoria primeiro")
        .setDisabled(true)
        .addOptions([
          { label: 'Nenhum', value: 'none' }
        ])
    );
  }

  const components = [categoriaRow];
  if (produtoRow) {
    components.push(produtoRow);
    
    // Adicionar botões de navegação se há múltiplas páginas de produtos
    if (selectedCategoria && productsData[selectedCategoria]) {
      const produtosNaCategoria = Object.keys(productsData[selectedCategoria]);
      const maxOptionsPerPage = 24;
      const totalPages = Math.ceil(produtosNaCategoria.length / maxOptionsPerPage);
      
      if (totalPages > 1) {
        const paginationRow = new ActionRowBuilder();
        
        // Botão página anterior
        if (produtoPage > 1) {
          paginationRow.addComponents(
            new ButtonBuilder()
              .setCustomId(`produto_page_${orderId}_${produtoPage - 1}`)
              .setLabel('⬅️ Página Anterior')
              .setStyle(ButtonStyle.Secondary)
          );
        }
        
        // Botão próxima página
        if (produtoPage < totalPages) {
          paginationRow.addComponents(
            new ButtonBuilder()
              .setCustomId(`produto_page_${orderId}_${produtoPage + 1}`)
              .setLabel('Próxima Página ➡️')
              .setStyle(ButtonStyle.Secondary)
          );
        }
        
        components.push(paginationRow);
      }
    }
  }
  return components;
}

function buildItemControls(orderId, order) {
  const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
      .setCustomId(`aumentar|${orderId}`)
      .setLabel('➕')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!order || !order.selected),
      new ButtonBuilder()
      .setCustomId(`diminuir|${orderId}`)
      .setLabel('➖')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!order || !order.selected || (order.items[order.selected]?.quantidade || 0) <= 1), // Desabilitar se quantidade for 1 ou menos
      new ButtonBuilder()
      .setCustomId(`produzir|${orderId}`)
      .setLabel('✅ Produzido')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!order || !order.selected || (order.items[order.selected]?.produzido || 0) >= (order.items[order.selected]?.quantidade || 0)), // Desabilitar se já produzido
      new ButtonBuilder()
      .setCustomId(`remover_item|${orderId}`)
      .setLabel('❌ Remover Item')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!order || !order.selected)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`atualizar|${orderId}`)
        .setLabel('🔄 Atualizar')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`preencher_dados|${orderId}`)
      .setLabel('📝 Dados Cliente')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`usar_cliente|${orderId}`)
      .setLabel('📋 Usar Cliente')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`editar_obs|${orderId}`)
      .setLabel('🗒️ Editar Observações')
        .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`finalizar|${orderId}`)
      .setLabel('✅ Finalizar Encomenda')
      .setStyle(ButtonStyle.Success)
  );

  return [row1, row2];
}

// Função para limitar componentes ao máximo de 5 ActionRows do Discord
function limitComponents(components) {
  return components.slice(0, 5);
}

async function atualizarEncomendasChannel(client) {
  try {
    console.log('Iniciando atualização do canal de encomendas...');
    const channel = await client.channels.fetch(START_CHANNEL_ID);
    if (!channel) {
      console.error('Canal de encomendas não encontrado. ID:', START_CHANNEL_ID);
      return;
    }
    console.log('Canal encontrado:', channel.name);

    const embed = new EmbedBuilder()
      .setTitle('📦 Sistema de Encomendas')
      .setDescription('Use o botão abaixo para criar uma nova encomenda\n\n📄 **Como usar:**\n1. Clique no botão "Nova Encomenda"\n2. Preencha os dados do cliente\n3. Selecione os produtos desejados\n4. Ajuste as quantidades\n5. Finalize a encomenda')
      .setColor('Blue');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_nova_encomenda')
        .setLabel('📦 Nova Encomenda')
        .setStyle(ButtonStyle.Primary)
    );

    console.log('Verificando mensagem existente...');
    if (orderMessageId) {
      try {
        console.log('Tentando buscar mensagem existente:', orderMessageId);
        const message = await channel.messages.fetch(orderMessageId);
        console.log('Mensagem encontrada, atualizando...');
        await message.edit({ embeds: [embed], components: [row] });
        console.log('Mensagem atualizada com sucesso');
      } catch (error) {
        console.error('Erro ao buscar/atualizar mensagem existente:', error);
        console.log('Criando nova mensagem...');
        const newMessage = await channel.send({ embeds: [embed], components: [row] });
        console.log('Nova mensagem criada:', newMessage.id);
        saveOrderMessageId(newMessage.id);
        orderMessageId = newMessage.id;
      }
    } else {
      console.log('Nenhuma mensagem existente, criando nova...');
      const newMessage = await channel.send({ embeds: [embed], components: [row] });
      console.log('Nova mensagem criada:', newMessage.id);
      saveOrderMessageId(newMessage.id);
      orderMessageId = newMessage.id;
    }
    console.log('Atualização do canal de encomendas concluída com sucesso');
  } catch (error) {
    console.error('Erro ao atualizar canal de encomendas:', error);
  }
}

// Função para atualizar a embed de estoque
async function atualizarEstoqueChannel(client) {
    try {
        const channel = await client.channels.fetch(CHANNEL_ESTOQUE);
        if (!channel) {
            console.error('Canal de estoque não encontrado');
            return;
        }

        const stockData = JSON.parse(fs.readFileSync('./stock.json', 'utf8'));
        const embed = new EmbedBuilder()
            .setTitle('📦 Controle de Estoque')
            .setColor('#FFD700')
            .setDescription('Clique nos botões abaixo para gerenciar o estoque dos produtos')
            .setTimestamp();

        // Adiciona cada categoria e seus produtos
        for (const [category, products] of Object.entries(stockData)) {
            let categoryText = `**${category}**\n`;
            
            for (const [product, quantity] of Object.entries(products)) {
                categoryText += `• ${product}: ${quantity} unidades\n`;
            }
            
            embed.addFields({ name: '\u200B', value: categoryText });
        }

        // Primeira camada - Gerenciamento de Estoque
        const row1 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('btn_add_stock')
                    .setLabel('➕ Adicionar ao Estoque')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('btn_remove_stock')
                    .setLabel('➖ Remover do Estoque')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('btn_atualizar_estoque')
                    .setLabel('🔄 Atualizar')
                    .setStyle(ButtonStyle.Secondary)
            );

        // Segunda camada - Gerenciamento de Categorias
        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('btn_add_category')
                    .setLabel('📁 Adicionar Categoria')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('btn_add_item_to_category')
                    .setLabel('📦 Adicionar Item à Categoria')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('btn_add_item_sem_categoria')
                    .setLabel('📦 Adicionar Item sem categoria')
                    .setStyle(ButtonStyle.Secondary)
            );

        // Terceira camada - Gerenciamento de Itens
        const row3 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('btn_remove_category')
                    .setLabel('🗑️ Remover Categoria')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('btn_remove_item_from_category')
                    .setLabel('🗑️ Remover Item da Categoria')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('btn_remove_item_no_category')
                    .setLabel('🗑️ Remover Item sem categoria')
                    .setStyle(ButtonStyle.Danger)
            );

        const messages = await channel.messages.fetch({ limit: 10 });
        const botMessage = messages.find(msg => msg.author.id === client.user.id);

        if (botMessage) {
            await botMessage.edit({ embeds: [embed], components: [row1, row2, row3] });
            stockMessage = botMessage;
        } else {
            stockMessage = await channel.send({ embeds: [embed], components: [row1, row2, row3] });
        }
    } catch (error) {
        console.error('Erro ao atualizar canal de estoque:', error);
    }
}

// Adiciona os handlers de botões de estoque
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'btn_add_stock') {
        const modal = new ModalBuilder()
            .setCustomId('modal_add_stock')
            .setTitle('Adicionar ao Estoque');

        const categoryInput = new TextInputBuilder()
            .setCustomId('category')
            .setLabel('Categoria')
            .setPlaceholder('Digite a categoria do produto')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const productInput = new TextInputBuilder()
            .setCustomId('product')
            .setLabel('Produto')
            .setPlaceholder('Digite o nome do produto')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const quantityInput = new TextInputBuilder()
            .setCustomId('quantity')
            .setLabel('Quantidade')
            .setPlaceholder('Digite a quantidade a adicionar')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(categoryInput),
            new ActionRowBuilder().addComponents(productInput),
            new ActionRowBuilder().addComponents(quantityInput)
        );

        await interaction.showModal(modal);
    }
    else if (interaction.customId === 'btn_remove_stock') {
        const modal = new ModalBuilder()
            .setCustomId('modal_remove_stock')
            .setTitle('Remover do Estoque');

        const categoryInput = new TextInputBuilder()
            .setCustomId('category')
            .setLabel('Categoria')
            .setPlaceholder('Digite a categoria do produto')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const productInput = new TextInputBuilder()
            .setCustomId('product')
            .setLabel('Produto')
            .setPlaceholder('Digite o nome do produto')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const quantityInput = new TextInputBuilder()
            .setCustomId('quantity')
            .setLabel('Quantidade')
            .setPlaceholder('Digite a quantidade a remover')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(categoryInput),
            new ActionRowBuilder().addComponents(productInput),
            new ActionRowBuilder().addComponents(quantityInput)
        );

        await interaction.showModal(modal);
    }
    else if (interaction.customId === 'btn_add_category') {
        const modal = new ModalBuilder()
            .setCustomId('modal_add_stock_category')
            .setTitle('Adicionar Categoria');

        const categoryInput = new TextInputBuilder()
            .setCustomId('category')
            .setLabel('Nome da Categoria')
            .setPlaceholder('Digite o nome da categoria')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(categoryInput)
        );

        await interaction.showModal(modal);
    }
    else if (interaction.customId === 'btn_add_item_no_category') {
        const modal = new ModalBuilder()
            .setCustomId('modal_add_item_no_category')
            .setTitle('Adicionar Item sem categoria');

        const productInput = new TextInputBuilder()
            .setCustomId('product')
            .setLabel('Produto')
            .setPlaceholder('Digite o nome do produto')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const quantityInput = new TextInputBuilder()
            .setCustomId('quantity')
            .setLabel('Quantidade')
            .setPlaceholder('Digite a quantidade inicial')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(productInput),
            new ActionRowBuilder().addComponents(quantityInput)
        );

        await interaction.showModal(modal);
    }
    else if (interaction.customId === 'btn_atualizar_estoque') {
        await atualizarEstoqueChannel(client);
        await interaction.reply({ content: '✅ Estoque atualizado!', flags: 64 });
    }
    else if (interaction.customId === 'btn_remove_category') {
        const modal = new ModalBuilder()
            .setCustomId('modal_remove_stock_category')
            .setTitle('Remover Categoria');

        const categoryInput = new TextInputBuilder()
            .setCustomId('category')
            .setLabel('Nome da Categoria')
            .setPlaceholder('Digite o nome da categoria para remover')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(categoryInput)
        );

        await interaction.showModal(modal);
    }
    else if (interaction.customId === 'btn_add_item_to_category') {
        const modal = new ModalBuilder()
            .setCustomId('modal_add_item_to_category')
            .setTitle('Adicionar Item à Categoria');

        const categoryInput = new TextInputBuilder()
            .setCustomId('category')
            .setLabel('Categoria')
            .setPlaceholder('Digite o nome da categoria')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const productInput = new TextInputBuilder()
            .setCustomId('product')
            .setLabel('Produto')
            .setPlaceholder('Digite o nome do produto')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const quantityInput = new TextInputBuilder()
            .setCustomId('quantity')
            .setLabel('Quantidade Inicial')
            .setPlaceholder('Digite a quantidade inicial')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(categoryInput),
            new ActionRowBuilder().addComponents(productInput),
            new ActionRowBuilder().addComponents(quantityInput)
        );

        await interaction.showModal(modal);
    }
    else if (interaction.customId === 'btn_remove_item_no_category') {
        const modal = new ModalBuilder()
            .setCustomId('modal_remove_item_no_category')
            .setTitle('Remover Item sem categoria');

        const productInput = new TextInputBuilder()
            .setCustomId('product')
            .setLabel('Produto')
            .setPlaceholder('Digite o nome do produto para remover')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(productInput)
        );

        await interaction.showModal(modal);
    }
    else if (interaction.customId === 'btn_remove_item_from_category') {
        const modal = new ModalBuilder()
            .setCustomId('modal_remove_item_from_category')
            .setTitle('Remover Item da Categoria');

        const categoryInput = new TextInputBuilder()
            .setCustomId('category')
            .setLabel('Categoria')
            .setPlaceholder('Digite o nome da categoria')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const productInput = new TextInputBuilder()
            .setCustomId('product')
            .setLabel('Produto')
            .setPlaceholder('Digite o nome do produto para remover')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(categoryInput),
            new ActionRowBuilder().addComponents(productInput)
        );

        await interaction.showModal(modal);
    }
});

// Adiciona o handler de modais de estoque
client.on('interactionCreate', async interaction => {
    if (!interaction.isModalSubmit()) return;

    if (interaction.customId === 'modal_add_stock' || interaction.customId === 'modal_remove_stock') {
        const category = interaction.fields.getTextInputValue('category');
        const product = interaction.fields.getTextInputValue('product');
        const quantity = parseInt(interaction.fields.getTextInputValue('quantity'));

        if (isNaN(quantity) || quantity <= 0) {
            return interaction.reply({
                content: '❌ Por favor, insira uma quantidade válida maior que zero.',
                flags: 64
            });
        }

        const stockData = JSON.parse(fs.readFileSync('./stock.json', 'utf8'));

        if (!stockData[category] || !stockData[category][product]) {
            return interaction.reply({
                content: '❌ Categoria ou produto não encontrado.',
                flags: 64
            });
        }

        if (interaction.customId === 'modal_add_stock') {
            stockData[category][product] += quantity;
        } else {
            if (stockData[category][product] < quantity) {
                return interaction.reply({
                    content: '❌ Quantidade insuficiente em estoque.',
                    flags: 64
                });
            }
            stockData[category][product] -= quantity;
        }

        fs.writeFileSync('./stock.json', JSON.stringify(stockData, null, 2));

        interaction.reply({
            content: `✅ Estoque ${interaction.customId === 'modal_add_stock' ? 'adicionado' : 'removido'} com sucesso!`,
            flags: 64
        });

        await atualizarEstoqueChannel(client);
    }
    else if (interaction.customId === 'modal_add_stock_category') {
        const category = interaction.fields.getTextInputValue('category');
        const stockData = JSON.parse(fs.readFileSync('./stock.json', 'utf8'));

        if (stockData[category]) {
            return interaction.reply({
                content: '❌ Esta categoria já existe.',
                flags: 64
            });
        }

        stockData[category] = {};
        fs.writeFileSync('./stock.json', JSON.stringify(stockData, null, 2));

        interaction.reply({
            content: `✅ Categoria "${category}" adicionada com sucesso!`,
            flags: 64
        });

        await atualizarEstoqueChannel(client);
    }
    else if (interaction.customId === 'modal_add_item_no_category') {
        const product = interaction.fields.getTextInputValue('product');
        const quantity = parseInt(interaction.fields.getTextInputValue('quantity'));

        if (isNaN(quantity) || quantity <= 0) {
            return interaction.reply({
                content: '❌ Por favor, insira uma quantidade válida maior que zero.',
                flags: 64
            });
        }

        const stockData = JSON.parse(fs.readFileSync('./stock.json', 'utf8'));

        // Adiciona o item na categoria "Sem Categoria"
        if (!stockData['Sem Categoria']) {
            stockData['Sem Categoria'] = {};
        }

        if (stockData['Sem Categoria'][product]) {
            return interaction.reply({
                content: '❌ Este produto já existe na categoria "Sem Categoria".',
                flags: 64
            });
        }

        stockData['Sem Categoria'][product] = quantity;
        fs.writeFileSync('./stock.json', JSON.stringify(stockData, null, 2));

        interaction.reply({
            content: `✅ Produto "${product}" adicionado com sucesso na categoria "Sem Categoria"!`,
            flags: 64
        });

        await atualizarEstoqueChannel(client);
    }
    else if (interaction.customId === 'modal_remove_stock_category') {
        const category = interaction.fields.getTextInputValue('category');
        const stockData = JSON.parse(fs.readFileSync('./stock.json', 'utf8'));

        if (!stockData[category]) {
            return interaction.reply({
                content: '❌ Esta categoria não existe.',
                flags: 64
            });
        }

        // Conta quantos itens existem na categoria
        const itemCount = Object.keys(stockData[category]).length;

        // Remove a categoria e todos os seus itens
        delete stockData[category];
        fs.writeFileSync('./stock.json', JSON.stringify(stockData, null, 2));

        interaction.reply({
            content: `✅ Categoria "${category}" e seus ${itemCount} item(ns) foram removidos com sucesso!`,
            flags: 64
        });

        await atualizarEstoqueChannel(client);
    }
    else if (interaction.customId === 'modal_add_item_to_category') {
        const category = interaction.fields.getTextInputValue('category');
        const product = interaction.fields.getTextInputValue('product');
        const quantity = parseInt(interaction.fields.getTextInputValue('quantity'));

        if (isNaN(quantity) || quantity <= 0) {
            return interaction.reply({
                content: '❌ Por favor, insira uma quantidade válida maior que zero.',
                flags: 64
            });
        }

        const stockData = JSON.parse(fs.readFileSync('./stock.json', 'utf8'));

        if (!stockData[category]) {
            return interaction.reply({
                content: '❌ Esta categoria não existe. Crie-a primeiro usando o botão "Adicionar Categoria".',
                flags: 64
            });
        }

        if (stockData[category][product]) {
            return interaction.reply({
                content: '❌ Este produto já existe nesta categoria.',
                flags: 64
            });
        }

        stockData[category][product] = quantity;
        fs.writeFileSync('./stock.json', JSON.stringify(stockData, null, 2));

        interaction.reply({
            content: `✅ Produto "${product}" adicionado com sucesso na categoria "${category}"!`,
            flags: 64
        });

        await atualizarEstoqueChannel(client);
    }
    else if (interaction.customId === 'modal_remove_item_no_category') {
        const product = interaction.fields.getTextInputValue('product');
        const stockData = JSON.parse(fs.readFileSync('./stock.json', 'utf8'));

        if (!stockData['Sem Categoria'] || !stockData['Sem Categoria'][product]) {
            return interaction.reply({
                content: '❌ Este produto não existe na categoria "Sem Categoria".',
                flags: 64
            });
        }

        const quantity = stockData['Sem Categoria'][product];
        delete stockData['Sem Categoria'][product];
        fs.writeFileSync('./stock.json', JSON.stringify(stockData, null, 2));

        interaction.reply({
            content: `✅ Produto "${product}" (${quantity} unidades) foi removido com sucesso da categoria "Sem Categoria"!`,
            flags: 64
        });

        await atualizarEstoqueChannel(client);
    }
    else if (interaction.customId === 'modal_remove_item_from_category') {
        const category = interaction.fields.getTextInputValue('category');
        const product = interaction.fields.getTextInputValue('product');
        const stockData = JSON.parse(fs.readFileSync('./stock.json', 'utf8'));

        if (!stockData[category]) {
            return interaction.reply({
                content: '❌ Esta categoria não existe.',
                flags: 64
            });
        }

        if (!stockData[category][product]) {
            return interaction.reply({
                content: `❌ O produto "${product}" não existe na categoria "${category}".`,
                flags: 64
            });
        }

        const quantity = stockData[category][product];
        delete stockData[category][product];
        fs.writeFileSync('./stock.json', JSON.stringify(stockData, null, 2));

        interaction.reply({
            content: `✅ Produto "${product}" (${quantity} unidades) foi removido com sucesso da categoria "${category}"!`,
            flags: 64
        });

        await atualizarEstoqueChannel(client);
    }
});

// Inicializa a embed de estoque quando o bot iniciar
client.once('ready', async () => {
    // ... existing code ...
    await atualizarEstoqueChannel(client);
    // ... existing code ...
});

client.login(TOKEN);