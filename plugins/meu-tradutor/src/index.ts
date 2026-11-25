import { findByName, findByProps, findByPropsAll, find } from "@vendetta/metro";
import { FluxDispatcher } from "@vendetta/metro/common";
import { instead } from "@vendetta/patcher";
import { showToast } from "@vendetta/ui/toasts";
import Settings from "./Settings";
import { findStores, initializeSettings, shouldTranslateChannel, storage, stores, type Message, type Stats } from "./state";
import { hasTranslatableText, translateText, type LangCode } from "./translator";

interface MessageRow {
  rowType?: number;
  channelId?: string;
  message?: Message;
}
interface ObservedMessage {
  channelId: string;
  message: Message;
  source: string;
  translated: boolean;
}
interface OutgoingMessage {
  content?: string;
}
type SendArgs = [channelId: string, message: OutgoingMessage, ...options: unknown[]];

const MAX_OBSERVED = 200;
const MAX_CACHED = 500;
const MAX_INFLIGHT = 4;
const PREFIX_LANGUAGES: Record<string, LangCode> = { en: "EN", es: "ES", pt: "PT-BR" };

const visibleMessages = new Map<string, ObservedMessage>();
const translationCache = new Map<string, string>();
const cacheSources = new Map<string, string>();
const failed = new Map<string, string>();
const inFlight = new Set<string>();
const queue = new Set<string>();
const pendingRenders = new Set<string>();
const statsListeners = new Set<(stats: Stats) => void>();
const emptyStats: Stats = { observed: 0, rendered: 0, incomingStatus: "Aguardando conexão", outgoingStatus: "Aguardando conexão", lastError: "", apiCalls: 0, pending: 0, cacheHits: 0, cachedMessages: 0, errors: 0 };

let stats = { ...emptyStats };
let statsTimer: ReturnType<typeof setTimeout> | undefined;
let renderTimer: ReturnType<typeof setTimeout> | undefined;
let incomingController: AbortController | undefined;
let outgoingController: AbortController | undefined;
let unpatchRowManager: (() => void) | undefined;
let unpatchSendMessage: (() => void) | undefined;
let hookRetry: ReturnType<typeof setTimeout> | undefined;
let scanTimer: ReturnType<typeof setInterval> | undefined;
const appliedLocally = new Map<string, { original: Message; translated: string; channelId: string }>();

function notifyUser(message: string): void {
  try {
    showToast(message);
  } catch {
    // O envio e a inicialização continuam quando o módulo de avisos muda.
  }
}

function readStats(): Stats {
  return { ...stats, cachedMessages: translationCache.size };
}

function subscribeStats(listener: (value: Stats) => void): () => void {
  statsListeners.add(listener);
  return () => { statsListeners.delete(listener); };
}

function notifyStats(): void {
  if (!statsListeners.size || statsTimer !== undefined) return;
  statsTimer = setTimeout(() => {
    statsTimer = undefined;
    const snapshot = readStats();
    for (const listener of statsListeners) listener(snapshot);
  }, 0);
}

function translate(text: string, targetLang: LangCode, signal: AbortSignal): Promise<string> {
  const provider = storage.provider;
  const sessionStats = stats;
  let started = false;

  return translateText(text, {
    provider,
    targetLang,
    apiKey: storage.apiKeys[provider] ?? "",
    model: provider === "deepl" ? undefined : storage.models[provider],
    customEndpoint: storage.customEndpoint,
    signal,
    onRequest: () => {
      started = true;
      sessionStats.apiCalls++;
      sessionStats.pending++;
      notifyStats();
    },
  }).catch((error: unknown) => {
    if (!signal.aborted) { sessionStats.errors++; sessionStats.lastError = describeError(error); }
    throw error;
  }).finally(() => {
    if (started) sessionStats.pending--;
    if (stats === sessionStats) notifyStats();
  });
}

function cacheKey(id: string): string {
  return id + ":" + storage.provider + ":" + storage.targetLang;
}

