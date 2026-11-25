import { findByProps, findByStoreName } from "@vendetta/metro";
import { cleanString, hasTranslatableText, type LangCode } from "./translator";
import { storage, stores, shouldTranslateChannel } from "./state";

const DELAY = 5000;
const TYPE = 0; // ChannelMessage; never edit drafts, search fields or thread creation drafts.
type Reader = { getDraft(channelId: string, type: number): unknown };
type Writer = { saveDraft(channelId: string, type: number, text: string): unknown; clearDraft: Function };
type Translate = (text: string, target: LangCode, signal: AbortSignal) => Promise<string>;
type Sample = { channel: string; text: string; config: string; since: number; attempted: boolean };
type Applied = { channel: string; text: string; config: string };
let reader: Reader | undefined, writer: Writer | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
let controller: AbortController | undefined;
let sample: Sample | undefined, applied: Applied | undefined;
let activeChannel: string | undefined;
let activeConfig = "";
let baseline = true;
let lastLookup = 0;
let setStatus: (message: string) => void = () => {};
const strongPT = new Set("olá obrigado obrigada obrigadaço valeu você vocês não sim gente hoje amanhã ontem então também português brasileiro brasileira desculpa desculpe beleza cadê tô tá né pra pro pelo pela pelos pelas comigo contigo conosco consigo estou estamos estão estar tava estava fui sou somos são tem temos tenho tinha têm quero queremos queria vou vamos vão vai vamo posso podemos pode consegue resolveu resolvi chegou cheguei falou fala falar faço fazer fiz feito ainda muito muita muitos muitas mais menos mesmo mesma agora pronto pronta prontinho coisa coisas alguma algum alguém ninguém tudo nada isso isto esse essa esses essas aquele aquela aqueles aquelas aqui aí lá qual quais quando quanto quantos como porque pois precisa precisar preciso precisando mensagem mensagens texto tradução traduções traduzir traduzido enviando enviar enviado escrevi escrever escrevendo trabalhando trabalho dinheiro jogador jogo jogos compras comprar boa bom boas bons bem demais legal bacana cara pessoal galera irmão irmãos porra caralho ótimo ótima parabéns saudade saúde noite tarde dia certo certeza errado consigo conheço sei sabe sabemos achar acho achei".split(" "));
const strongOther = new Set("hello thanks thank you your yours yours good morning night evening what which where when why how this that those these there their they them we are were is was have has had will would could should can cannot not yes no please ready real time and the for from with about because really very just now already everyone anybody anything everything hola gracias buenos buenas días tardes noches usted ustedes vosotros estoy estamos estáis tengo tienes tenemos quiero quieres queremos puedo puedes podemos ahora mañana ayer entonces también español española necesito necesitas habla hablar hablo hecho hice listo lista vale qué quién cuándo dónde cómo aquí allí muy mucho muchas muchos nuestras nuestros vuestro vuestra mensaje mensajes traducción traducir enviar escrito escribiendo dinero jugador juego juegos comprar compras hermano salud perdón disculpe genial".split(" "));
export function likelyPortuguese(text: string): boolean {
  const value = cleanString(text);
  if (!value || /^[!/]/.test(value) || !hasTranslatableText(value)) return false;
  const prose = value.toLowerCase().replace(/https?:\/\/\S+|<[^>\r\n]+>|\x60[^\x60]*\x60/g, " ");
  const words = prose.match(/[a-zà-ÿ]+/g) ?? [];
  let pt = 0, other = 0;
  for (const word of words) {
    if (strongPT.has(word)) pt += 2;
    if (strongOther.has(word)) other += 2;
    if (/[ãõ]|ç(?:ão|ões|a|o|u)|ções$/.test(word)) pt += 4;
    if (/[ñ]|ción$|ciones$/.test(word)) other += 4;
  }
  return pt >= 2 && pt > other + (words.length > 4 ? 1 : 0);
}
function configKey(): string {
  const p = storage.provider;
  // Never expose this string in logs or UI; it invalidates work if credentials change.
  return JSON.stringify([storage.translateDraft, storage.outgoingLang, p, storage.apiKeys?.[p], p === "deepl" ? "" : storage.models?.[p], storage.cloudflareAccountId, storage.customEndpoint]);
}
function allowed(channel: string): boolean {
  return !!storage.translateDraft && storage.outgoingLang !== "PT-BR" &&
    !!cleanString(storage.apiKeys?.[storage.provider]) && shouldTranslateChannel(channel, true);
}
function lookup(): void {
  if (Date.now() - lastLookup < 2000 && lastLookup !== 0) return;
  lastLookup = Date.now();
  try {
    if (!reader) {
      const candidate = findByStoreName?.("DraftStore") ?? findByProps("getDraft", "getRecentlyEditedDrafts");
      const host = candidate as Reader | undefined;
      if (typeof host?.getDraft === "function") reader = host;
    }
    if (!writer) {
      const host = findByProps("saveDraft", "clearDraft") as Writer | undefined;
      if (typeof host?.saveDraft === "function" && typeof host?.clearDraft === "function") writer = host;
    }
  } catch {}
}
function read(channel: string): string | undefined {
  try {
    const value = reader?.getDraft(channel, TYPE);
    if (value === null || value === undefined) return reader ? "" : undefined;
    if (typeof value === "string") return value;
    return undefined; // Do not overwrite unknown rich draft structures.
  } catch { return undefined; }
}
function cancel(): void {
  controller?.abort();
  controller = undefined;
}
function current(candidate: Sample): boolean {
  return sample === candidate && stores.selectedChannel?.getChannelId() === candidate.channel &&
    configKey() === candidate.config && allowed(candidate.channel) && read(candidate.channel) === candidate.text;
}
function tick(translate: Translate): void {
  const channel = stores.selectedChannel?.getChannelId() ?? undefined;
  const key = configKey();
  if (channel !== activeChannel || key !== activeConfig) {
    cancel(); sample = undefined; applied = undefined; baseline = true;
    activeChannel = channel; activeConfig = key;
  }
  if (!channel || !allowed(channel)) {
    cancel(); sample = undefined; baseline = true;
    setStatus(!storage.translateDraft ? "Desativada" : !channel ? "Aguardando canal" : storage.outgoingLang === "PT-BR" ? "Destino já é português" : "Canal ou API não habilitados");
    return;
  }
  if (!reader || !writer) lookup();
  if (!reader || !writer) { setStatus("Caixa de texto indisponível nesta versão do Discord"); return; }
  const text = read(channel);
  if (text === undefined) { cancel(); sample = undefined; baseline = true; setStatus("Formato de rascunho não reconhecido"); return; }
  if (baseline) {
    baseline = false;
    sample = { channel, text, config: key, since: Date.now(), attempted: true };
    setStatus("Aguardando nova digitação");
    return;
  }
  if (applied?.channel === channel && applied.text === text && applied.config === key) { setStatus("Tradução no rascunho confirmada"); return; }
  if (sample?.text !== text) {
    cancel();
    applied = undefined;
    sample = { channel, text, config: key, since: Date.now(), attempted: false };
  }
  const candidate = sample;
  if (!candidate || candidate.attempted) return;
  if (!likelyPortuguese(text)) { setStatus(text ? "Português não identificado" : "Aguardando texto"); return; }
  const remaining = DELAY - (Date.now() - candidate.since);
  if (remaining > 0) { setStatus("Traduzindo em " + Math.ceil(remaining / 1000) + " s"); return; }
  candidate.attempted = true;
  const request = new AbortController();
  controller = request;
  setStatus("Traduzindo rascunho...");
  translate(text, storage.outgoingLang, request.signal).then(result => {
    if (request.signal.aborted || !current(candidate)) return;
    if (!cleanString(result) || result === text) { setStatus("O provedor não alterou o texto"); return; }
    // Validate immediately before write; never clear the composer or send a message.
    const next = { channel, text: result, config: key };
    applied = next;
    return Promise.resolve(writer?.saveDraft(channel, TYPE, result)).then(() => {
      if (request.signal.aborted || sample !== candidate || stores.selectedChannel?.getChannelId() !== channel) return;
      if (read(channel) === result) { setStatus("Tradução no rascunho confirmada"); return; }
      applied = undefined;
      setStatus("Discord não confirmou a atualização da caixa");
    });
  }).catch(() => {
    if (!request.signal.aborted && current(candidate)) setStatus("Falha na tradução; texto original preservado");
    if (applied?.channel === channel && read(channel) !== applied.text) applied = undefined;
  }).finally(() => { if (controller === request) controller = undefined; });
}
export function startDraftTranslation(translate: Translate, status: (message: string) => void): void {
  if (timer !== undefined) return;
  setStatus = status;
  const run = () => { try { tick(translate); } catch { cancel(); setStatus("Caixa de texto indisponível"); } };
  timer = setInterval(run, 200);
  run();
}
export function stopDraftTranslation(): void {
  if (timer !== undefined) clearInterval(timer);
  timer = undefined; cancel(); sample = undefined; applied = undefined;
  activeChannel = undefined; activeConfig = ""; baseline = true; lastLookup = 0; reader = undefined; writer = undefined;
}
export function draftBeforeSend(channel: string, text: string): boolean {
  const wasTranslated = applied?.channel === channel && applied.text === text;
  if (activeChannel === channel) {
    cancel();
    // Suppress the current draft until the user types again, even if Discord clears it asynchronously.
    sample = { channel, text: read(channel) ?? text, config: activeConfig, since: Date.now(), attempted: true };
    applied = undefined;
  }
  return wasTranslated;
}
