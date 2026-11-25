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
const stores = {MessageStore:messageStore,UserStore:currentUser,SelectedChannelStore:selectedChannel,ChannelStore:channelStore};
const candidates=[React,RN,dispatcher,actions,messageStore,selectedChannel,currentUser,channelStore];
const vendetta={
  metro:{common:{React,ReactNative:RN,FluxDispatcher:dispatcher},findByName:name=>name==="RowManager"?RowManager:undefined,findByProps:(...keys)=>candidates.find(m=>keys.every(k=>k in m)),findByPropsAll:(...keys)=>candidates.filter(m=>keys.every(k=>k in m)),find:fn=>[RowManager,...candidates].find(fn),findByStoreName:name=>stores[name]},
  plugin:{id:"https://test.invalid/polyzilla/",storage,manifest},
  patcher,ui:{toasts:{showToast(){}}},storage:{}
};
const originalFetch=globalThis.fetch;
let httpError=0;
globalThis.fetch=async(url,init)=>{
  assert.match(url,/^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\//);
  assert.equal(init.headers["x-goog-api-key"],"synthetic-key");
  assert.ok(!url.includes("synthetic-key"));
  const body=JSON.parse(init.body);
  const input=body.contents[0].parts[0].text;
  requests.push(input);
  assert.ok(!input.includes("Private other channel")&&!input.includes("My own message"));
  if(httpError) return {ok:false,status:httpError,headers:{get:()=>null},json:async()=>({error:{status:httpError===429?"RESOURCE_EXHAUSTED":"PERMISSION_DENIED"}})};
  const translated=input.replace("Good morning","Bom dia").replace("Good night","Boa noite").replace("Good evening","Boa tarde").replace("Good morning, how are you?","Bom dia, como vai?").replace("Hello","Olá");
  return {ok:true,json:async()=>({candidates:[{finishReason:"STOP",content:{parts:[{text:translated}]}}]})};
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
  await act(async()=>{settings=Renderer.create(React.createElement(plugin.settings));});
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