function removeCached(key: string): void {
  translationCache.delete(key);
  cacheSources.delete(key);
  notifyStats();
}

function cacheTranslation(key: string, source: string, translated: string): void {
  if (translationCache.size >= MAX_CACHED) {
    const oldest = translationCache.keys().next().value;
    if (oldest !== undefined) removeCached(oldest);
  }
  translationCache.set(key, translated);
  cacheSources.set(key, source);
  notifyStats();
}

function getCached(key: string, source: string): string | undefined {
  if (cacheSources.has(key) && cacheSources.get(key) !== source) removeCached(key);
  return translationCache.get(key);
}

function dispatchMessage(original: Message): void {
  try {
    const dispatched = FluxDispatcher?.dispatch({ type: "MESSAGE_UPDATE", message: { ...original, channel_id: original.channel_id ?? original.channelId } });
    void Promise.resolve(dispatched).catch(error => { stats.lastError = "Atualização local: " + describeError(error); notifyStats(); });
  } catch {
    // Algumas versões rejeitam atualizações locais durante uma troca de canal.
  }
}

function readOriginal(channelId: string, id: string, fallback?: Message): Message | undefined {
  try {
    const current = stores.messages?.getMessage(channelId, id) ?? fallback;
    const applied = appliedLocally.get(id);
    if (applied && current?.content === applied.translated) return applied.original;
    if (applied && current && current.content !== applied.original.content) appliedLocally.delete(id);
    return current;
  } catch { return fallback; }
}
function restoreLocal(): void {
  for (const [id, applied] of appliedLocally) {
    try {
      const current = stores.messages?.getMessage(applied.channelId, id);
      // Never overwrite a real edit received after the local translation.
      if (current?.content === applied.translated) dispatchMessage({ ...current, content: applied.original.content, channel_id: applied.channelId });
    } catch {}
  }
  appliedLocally.clear();
}
function scheduleRender(id: string): void {
  pendingRenders.add(id);
  if (renderTimer !== undefined) return;
  renderTimer = setTimeout(() => {
    renderTimer = undefined;
    const refresh = Array.from(pendingRenders);
    pendingRenders.clear();
    for (const messageId of refresh) {
      const observed = visibleMessages.get(messageId);
      if (!observed || !isSelected(observed.channelId)) continue;
      const original = readOriginal(observed.channelId, messageId, observed.message);
      if (!original) continue;
      const cached = getCached(cacheKey(messageId), observed.source);
      if (cached !== undefined && cached !== original.content && canTranslateIncoming(observed)) {
        // Local Flux event only, never an edit request to Discord's servers.
        // Keep the original so later reads and disabling the plugin are reversible.
        const current = stores.messages?.getMessage(observed.channelId, messageId);
        if (current && current.content === original.content) {
          if (appliedLocally.size < MAX_CACHED || appliedLocally.has(messageId)) {
            appliedLocally.set(messageId, { original, translated: cached, channelId: observed.channelId });
            dispatchMessage({ ...current, content: cached, channel_id: observed.channelId });
          }
        } else if (!current) {
          dispatchMessage(original);
        }
      } else dispatchMessage(original);
      try { stores.messages?.emitChange?.(); } catch {}
    }
  }, 0);
}

function canTranslateIncoming(message: ObservedMessage): boolean {
  if (!storage.autoTranslate || !shouldTranslateChannel(message.channelId)) return false;
  const userId = stores.users?.getCurrentUser()?.id;
  if (storage.ignoreOwnMessages && userId && message.message.author?.id === userId) return false;
  return hasTranslatableText(message.source);
}

function isSelected(channelId: string): boolean {
  const selected = stores.selectedChannel?.getChannelId();
  return !selected || selected === channelId;
}

