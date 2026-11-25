import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import React from "react";
import Renderer, { act } from "react-test-renderer";
const require = createRequire(import.meta.url);
const patcher = require("spitroast");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const code = await readFile("dist/index.js", "utf8");
const manifest = JSON.parse(await readFile("dist/manifest.json", "utf8"));
assert.equal(manifest.hash, createHash("sha256").update(code).digest("hex"));
assert.equal(code, await readFile("dist/meu-tradutor/index.js", "utf8"));
assert.equal(manifest.main, "index-" + manifest.hash + ".js");
assert.equal(code, await readFile("dist/" + manifest.main, "utf8"));
assert.equal(code, await readFile("dist/meu-tradutor/" + manifest.main, "utf8"));
assert.ok(!/\.trim(?:Start|End)?\s*\(/.test(code));
assert.ok(!code.includes("modelChevron"));
assert.ok(code.includes("R32"));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(check, timeout=2500) {
  const end = Date.now() + timeout;
  while (!check()) {
    if (Date.now() > end) throw new Error("Condição não alcançada antes do timeout");
    await pause(20);
  }
}
const host = name => function NativeComponent(props) { return React.createElement(name, props, props.children); };
const RN = Object.fromEntries(["View","Text","ScrollView","TextInput","Pressable","Switch"].map(name=>[name,host(name)]));
RN.AppRegistry = {};
const messages = [
  {id:"100",channel_id:"1",content:"Good morning <@123>",author:{id:"2"}},
  {id:"101",channel_id:"1",content:"Good night https://example.com",author:{id:"3"}},
  {id:"102",channel_id:"1",content:"My own message",author:{id:"self"}},
  {id:"200",channel_id:"2",content:"Private other channel",author:{id:"4"}}
];
const records = new Map(messages.map(m=>[m.id,{...m}]));
let selected = "1", requests=[], sends=[], localEvents=[];
const messageStore = {
  getMessage(channel,id) { const m=records.get(id); return m?.channel_id===channel ? m : undefined; },
  getMessages(channel) {return {_array:Array.from(records.values()).filter(m=>m.channel_id===channel)};},
  emitChange() {}
};
const currentUser = {getCurrentUser:()=>({id:"self"})};
const selectedChannel = {getChannelId:()=>selected};
const channelStore = {getChannel:id=>({guild_id:id==="1"?"7":"8",name:id})};
const dispatcher = {
  _interceptors:[],
  subscribe(){},unsubscribe(){},
  async dispatch(action) {
    assert.equal(action.type,"MESSAGE_UPDATE");
    localEvents.push(action.message.id);
    await pause(2);
    const m=records.get(action.message.id);
    if (m) records.set(m.id,{...m,...action.message});
  }
};
class RowManager { generate(row) { return { ...row, message: { ...row.message } }; } }
const actions = {sendMessage(channel,message) {sends.push({channel,content:message.content});return message.content;},receiveMessage(){},editMessage(){}};
const listeners = {SET:new Set(),DEL:new Set()};
const emitter = {on(name,fn){listeners[name].add(fn);},off(name,fn){listeners[name].delete(fn);}};
const storage = new Proxy({autoTranslate:true,provider:"gemini",apiKeys:{gemini:"synthetic-key"},models:{gemini:"integration-model"},targetLang:"PT-BR",ignoreOwnMessages:true,filterMode:"whitelist",filterChannels:["1"],filterGuilds:[]},{
  get(target,key){return key===Symbol.for("vendetta.storage.emitter")?emitter:target[key];},
  set(target,key,value){target[key]=value;for(const fn of listeners.SET)fn("SET",{path:[key],value});return true;}
});
const drafts=new Map();
const draftStore={getDraft(channel,type){assert.equal(type,0);return drafts.get(channel)??"";}};
const draftActions={saveDraft(channel,type,text){assert.equal(type,0);drafts.set(channel,text);},clearDraft(channel,type){drafts.delete(channel);}};
const stores = {DraftStore:draftStore,MessageStore:messageStore,UserStore:currentUser,SelectedChannelStore:selectedChannel,ChannelStore:channelStore};
const candidates=[React,RN,dispatcher,actions,messageStore,selectedChannel,currentUser,channelStore,draftStore,draftActions];
const vendetta={
  metro:{common:{React,ReactNative:RN,FluxDispatcher:dispatcher},findByName:name=>name==="RowManager"?RowManager:undefined,findByProps:(...keys)=>candidates.find(m=>keys.every(k=>k in m)),findByPropsAll:(...keys)=>candidates.filter(m=>keys.every(k=>k in m)),find:fn=>[RowManager,...candidates].find(fn),findByStoreName:name=>stores[name]},
  plugin:{id:"https://test.invalid/polyzilla/",storage,manifest},
  patcher,ui:{toasts:{showToast(){}}},storage:{}
};
const originalFetch=globalThis.fetch;
let httpError=0;
let malformedResponse=false;
const freeCalls=[];
let draftCalls=0;
globalThis.fetch=async(url,init)=>{
  if (url === "https://api.cloudflare.com/client/v4/accounts/" + "a".repeat(32) + "/ai/run/@cf/meta/m2m100-1.2b") {
    const body=JSON.parse(init.body);
    assert.equal(init.headers.Authorization,"Bearer synthetic-cloudflare");
    if (body.source_lang==="pt" && body.target_lang==="en") {
      const translated={"Pronto.":"Ready.","Em tempo real.":"In real time.","Olá":"Hello","Olá, tudo bem?":"Hello, how are you?","Eu estou bem.":"I am fine."}[body.text];
      if(body.text==="Olá, tudo bem?"||body.text==="Eu estou bem.") draftCalls++;
      assert.ok(translated,body.text);
      return {ok:true,status:200,json:async()=>({success:true,result:{translated_text:translated},errors:[]})};
    }
    assert.equal(body.source_lang,"en"); assert.equal(body.target_lang,"pt");
    assert.equal(body.text,"Good morning, how are you?");
    return {ok:true,status:200,json:async()=>({success:true,result:{translated_text:"Bom dia, como você está?"},errors:[]})};
  }
  if (url === "https://api.groq.com/openai/v1/chat/completions" || url === "https://openrouter.ai/api/v1/chat/completions") {
    const body=JSON.parse(init.body);
    const isGroq=url.includes("api.groq.com");
    assert.equal(init.headers.Authorization,"Bearer synthetic-free-key");
    assert.equal(body.model,isGroq?"qwen/qwen3.8-27b":"openrouter/free");
    assert.ok(!body.models);
    if(isGroq) assert.equal(body.reasoning_effort,"none");
    freeCalls.push(body.model);
    return {ok:true,status:200,json:async()=>({choices:[{finish_reason:"stop",message:{content:"Bom dia, como vai?"}}]})};
  }
  assert.match(url,/^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\//);
  assert.equal(init.headers["x-goog-api-key"],"synthetic-key");
  assert.ok(!url.includes("synthetic-key"));
  const body=JSON.parse(init.body);
  const input=body.contents[0].parts[0].text;
  requests.push(input);
  assert.ok(!input.includes("Private other channel")&&!input.includes("My own message"));
  if(malformedResponse) return {ok:true,status:200,json:async()=>({candidates:[{finishReason:"STOP",content:{parts:[{}, {thought:true,text:"internal"}]}}]})};
  if(httpError) return {ok:false,status:httpError,headers:{get:()=>null},json:async()=>({error:{status:httpError===429?"RESOURCE_EXHAUSTED":"PERMISSION_DENIED"}})};
  const translated=input.replace("Good morning","Bom dia").replace("Good night","Boa noite").replace("Good evening","Boa tarde").replace("Good morning, how are you?","Bom dia, como vai?").replace("Hello","Olá");
  return {ok:true,status:200,json:async()=>({candidates:[{finishReason:"STOP",content:{parts:[{text:translated}]}}]})};
};
// Follow the actual Revenge loader's eval and default-export convention.
const raw=(0,eval)("vendetta=>{return "+code+"}")(vendetta);
const plugin=raw?.default??raw;
let settings;
const rowManager=new RowManager();
try {
  await plugin.onLoad();
  await waitFor(()=>records.get("100").content==="Bom dia <@123>"&&records.get("101").content==="Boa noite https://example.com");
  assert.equal(requests.length,2);
  assert.equal(records.get("102").content,messages[2].content);
  assert.equal(records.get("200").content,messages[3].content);
  assert.equal(rowManager.generate({rowType:1,message:messages[0]}).message.content,"Bom dia <@123>");
  assert.equal(messages[0].content,"Good morning <@123>");
  assert.equal(actions.sendMessage("1",{content:"normal"}),"normal");
  assert.equal(await actions.sendMessage("1",{content:"!pt Hello"}),"Olá");
  assert.equal(sends.at(-1).content,"Olá");
  // Reproduce incomplete/missing endpoint at runtime, including an old storage entry.
  storage.customEndpoint = undefined;
  await act(async()=>{settings=Renderer.create(React.createElement(plugin.settings));});
  const press = label => {
    const node=settings.root.findAllByType("Text").find(x=>x.props.children===label);
    assert.ok(node,label);
    let p=node.parent;
    while(p&&!p.props.onPress)p=p.parent;
    assert.ok(p?.props.onPress,label);
    p.props.onPress();
  };
  await act(async()=>press("API"));
  const byLabel=(type,label)=>settings.root.findAllByType(type).find(x=>x.props.accessibilityLabel===label);
  await act(async()=>byLabel("Pressable","Escolher modelo").props.onPress());
  assert.ok(settings.root.findAllByType("ScrollView").some(x=>x.props.style?.maxHeight===248),"Lista precisa ter altura limitada");
  await act(async()=>byLabel("TextInput","Pesquisar modelo").props.onChangeText("Hydrogen"));
  assert.ok(byLabel("Pressable","Selecionar Gemini 4 Hydrogen"));
  assert.ok(!byLabel("Pressable","Selecionar Gemini 4 Neon"));
  await act(async()=>byLabel("Pressable","Selecionar Gemini 4 Hydrogen").props.onPress());
  assert.ok(!byLabel("TextInput","Pesquisar modelo"),"O seletor deve fechar após a escolha");
  assert.ok(!settings.root.findAllByType("Text").some(x=>["⌃","⌄"].includes(x.props.children)),"Seletor não deve exibir seta");
  const hydrogenRequests = requests.length;
  await act(async()=>{press("Testar API agora");await pause(30);});
  assert.equal(requests.length,hydrogenRequests+1,"Teste do modelo Hydrogen selecionado deve chegar à rede simulada");
  assert.ok(settings.root.findAllByType("Text").some(x=>typeof x.props.children==="string"&&x.props.children.includes("Resposta da API (gemini-4-hydrogen)")));
  await act(async()=>press("Editar ID"));
  await act(async()=>byLabel("TextInput","ID do modelo").props.onChangeText("integration-model"));
  await act(async()=>press("Ocultar ID"));
  console.log("Regressão: seletor compacto, pesquisa, escolha e edição de ID aprovadas.");
  const prior=requests.length;
  await act(async()=>{press("Testar API agora");await pause(30);});
  assert.equal(requests.length,prior+1,"Teste API deve chegar à rede mesmo sem endpoint customizado");
  const hasText=phrase=>settings.root.findAllByType("Text").some(x=>typeof x.props.children==="string"&&x.props.children.includes(phrase));
  assert.ok(hasText("Resposta da API"),"Teste não exibiu sucesso");
  assert.ok(hasText("Original (EN): Good morning, how are you?"));
  assert.ok(hasText("Tradução (PT-BR): Bom dia, how are you?"));
  assert.ok(hasText("HTTP 200"));
  malformedResponse=true;
  await act(async()=>{press("Testar API agora");await pause(30);});
  assert.ok(hasText("não retornou texto traduzido"),"Resposta sem texto deve gerar mensagem específica");
  assert.ok(!hasText("Cannot read property"),"Não deve expor erro de propriedade indefinida");
  malformedResponse=false;
  await act(async()=>{press("Testar API agora");await pause(30);});
  assert.ok(hasText("Resposta da API"),"Teste deve recuperar após resposta inválida");
  await act(async()=>press("Salvar API"));
  assert.ok(storage.apiKeys.gemini==="synthetic-key");
  await act(async()=>{press("Testar, salvar e ativar tradução");await pause(40);});
  assert.ok(hasText("Configuração salva e tradução automática ativada"),"Ativação por teste falhou");
  assert.equal(storage.autoTranslate,true);
  const keyInput=settings.root.findAllByType("TextInput").find(x=>x.props.accessibilityLabel==="Chave de API");
  assert.ok(keyInput);
  await act(async()=>keyInput.props.onChangeText(undefined));
  const beforeEmpty=requests.length;
  await act(async()=>{press("Testar API agora");await pause(20);});
  assert.equal(requests.length,beforeEmpty,"Chave ausente não deve gerar chamada");
  assert.ok(hasText("Informe a chave de API"),"Validação da chave ausente");
  await act(async()=>keyInput.props.onChangeText("synthetic-key"));
  console.log("Regressão: botões da API executados com endpoint indefinido e chave ausente.");
  await act(async()=>{storage.autoTranslate=false;await pause(20);});
  for(const name of ["Groq (plano Free)","OpenRouter gratuito"]){
    await act(async()=>press(name));
    const field=byLabel("TextInput","Chave de API");
    await act(async()=>field.props.onChangeText("synthetic-free-key"));
    await act(async()=>{press("Testar API agora");await pause(30);});
    assert.ok(hasText("Tradução (PT-BR): Bom dia, como vai?"));
    assert.ok(hasText("HTTP 200"));
  }
  assert.deepEqual(freeCalls,["qwen/qwen3.8-27b","openrouter/free"]);
  await act(async()=>press("Cloudflare Workers AI"));
  await act(async()=>byLabel("TextInput","Chave de API").props.onChangeText("synthetic-cloudflare"));
  await act(async()=>byLabel("TextInput","Account ID da Cloudflare").props.onChangeText("a".repeat(32)));
  await act(async()=>{press("Testar API agora");await pause(30);});
  assert.ok(hasText("Tradução (PT-BR): Bom dia, como você está?"));
  assert.ok(hasText("HTTP 200"));
  await act(async()=>press("Salvar API"));
  assert.equal(storage.cloudflareAccountId,"a".repeat(32));
  assert.equal(await actions.sendMessage("1",{content:"!en Pronto.\n\nEm tempo real."}),"Ready.\n\nIn real time.");
  assert.equal(sends.at(-1).content,"Ready.\n\nIn real time.");
  assert.equal(actions.sendMessage("1",{content:"!raw Olá"}),"Olá");
  assert.equal(actions.sendMessage("2",{content:"!en Olá"}),"Olá");
  storage.translateOutgoing=true; storage.outgoingOnlyWithPrefix=false; storage.outgoingLang="EN";
  assert.equal(await actions.sendMessage("1",{content:"Olá"}),"Hello");
  assert.equal(actions.sendMessage("2",{content:"Olá"}),"Olá");
  storage.translateOutgoing=false;
  storage.translateDraft=true;
  await pause(300);
  const sentBefore=sends.length;
  draftActions.saveDraft("1",0,"Olá, tudo bem?");
  await pause(2500);
  assert.equal(draftCalls,0,"Não deve chamar antes de 5 segundos");
  draftActions.saveDraft("1",0,"Eu estou bem.");
  await pause(3000);
  assert.equal(draftCalls,0,"Nova digitação reinicia o prazo");
  await waitFor(()=>draftStore.getDraft("1",0)==="I am fine.",3500);
  assert.equal(draftCalls,1);
  assert.equal(sends.length,sentBefore,"Traduzir rascunho nunca envia");
  await pause(5500);
  assert.equal(draftCalls,1,"Rascunho traduzido não pode ser traduzido novamente");
  storage.translateOutgoing=true;
  assert.equal(actions.sendMessage("1",{content:"I am fine."}),"I am fine.");
  assert.equal(draftCalls,1);
  storage.translateOutgoing=false;
  draftActions.clearDraft("1",0);
  await pause(250);
  draftActions.saveDraft("1",0,"Olá, tudo bem?");
  await pause(300);
  selected="2";
  await pause(5300);
  assert.equal(draftCalls,1,"Trocar canal cancela");
  assert.equal(draftStore.getDraft("1",0),"Olá, tudo bem?");
  selected="1"; storage.translateDraft=false;
  await pause(250);
  draftActions.clearDraft("1",0);
  await act(async()=>press("Estatísticas"));
  assert.ok(settings.root.findAllByType("View").some(x=>x.props.style?.flexDirection==="column" && x.props.style?.alignItems==="stretch"));
  assert.ok(hasText("Provedor / modelo salvo")); 
  await act(async()=>press("API"));
  await act(async()=>{press("Gemini"); storage.autoTranslate=true;await pause(30);});
  for (const tab of ["API","Estatísticas","Filtros","Tradução"]) {
    await act(async()=>{
      const label=settings.root.findAllByType("Text").find(x=>x.props.children===tab);
      assert.ok(label,tab);
      let p=label.parent;
      while(p&&!p.props.onPress)p=p.parent;
      assert.ok(p?.props.onPress,tab);
      p.props.onPress();
    });
  }
  await act(async()=>settings.unmount());settings=undefined;
  // Real edit while locally translated: never revert that edit.
  records.set("101",{...records.get("101"),content:"Edited on server"});
  await plugin.onUnload();
  assert.equal(records.get("100").content,messages[0].content);
  assert.equal(records.get("101").content,"Edited on server");
  assert.equal(rowManager.generate({rowType:1,message:messages[0]}).message.content,messages[0].content);
  // No generation requests if current channel is outside the allowlist.
  selected="2";requests=[];
  await plugin.onLoad();await pause(100);
  assert.equal(requests.length,0);
  await plugin.onUnload();
  // HTTP 403 must halt the automatic queue, not send all history.
  selected="1";httpError=403;requests=[];
  records.set("101",{...messages[1]});
  await plugin.onLoad();await waitFor(()=>requests.length===1);await pause(100);
  assert.equal(requests.length,1);
  await plugin.onUnload();
  // HTTP 429 must respect pause; the rest of the history remains unsent.
  storage.models={gemini:"integration-quota-model"};httpError=429;requests=[];
  await plugin.onLoad();await waitFor(()=>requests.length===1);await pause(150);
  assert.equal(requests.length,1);
  await plugin.onUnload();
  console.log("Integração com React real e spitroast 1.4.4 aprovada: renderização, filtros, envio, restauração, HTTP 403 e 429.");
  console.log("MessageStore, Discord nativo e respostas da rede são fixtures; teste em aparelho ainda obrigatório.");
} finally {
  if(settings) await act(async()=>settings.unmount());
  await plugin.onUnload();
  globalThis.fetch=originalFetch;
}
