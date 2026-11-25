# POLYZILLA para Revenge

Monstro poliglota com temas Neobrutal Light e Kaiju Dark, inspirados no TORNZILLA. Plugin de tradução para Discord mobile com interface em português do Brasil. Traduz mensagens recebidas na tela e pode traduzir as suas antes do envio. Os idiomas disponíveis são português (BR), inglês e espanhol.

O plugin usa o carregador compatível com Vendetta, que fornece a API global vendetta e instala plugins por URL. A versão nativa do Revenge que usa exclusivamente a API @revenge-mod tem outro formato de plugin. A compatibilidade com Android e iOS depende também dos módulos internos presentes no build do Discord.

## Publicar no GitHub Pages

1. Crie um repositório no GitHub chamado polyzilla, com GitHub Pages disponível para a visibilidade e o plano escolhidos.
2. Envie os arquivos deste projeto à branch main. Preserve a pasta oculta .github, onde fica o workflow.
3. No GitHub, abra **Settings → Pages → Build and deployment** e selecione **GitHub Actions** em **Source**.
4. Em **Actions → Publicar plugin no GitHub Pages**, execute **Run workflow** se o primeiro push tiver ocorrido antes de configurar o Pages. Depois, cada push em main aciona o deploy.
5. Abra a página publicada e toque em **Copiar URL**. Em um repositório de projeto com o nome sugerido, o endereço do plugin terá este formato.

    https://lksnsc.github.io/polyzilla/

O workflow gera e publica a pasta dist. A página também funciona na raiz de um domínio personalizado. O carregador busca manifest.json e index.js na raiz do site. O caminho anterior é mantido como alias para não interromper atualizações de instalações existentes.

Link alternativo: https://raw.githubusercontent.com/lksnsc/polyzilla/main/release/

## Instalar e configurar

1. No Discord modificado, abra **Revenge → Plugins → +** e cole a URL do diretório, com a barra final.
2. Ative **POLYZILLA**. Abra as configurações do plugin, selecione um provedor em **API**, preencha a chave e toque em **Salvar API**.
3. Em **Tradução**, escolha os idiomas e ative **Tradução automática** para recebimento ou **Traduzir ao enviar** para envio. O modo **Só com prefixo** limita a tradução de envio aos atalhos.
4. Em **Filtros**, selecione **Todos**, **Só na lista** ou **Ignorar lista**. Uma mensagem corresponde à lista pelo ID do canal ou pelo ID do servidor. Use o canal/servidor atual ou cole o ID manualmente. Toque em **Remover** junto ao item para retirá-lo.

| Atalho | Ação |
| --- | --- |
| !en texto | Envia o texto em inglês |
| !es texto | Envia o texto em espanhol |
| !pt texto | Envia o texto em português (BR) |
| !raw texto | Envia o texto diretamente |

Os atalhos ignoram o filtro e o modo automático. Em uma falha de tradução, o plugin avisa e envia o texto original. Quando há atalho, envia o texto após o prefixo. Mensagens vazias e comandos iniciados por barra passam direto para o Discord.

## Provedores

| Provedor | Modelo padrão ou configuração |
| --- | --- |
| Gemini | gemini-3.5-flash-lite (catálogo dinâmico) |
| DeepL | Chaves terminadas em :fx usam a API Free |
| OpenAI | gpt-4o-mini |
| DeepSeek | deepseek-chat |
| OpenRouter | google/gemini-2.5-flash |
| Personalizado | Informe o modelo e a URL HTTPS completa compatível com Chat Completions |

Os modelos disponíveis dependem do provedor e da conta. Se um modelo deixar de estar disponível, edite o campo **Modelo** na aba **API**.

## Funcionamento e dados

A tradução recebida é aplicada à cópia da mensagem usada na renderização e, quando necessário, por um evento Flux local. O texto original é mantido na sessão para restauração. Outros plugins que monitoram edições locais podem observar esses eventos. Não é enviada solicitação de edição ao servidor. Desligar a tradução ou desativar o plugin restaura a exibição original. **Retraduzir mensagens exibidas** limpa o cache da sessão e refaz as traduções se a função estiver ativa.

O provedor selecionado recebe o texto a traduzir. O plugin mascara menções, URLs, código e delimitadores de formatação antes da chamada e os restaura após validar a resposta. A chave fica na persistência local do plugin no cliente modificado. O campo de edição oculta os caracteres na tela. Chaves, mensagens e traduções ficam fora dos arquivos gerados pelo build. O cache e os contadores da aba **Estatísticas** duram apenas a sessão do plugin. Chamadas podem consumir cota do provedor.

Se uma atualização do Discord remover os módulos usados pelo plugin, um aviso identifica a função indisponível. Recebimento e envio são instalados independentemente.

## Desenvolvimento local

Use Node.js 20 e execute:

    npm install
    npm run typecheck
    npm run build

O bundle em dist/meu-tradutor/index.js lê os módulos da API carregada pelo cliente em tempo de execução. O build grava no manifesto o SHA-256 em hexadecimal dos bytes exatos desse bundle. Para servir o resultado em desenvolvimento, execute **python3 -m http.server 8000 --directory dist**. Use um endereço acessível ao aparelho se ele estiver em outro dispositivo.

Referências: [template do Vendetta](https://github.com/vendetta-mod/plugin-template), [documentação da API nativa do Revenge](https://revenge.palmdevs.me/docs/plugin-development/api-reference/) e [GitHub Pages com workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