function pumpQueue(): void {
  const controller = incomingController;
  const session = outgoingController;
  if (!controller || !session || !storage.autoTranslate) return;

  for (const id of queue) {
    if (inFlight.size >= MAX_INFLIGHT) break;
    const key = cacheKey(id);
    if (inFlight.has(key)) continue;

    queue.delete(id);
    const observed = visibleMessages.get(id);
    if (!observed || !isSelected(observed.channelId) || !canTranslateIncoming(observed)) continue;

    const source = observed.source;
    if (getCached(key, source) !== undefined || failed.get(key) === source) continue;
    inFlight.add(key);

    void translate(source, storage.targetLang, controller.signal).then(translated => {
      const current = visibleMessages.get(id);
      const currentOriginal = readOriginal(observed.channelId, id);
      if (controller.signal.aborted || !current || current.source !== source
        || (currentOriginal && currentOriginal.content !== source)
        || !canTranslateIncoming(current) || cacheKey(id) !== key) return;
      cacheTranslation(key, source, translated);
      if (translated !== source && isSelected(current.channelId)) scheduleRender(id);
    }).catch(() => {
      if (!controller.signal.aborted && visibleMessages.get(id)?.source === source) {
        if (failed.size >= MAX_CACHED) {
          const oldest = failed.keys().next().value;
          if (oldest !== undefined) failed.delete(oldest);
        }
        failed.set(key, source);
      }
    }).finally(() => {
      // Uma requisição antiga não pode liberar chaves de uma nova sessão.
      if (outgoingController !== session) return;
      inFlight.delete(key);
      pumpQueue();
    });
  }
}

function observeMessage(message: Message, channelId: string): ObservedMessage | undefined {
  if (!message?.id || typeof message.content !== "string" || !message.content || !isSelected(channelId)) return;
  const original = readOriginal(channelId, message.id, message) ?? message;
  if (typeof original.content !== "string") return;
  const id = original.id;
  const previous = visibleMessages.get(id);
  if (!previous || previous.source !== original.content) stats.observed++;
  const observed: ObservedMessage = { channelId, message: original, source: original.content, translated: previous?.source === original.content && !!previous.translated };
  visibleMessages.delete(id);
  visibleMessages.set(id, observed);
  if (visibleMessages.size > MAX_OBSERVED) {
    const oldest = visibleMessages.keys().next().value;
    if (oldest !== undefined) { visibleMessages.delete(oldest); queue.delete(oldest); }
  }
  if (canTranslateIncoming(observed)) {
    const key = cacheKey(id);
    if (getCached(key, observed.source) === undefined && !inFlight.has(key) && failed.get(key) !== observed.source) {
      queue.add(id);
      pumpQueue();
    }
  }
  notifyStats();
  return observed;
}

function interceptRow(args: [MessageRow?, ...unknown[]], original: (...args: [MessageRow?, ...unknown[]]) => unknown): unknown {
  try {
    const row = args[0];
    const message = row?.message;
    const channelId = message?.channel_id ?? message?.channelId ?? row?.channelId;
    if (row && message && channelId) {
      const observed = observeMessage(message, channelId);
      if (observed && canTranslateIncoming(observed)) {
        const cached = getCached(cacheKey(message.id), observed.source);
        if (cached !== undefined && cached !== observed.source) {
          // Preserve prototypes and never mutate the original message object.
          const copy = Object.assign(Object.create(Object.getPrototypeOf(message)), message, { content: cached });
          args[0] = Object.assign(Object.create(Object.getPrototypeOf(row)), row, { message: copy });
          observed.translated = true;
          stats.cacheHits++;
          stats.rendered++;
          notifyStats();
        }
      }
    }
  } catch (error) { stats.lastError = "Renderização: " + describeError(error); notifyStats(); }
  return original(...args);
}

