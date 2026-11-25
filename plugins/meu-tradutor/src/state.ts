import { storage as pluginStorage } from "@vendetta/plugin";
import { findByProps, findByStoreName } from "@vendetta/metro";
import { DEFAULT_MODELS, type LangCode, type ModelProvider, type ProviderId } from "./translator";

export type FilterMode = "all" | "whitelist" | "blacklist";

interface PluginStorage {
  theme: "neobrutal-light" | "kaiju-dark";
  autoTranslate: boolean;
  ignoreOwnMessages: boolean;
  targetLang: LangCode;
  translateOutgoing: boolean;
  outgoingLang: LangCode;
  outgoingOnlyWithPrefix: boolean;
  filterMode: FilterMode;
  filterChannels: string[];
  filterGuilds: string[];
  applyFilterToOutgoing: boolean;
  provider: ProviderId;
  customEndpoint: string;
  apiKeys: Record<ProviderId, string>;
  models: Record<ModelProvider, string>;
}

export interface Message {
  id: string;
  channel_id?: string;
  content: string;
  author?: { id?: string };
}

interface DiscordStores {
  messages?: { getMessage(channelId: string, id: string): Message | undefined | null };
  users?: { getCurrentUser(): { id: string } | undefined | null };
  channels?: { getChannel(id: string): { guild_id?: string; name?: string } | undefined | null };
  guilds?: { getGuild(id: string): { name?: string } | undefined | null };
  selectedChannel?: { getChannelId(): string | undefined | null };
  selectedGuild?: { getGuildId(): string | undefined | null };
}

export const storage = pluginStorage as PluginStorage;
export const stores: DiscordStores = {};

export function initializeSettings(): void {
  storage.theme ??= "kaiju-dark";
  storage.autoTranslate ??= false;
  storage.ignoreOwnMessages ??= true;
  storage.targetLang ??= "PT-BR";
  storage.translateOutgoing ??= false;
  storage.outgoingLang ??= "EN";
  storage.outgoingOnlyWithPrefix ??= false;
  storage.filterMode ??= "all";
  storage.filterChannels ??= [];
  storage.filterGuilds ??= [];
  storage.applyFilterToOutgoing ??= true;
  storage.provider ??= "gemini";
  storage.customEndpoint ??= "";
  storage.apiKeys ??= { gemini: "", deepl: "", openai: "", deepseek: "", openrouter: "", custom: "" };
  storage.models ??= { ...DEFAULT_MODELS };
  if (storage.models.gemini === "gemini-2.5-flash") storage.models.gemini = DEFAULT_MODELS.gemini;
}

function findStore<T>(name: string, method: string): T | undefined {
  try {
    const named = findByStoreName?.(name) as Record<string, unknown> | undefined;
    if (typeof named?.[method] === "function") return named as T;
  } catch {
    // A busca por nome pode faltar em alguns clientes compatíveis.
  }
  try {
    const matching = findByProps(method) as Record<string, unknown> | undefined;
    if (typeof matching?.[method] === "function") return matching as T;
  } catch {
    // O plugin mantém disponíveis os recursos independentes deste store.
  }
}

export function findStores(): void {
  stores.messages = findStore("MessageStore", "getMessage");
  stores.users = findStore("UserStore", "getCurrentUser");
  stores.channels = findStore("ChannelStore", "getChannel");
  stores.guilds = findStore("GuildStore", "getGuild");
  stores.selectedChannel = findStore("SelectedChannelStore", "getChannelId");
  stores.selectedGuild = findStore("SelectedGuildStore", "getGuildId");
}

export function shouldTranslateChannel(channelId?: string, isOutgoing = false): boolean {
  if ((isOutgoing && !storage.applyFilterToOutgoing) || storage.filterMode === "all") return true;

  const guildId = channelId ? stores.channels?.getChannel(channelId)?.guild_id : undefined;
  const listed = (channelId !== undefined && storage.filterChannels.includes(channelId))
    || (guildId !== undefined && storage.filterGuilds.includes(guildId));
  return storage.filterMode === "whitelist" ? listed : !listed;
}

export interface Stats {
  observed: number;
  rendered: number;
  incomingStatus: string;
  outgoingStatus: string;
  lastError: string;
  apiCalls: number;
  pending: number;
  cacheHits: number;
  cachedMessages: number;
  errors: number;
}
