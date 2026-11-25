# Auditoria de compatibilidade POLYZILLA

Base de produção: 775a54c739212de2da18bbaa32adc310d77c9af8. Referência pública Revenge clássico: revenge-mod/revenge-bundle@0980cfcc0b381767aae50e0949d3bbf59a3a0759.

## Evidências e limites
- As capturas do usuário mostram HTTP 429 e 503 no teste independente de chat. A listagem de 27 modelos não comprova autorização de geração.
- O carregador indexa plugin e persistência pela URL; cada URL fixa de commit é uma instalação diferente. Remover o plugin também remove seu armazenamento. Não presumir migração de chaves.
- O Revenge clássico usa spitroast ^1.4.4. O contrato de before admite devolver os argumentos, evitando instead concorrente na renderização.
- O Discord móvel é proprietário; a forma interna do MessageStore/RowManager do APK específico não está disponível. Testar num dispositivo é indispensável.
- Google AI Pro não equivale ao faturamento da API. Sem autorização real de generateContent, nenhuma implementação consegue garantir uma tradução Gemini.
- A branch de auditoria não publica no Pages de produção.

## Correções
- Contadores separam captura, execução do renderizador, atualização confirmada no store e sucesso da API.
- Captura não sai do canal selecionado e suspende quando o filtro de autoria não pode ser verificado.
- Erros HTTP permanentes suspendem a fila; 429/503 seguem pausa limitada.
- Chave/modelo não são migrados silenciosamente; cache considera o modelo.
- Restauração espera atualização local e evita sobrescrever uma edição real.
- Gemma recebe instruções no conteúdo de usuário.
- Documentação revisada.

## Critérios de aceitação
1. Testes de compilação e integração com React e spitroast reais.
2. API real retorna uma tradução em português com a chave/modelo selecionado.
3. Mensagens reais antigas e novas em canal permitido traduzem; nenhum envio em canal bloqueado.
4. Desativar restaura os originais; envio normal, menções, URLs e anexos intactos.
5. Testar Android no build do usuário e iOS antes de afirmar compatibilidade ampla.