// A second input surface covers existing history and new messages without
// depending on the RowManager name or on its argument shape.
function scanSelectedChannel(): void {
  if (!outgoingController || !storage.autoTranslate || !storage.apiKeys[storage.provider]?.trim()) return;
  try {
    const channelId = stores.selectedChannel?.getChannelId();
    if (!channelId || !shouldTranslateChannel(channelId)) return;
    const raw = stores.messages?.getMessages?.(channelId) as { toArray?(): unknown; _array?: unknown; messages?: unknown; } | undefined;
    if (!raw) return;
    const list = Array.isArray(raw) ? raw : typeof raw.toArray === "function" ? raw.toArray() : raw._array ?? raw.messages;
    if (!Array.isArray(list)) return;
    const recent = list.slice(-30);
    for (const message of recent) {
      if (message && typeof message.id === "string" && (message.channel_id ?? message.channelId ?? channelId) === channelId)
        observeMessage(message as Message, channelId);
    }
    if (!unpatchRowManager) stats.incomingStatus = "Captura por MessageStore";
    notifyStats();
  } catch (error) { stats.lastError = "Histórico local: " + describeError(error); notifyStats(); }
}

function refreshIncoming(resetCache = false): void {
  if (!incomingController) return;
  incomingController.abort();
  restoreLocal();
  incomingController = new AbortController();
  queue.clear();
  failed.clear();

  if (resetCache) {
    translationCache.clear();
    cacheSources.clear();
    notifyStats();
  }

  for (const [id, observed] of visibleMessages) {
    if (observed.translated) scheduleRender(id);
    if (!isSelected(observed.channelId) || !canTranslateIncoming(observed)) continue;

    const cached = getCached(cacheKey(id), observed.source);
    if (cached === undefined) queue.add(id);
    else if (cached !== observed.source) scheduleRender(id);
  }
  scanSelectedChannel();
  pumpQueue();
}

export function clearCacheAndRetranslate(): void {
  refreshIncoming(true);
}

function interceptSend(args: SendArgs, original: (...args: SendArgs) => unknown): unknown {
  const [channelId, message, ...options] = args;
  const content = message?.content;
  if (typeof content !== "string" || !content.trim() || content.trimStart().startsWith("/")) {
    return original(...args);
  }

  const prefix = /^!(raw|en|es|pt)[ \t]+([\s\S]*\S[\s\S]*)$/i.exec(content);
  const shortcut = prefix?.[1].toLowerCase();
  const source = prefix?.[2] ?? content;
  const send = (text: string) => text === content
    ? original(...args)
    : original(channelId, { ...message, content: text }, ...options);

  if (shortcut === "raw") return send(source);
  if (!shortcut && (!storage.translateOutgoing || storage.outgoingOnlyWithPrefix
    || !shouldTranslateChannel(channelId, true))) return original(...args);
  if (!hasTranslatableText(source)) return send(source);

  const controller = outgoingController;
  if (!controller) return send(source);
  const target = shortcut ? PREFIX_LANGUAGES[shortcut] : storage.outgoingLang;

  return translate(source, target, controller.signal).catch(() => {
    if (!controller.signal.aborted) notifyUser("Erro ao traduzir; enviando texto original.");
    return source;
  }).then(send);
}

function onLoad(): void {
  if (outgoingController) return;
  initializeSettings();
  stats = { ...emptyStats };
  incomingController = new AbortController();
  outgoingController = new AbortController();
  findStores();

  installHooks(0);
  scanTimer = setInterval(scanSelectedChannel, 1200);
  scanSelectedChannel();
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function rowPrototype(candidate: unknown): object | undefined {
  const value = candidate as { prototype?: { generate?: unknown }; default?: { prototype?: { generate?: unknown } } } | undefined;
  if (typeof value?.prototype?.generate === "function") return value.prototype;
  if (typeof value?.default?.prototype?.generate === "function") return value.default.prototype;
}

function outgoingActions(): object | undefined {
  const matches = [
    () => findByProps("sendMessage", "receiveMessage"),
    () => findByProps("sendMessage", "editMessage"),
    () => findByProps("sendMessage", "deleteMessage"),
    () => findByProps("sendMessage", "sendBotMessage"),
  ];
  for (const resolve of matches) {
    try {
      const value = resolve() as { sendMessage?: unknown } | undefined;
      if (typeof value?.sendMessage === "function") return value;
    } catch {}
  }
  try {
    const all = findByPropsAll("sendMessage");
    const actions = all.filter((value): value is { sendMessage: (...args: unknown[]) => unknown } =>
      typeof (value as { sendMessage?: unknown } | undefined)?.sendMessage === "function");
    if (actions.length === 1) return actions[0];
  } catch {}
}

function installHooks(attempt: number): void {
  if (!outgoingController) return;
  let incomingError = "", outgoingError = "";
  if (!unpatchRowManager) {
    try {
      let prototype = rowPrototype(findByName("RowManager"));
      if (!prototype) prototype = rowPrototype(findByName("RowManager", false));
      if (!prototype) prototype = rowPrototype(find(value => Boolean(rowPrototype(value))));
      if (!prototype) throw new Error("RowManager.generate não localizado");
      if (typeof FluxDispatcher?.dispatch !== "function") throw new Error("FluxDispatcher.dispatch não localizado");
      const undo = instead("generate", prototype, interceptRow);
      if (typeof undo !== "function") throw new Error("patcher.instead não retornou função de remoção");
      unpatchRowManager = undo;
      stats.incomingStatus = "Interceptação instalada";
    } catch (error) { incomingError = describeError(error); stats.incomingStatus = incomingError; }
  }
  if (!unpatchSendMessage) {
    try {
      const actions = outgoingActions();
      if (!actions) throw new Error("MessageActions.sendMessage não localizado");
      const undo = instead("sendMessage", actions, interceptSend);
      if (typeof undo !== "function") throw new Error("patcher.instead não retornou função de remoção");
      unpatchSendMessage = undo;
      stats.outgoingStatus = "Interceptação instalada";
    } catch (error) { outgoingError = describeError(error); stats.outgoingStatus = outgoingError; }
  }
  notifyStats();
  if (unpatchRowManager && unpatchSendMessage) return;
  if (attempt < 3) {
    hookRetry = setTimeout(() => installHooks(attempt + 1), 1500);
    return;
  }
  if (!unpatchRowManager && typeof stores.messages?.getMessages !== "function") notifyUser("POLYZILLA recebimento: " + incomingError);
  else if (!unpatchRowManager) stats.incomingStatus = "Captura alternativa por MessageStore";
  if (!unpatchSendMessage) notifyUser("POLYZILLA envio: " + outgoingError);
}

function onUnload(): void {
  if (scanTimer !== undefined) clearInterval(scanTimer);
  scanTimer = undefined;
  restoreLocal();
  if (hookRetry !== undefined) clearTimeout(hookRetry);
  hookRetry = undefined;
  unpatchRowManager?.();
  unpatchSendMessage?.();
  unpatchRowManager = undefined;
  unpatchSendMessage = undefined;
  incomingController?.abort();
  outgoingController?.abort();
  incomingController = undefined;
  outgoingController = undefined;
  if (renderTimer !== undefined) clearTimeout(renderTimer);
  if (statsTimer !== undefined) clearTimeout(statsTimer);
  renderTimer = undefined;
  statsTimer = undefined;

  const originals: Message[] = [];
  for (const [id, observed] of visibleMessages) {
    if (!observed.translated) continue;
    const original = readOriginal(observed.channelId, id, observed.message);
    if (original) originals.push(original);
  }

  visibleMessages.clear();
  translationCache.clear();
  cacheSources.clear();
  failed.clear();
  queue.clear();
  inFlight.clear();
  pendingRenders.clear();
  statsListeners.clear();
  stats = { ...emptyStats };

  // Despacha só depois de remover os patches, usando os objetos originais.
  for (const original of originals) dispatchMessage(original);
}

function PluginSettings(): JSX.Element {
  return Settings({
    onIncomingChange: refreshIncoming,
    onRetranslate: clearCacheAndRetranslate,
    readStats,
    subscribeStats,
  });
}

export default { onLoad, onUnload, settings: PluginSettings };
