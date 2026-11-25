import { React, ReactNative } from "@vendetta/metro/common";
import { useProxy } from "@vendetta/storage";
import { showToast } from "@vendetta/ui/toasts";
import { storage, stores, type FilterMode, type Stats } from "./state";
import { translateText, DEFAULT_MODELS, LANG_NAMES, PROVIDER_NAMES, type LangCode, type ProviderId } from "./translator";

const { View, Text, ScrollView, Pressable, TextInput, Switch } = ReactNative;

const palettes = {
  "neobrutal-light": { background: "#f5f3e7", header: "#f2efe2", card: "#fffdf2", border: "#101010", outline: "#101010", accent: "#ef233c", text: "#161616", muted: "#565650", option: "#fffdf2", input: "#fffdf2", button: "#00bfc7", buttonText: "#101010", yellow: "#ffe500", danger: "#a3152d", shadow: "#101010", brand: "#ca3620" },
  "kaiju-dark": { background: "#13171d", header: "#1d2026", card: "#1d2026", border: "#08090a", outline: "#353b43", accent: "#ef233c", text: "#f5f2e9", muted: "#aeb4be", option: "#262b32", input: "#11151a", button: "#ffe500", buttonText: "#0a0c0e", yellow: "#ffe500", danger: "#fb667a", shadow: "#ef233c", brand: "#f5f2e9" },
};
const themeNames = { "neobrutal-light": "Neobrutal Light", "kaiju-dark": "Kaiju Dark" };
function getTheme() {
  const colors = palettes[storage.theme] ?? palettes["kaiju-dark"];
  return { colors, styles: makeStyles(colors) };
}

const tabs = {
  traducao: "Tradução",
  filtros: "Filtros",
  api: "API",
  stats: "Estatísticas",
};

const modes: Record<FilterMode, string> = {
  all: "Todos",
  whitelist: "Só na lista",
  blacklist: "Ignorar lista",
};

interface SettingsProps {
  onIncomingChange: (resetCache?: boolean) => void;
  onRetranslate: () => void;
  readStats: () => Stats;
  subscribeStats: (listener: (value: Stats) => void) => () => void;
}

function Section({ title, children }: { title: string; children: unknown }): JSX.Element {
  const { colors, styles } = getTheme();
  return (
    <View style={styles.card}>
      <Text style={styles.heading}>{title}</Text>
      {children}
    </View>
  );
}

function Toggle({
  label, value, onChange, yesNo = false,
}: { label: string; value: boolean; onChange: (value: boolean) => void; yesNo?: boolean }): JSX.Element {
  const { colors, styles } = getTheme();
  return (
    <View style={styles.toggle}>
      <Text style={styles.toggleText}>{label + " · " + (yesNo ? (value ? "SIM" : "NÃO") : (value ? "ON" : "OFF"))}</Text>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.accent }}
      />
    </View>
  );
}

function Button({ label, onPress }: { label: string; onPress: () => void }): JSX.Element {
  const { colors, styles } = getTheme();
  return (
    <Pressable style={styles.button} onPress={onPress} accessibilityRole="button">
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

function Options<T extends string>({
  labels, value, onChange,
}: { labels: Record<T, string>; value: T; onChange: (value: T) => void }): JSX.Element {
  const { colors, styles } = getTheme();
  return (
    <View style={styles.options}>
      {(Object.keys(labels) as T[]).map(option => (
        <Pressable
          key={option}
          style={[styles.option, option === value && styles.selected]}
          accessibilityRole="button"
          accessibilityState={{ selected: option === value }}
          onPress={() => onChange(option)}
        >
          <Text style={[styles.optionText, option === value && styles.selectedText]}>{labels[option]}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Translation({ onIncomingChange, onRetranslate }: SettingsProps): JSX.Element {
  const { colors, styles } = getTheme();
  return (
    <View>
      <Section title="Mensagens recebidas">
        <Toggle label="Tradução automática" value={storage.autoTranslate} onChange={value => {
          storage.autoTranslate = value;
          onIncomingChange();
        }} />
        <Toggle label="Ignorar minhas próprias mensagens" value={storage.ignoreOwnMessages} yesNo onChange={value => {
          storage.ignoreOwnMessages = value;
          onIncomingChange();
        }} />
        <Text style={styles.label}>Idioma de leitura</Text>
        <Options labels={LANG_NAMES} value={storage.targetLang} onChange={(value: LangCode) => {
          if (value !== storage.targetLang) {
            storage.targetLang = value;
            onIncomingChange();
          }
        }} />
        <Button label="Retraduzir mensagens exibidas" onPress={() => {
          onRetranslate();
          showToast(storage.autoTranslate ? "Retraduzindo mensagens exibidas." : "Cache limpo. A tradução automática está desligada.");
        }} />
      </Section>

      <Section title="Minhas mensagens (envio)">
        <Toggle label="Traduzir ao enviar" value={storage.translateOutgoing} onChange={value => {
          storage.translateOutgoing = value;
        }} />
        <Text style={styles.label}>Modo de envio</Text>
        <Options
          labels={{ auto: "Traduzir tudo automaticamente", prefix: "Só com prefixo (!en / !es / !pt)" }}
          value={storage.outgoingOnlyWithPrefix ? "prefix" : "auto"}
          onChange={value => { storage.outgoingOnlyWithPrefix = value === "prefix"; }}
        />
        <Text style={styles.label}>Idioma padrão de envio</Text>
        <Options labels={LANG_NAMES} value={storage.outgoingLang} onChange={(value: LangCode) => {
          storage.outgoingLang = value;
        }} />
        <Text style={styles.hint}>!en inglês · !es espanhol · !pt português (BR) · !raw texto original. Os atalhos funcionam mesmo com a tradução automática desligada.</Text>
      </Section>
    </View>
  );
}

function FilterList({
  title, ids, resolveName, remove,
}: { title: string; ids: string[]; resolveName: (id: string) => string | undefined; remove: (id: string) => void }): JSX.Element {
  const { colors, styles } = getTheme();
  return (
    <Section title={title}>
      {ids.length === 0 ? <Text style={styles.hint}>Lista vazia.</Text> : ids.map(id => {
        const name = resolveName(id) || id;
        return (
          <Pressable
            key={id}
            onPress={() => remove(id)}
            accessibilityRole="button"
            accessibilityLabel={"Remover " + name}
            style={styles.listRow}
          >
            <View style={styles.listName}>
              <Text style={styles.text}>{name}</Text>
              {name !== id && <Text style={styles.hint}>{id}</Text>}
            </View>
            <Text style={styles.remove}>Remover</Text>
          </Pressable>
        );
      })}
    </Section>
  );
}

function Filters({ onIncomingChange }: SettingsProps): JSX.Element {
  const { colors, styles } = getTheme();
  const manualState = React.useState("");
  const manual = manualState[0];
  const setManual = manualState[1];
  const save = (field: "filterChannels" | "filterGuilds", input?: string | null, manually = false) => {
    const id = input?.trim();
    if (!id || !/^\d{1,20}$/.test(id) || /^0+$/.test(id)) {
      showToast(manually ? "Informe um ID numérico válido." : "Abra um canal ou servidor e tente novamente.");
      return;
    }
    if (storage[field].includes(id)) {
      showToast("Esse ID já está salvo.");
      return;
    }
    storage[field] = [...storage[field], id];
    if (manually) setManual("");
    onIncomingChange();
  };

  const remove = (field: "filterChannels" | "filterGuilds", id: string) => {
    storage[field] = storage[field].filter(value => value !== id);
    onIncomingChange();
  };

  return (
    <View>
      <Section title="Onde traduzir">
        <Options labels={modes} value={storage.filterMode} onChange={(value: FilterMode) => {
          if (value !== storage.filterMode) {
            storage.filterMode = value;
            onIncomingChange();
          }
        }} />
        <Toggle label="Aplicar filtro também no envio" value={storage.applyFilterToOutgoing} yesNo onChange={value => {
          storage.applyFilterToOutgoing = value;
        }} />
        <Text style={styles.hint}>O filtro de envio vale para a tradução automática. Os atalhos continuam disponíveis em qualquer canal.</Text>
      </Section>

      <Section title="Adicionar à lista">
        <View style={styles.options}>
          <Button label="+ Canal atual" onPress={() => save("filterChannels", stores.selectedChannel?.getChannelId())} />
          <Button label="+ Servidor atual" onPress={() => save("filterGuilds", stores.selectedGuild?.getGuildId())} />
        </View>
        <TextInput
          accessibilityLabel="ID do canal ou servidor"
          placeholder="ID do canal ou servidor"
          placeholderTextColor={colors.muted}
          value={manual}
          onChangeText={setManual}
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={20}
          style={styles.input}
        />
        <View style={styles.options}>
          <Button label="Salvar como canal" onPress={() => save("filterChannels", manual, true)} />
          <Button label="Salvar como servidor" onPress={() => save("filterGuilds", manual, true)} />
        </View>
      </Section>

      <FilterList title="Canais salvos" ids={storage.filterChannels}
        resolveName={id => stores.channels?.getChannel(id)?.name} remove={id => remove("filterChannels", id)} />
      <FilterList title="Servidores salvos" ids={storage.filterGuilds}
        resolveName={id => stores.guilds?.getGuild(id)?.name} remove={id => remove("filterGuilds", id)} />
    </View>
  );
}

function ApiInput({
  label, value, placeholder, secure = false, url = false, onChange,
}: { label: string; value: string; placeholder: string; secure?: boolean; url?: boolean; onChange: (value: string) => void }): JSX.Element {
  const { colors, styles } = getTheme();
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        secureTextEntry={secure}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        keyboardType={url ? "url" : "default"}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={styles.input}
      />
    </View>
  );
}

// Catalog shown even before the user enters a key. The live API list is authoritative
// for discovery, but only a successful generation confirms permission and quota.
const GEMINI_MODEL_CHOICES: Record<string, string> = {
  "gemini-4-hydrogen": "Gemini 4 Hydrogen",
  "gemini-4-neon": "Gemini 4 Neon",
  "gemini-4-carbon": "Gemini 4 Carbon",
  "gemini-4-argon": "Gemini 4 Argon",
  "gemini-3.5-flash-lite": "Gemini 3.5 Flash-Lite",
  "gemini-3.8-flash": "Gemini 3.8 Flash",
  "gemini-2.5-flash-lite": "Gemini 2.5 Flash-Lite",
  "gemini-2.5-flash": "Gemini 2.5 Flash (legado)",
  "gemini-2.5-pro": "Gemini 2.5 Pro (legado)",
};

interface GoogleModel {
  name?: string;
  displayName?: string;
  supportedGenerationMethods?: string[];
}
async function loadGeminiModels(key: string): Promise<Record<string, string>> {
  if (!key.trim()) throw new Error("Informe sua chave de API Gemini.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  const models: Record<string, string> = {};
  const tokens = new Set<string>();
  let token = "";
  try {
    do {
      const url = "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000"
        + (token ? "&pageToken=" + encodeURIComponent(token) : "");
      const response = await fetch(url, {
        headers: { "x-goog-api-key": key.trim() },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Google retornou HTTP " + response.status + " ao listar modelos.");
      const page = await response.json() as { models?: GoogleModel[]; nextPageToken?: string };
      for (const item of page.models ?? []) {
        const id = item.name?.replace(/^models\//, "") ?? "";
        if (!/^(gemini|gemma)-[a-z0-9._-]+$/i.test(id)) continue;
        if (!item.supportedGenerationMethods?.includes("generateContent")) continue;
        if (/(?:^|[-_.])(image|tts|audio|live|embedding|robotics|computer-use)(?:$|[-_.])/i.test(id)) continue;
        models[id] = item.displayName || id;
      }
      token = page.nextPageToken ?? "";
      if (token && tokens.has(token)) throw new Error("O Google repetiu o token de paginação.");
      if (token) tokens.add(token);
    } while (token);
    return models;
  } finally { clearTimeout(timer); }
}

function ProviderFields({
  provider, onIncomingChange,
}: { provider: ProviderId; onIncomingChange: SettingsProps["onIncomingChange"] }): JSX.Element {
  const { colors, styles } = getTheme();
  const apiKeyState = React.useState(storage.apiKeys[provider] ?? "");
  const apiKey = apiKeyState[0];
  const setApiKey = apiKeyState[1];
  const savedModel = provider === "deepl" ? "" : storage.models[provider] ?? DEFAULT_MODELS[provider];
  const modelState = React.useState(savedModel);
  const model = modelState[0];
  const setModel = modelState[1];
  const endpointState = React.useState(storage.customEndpoint);
  const endpoint = endpointState[0];
  const setEndpoint = endpointState[1];
  const testState = React.useState("");
  const testResult = testState[0];
  const setTestResult = testState[1];
  const testingState = React.useState(false);
  const testing = testingState[0];
  const setTesting = testingState[1];
  const catalogState = React.useState<Record<string, string>>(GEMINI_MODEL_CHOICES);
  const catalog = catalogState[0];
  const setCatalog = catalogState[1];
  const catalogStatusState = React.useState("Catálogo inicial · consulte a API para atualizar.");
  const catalogStatus = catalogStatusState[0];
  const setCatalogStatus = catalogStatusState[1];
  const catalogOpenState = React.useState(false);
  const catalogOpen = catalogOpenState[0];
  const setCatalogOpen = catalogOpenState[1];
  const loadingState = React.useState(false);
  const loading = loadingState[0];
  const setLoading = loadingState[1];
  const searchState = React.useState("");
  const query = searchState[0];
  const setQuery = searchState[1];
  const refreshCatalog = async () => {
    if (loading) return;
    setLoading(true);
    setCatalogStatus("Consultando catálogo do Google...");
    try {
      const result = await loadGeminiModels(apiKey);
      setCatalog(result);
      setCatalogOpen(true);
      setCatalogStatus(Object.keys(result).length + " modelos encontrados. Teste o modelo escolhido para verificar acesso e cota.");
    } catch (error) {
      setCatalogStatus("Falha na consulta: " + (error instanceof Error ? error.message : String(error)));
    } finally { setLoading(false); }
  };
  const matchingModels = Object.keys(catalog).filter(id => (id + " " + catalog[id]).toLowerCase().includes(query.trim().toLowerCase()));
  const testApi = async (activate = false) => {
    if (testing) return;
    setTesting(true);
    setTestResult("Consultando o provedor...");
    try {
      const result = await translateText("Good morning, how are you?", { provider, targetLang: "PT-BR", apiKey: apiKey.trim(), model: model.trim(), customEndpoint: endpoint.trim() });
      if (!result.trim() || result.trim().toLowerCase() === "good morning, how are you?") throw new Error("O modelo não traduziu a frase de teste.");
      if (activate) {
        storage.apiKeys = { ...storage.apiKeys, [provider]: apiKey.trim() };
        if (provider !== "deepl") storage.models = { ...storage.models, [provider]: model.trim() };
        if (provider === "custom") storage.customEndpoint = endpoint.trim();
        storage.provider = provider;
        storage.autoTranslate = true;
        onIncomingChange(true);
      }
      setTestResult("Resposta da API (" + (model.trim() || provider) + "): " + result + (activate ? " · Configuração salva e tradução automática ativada. Os filtros atuais foram mantidos." : ""));
    } catch (error) {
      setTestResult("Falha: " + (error instanceof Error ? error.message : String(error)));
    } finally { setTesting(false); }
  };

  const save = () => {
    const nextKey = apiKey.trim();
    const nextModel = model.trim();
    const nextEndpoint = endpoint.trim();
    if (nextKey !== (storage.apiKeys[provider] ?? "")
      || nextModel !== savedModel
      || (provider === "custom" && nextEndpoint !== storage.customEndpoint)) {
      storage.apiKeys = { ...storage.apiKeys, [provider]: nextKey };
      if (provider !== "deepl") storage.models = { ...storage.models, [provider]: nextModel };
      if (provider === "custom") storage.customEndpoint = nextEndpoint;
      onIncomingChange(true);
    }
    showToast("Configuração da API salva.");
  };

  return (
    <View>
      <ApiInput label="Chave de API" value={apiKey} onChange={setApiKey}
        placeholder="Cole a sua chave" secure />
      {provider !== "deepl" && (
        <ApiInput label="Modelo" value={model} onChange={setModel}
          placeholder={DEFAULT_MODELS[provider] || "Nome do modelo"} />
      )}
      {provider === "gemini" && (
        <View style={styles.field}>
          <Text style={styles.label}>Catálogo de modelos Gemini</Text>
          <Text style={styles.hint}>{catalogStatus}</Text>
          <Button label={catalogOpen ? "Recolher modelos" : "Escolher modelo"} onPress={() => setCatalogOpen(!catalogOpen)} />
          <Button label={loading ? "Consultando..." : "Atualizar lista pela API"} onPress={() => { void refreshCatalog(); }} />
          {catalogOpen && (
            <View>
              <ApiInput label="Pesquisar modelo" value={query} onChange={setQuery} placeholder="Gemini 4, Flash, Gemma..." />
              {matchingModels.length === 0 && <Text style={styles.hint}>Nenhum modelo encontrado.</Text>}
              {matchingModels.map(id => (
                <Pressable key={id} style={[styles.option, model === id && styles.selected]}
                  accessibilityRole="button" accessibilityState={{ selected: model === id }}
                  onPress={() => { setModel(id); setCatalogOpen(false); setTestResult(""); }}>
                  <Text style={[styles.optionText, model === id && styles.selectedText]}>{catalog[id]}</Text>
                  <Text style={[styles.hint, model === id && styles.selectedText]}>{id}</Text>
                </Pressable>
              ))}
            </View>
          )}
          <Text style={styles.hint}>Modelos de texto compatíveis com generateContent. O catálogo não garante acesso ou gratuidade; use Testar API agora e depois Salvar API. Você também pode informar o ID manualmente.</Text>
        </View>
      )}
      {provider === "custom" && (
        <ApiInput label="Endpoint compatível com OpenAI" value={endpoint} onChange={setEndpoint}
          placeholder="https://exemplo.com/v1/chat/completions" url />
      )}
      <Button label="Salvar API" onPress={save} />
      <Button label={testing ? "Testando..." : "Testar API agora"} onPress={() => { void testApi(); }} />
      <Button label={testing ? "Testando..." : "Testar, salvar e ativar tradução"} onPress={() => { void testApi(true); }} />
      <Text style={styles.hint}>O teste envia apenas uma frase de exemplo. Ao escolher ativar, o texto dos chats permitidos pelos filtros será enviado ao provedor configurado. Pode consumir cota da API.</Text>
      {!!testResult && <Text style={styles.text}>{testResult}</Text>}
    </View>
  );
}

function Api({ onIncomingChange }: SettingsProps): JSX.Element {
  const { colors, styles } = getTheme();
  const provider = storage.provider;
  return (
    <Section title="Provedor de tradução">
      <Options labels={PROVIDER_NAMES} value={provider} onChange={(value: ProviderId) => {
        if (value !== storage.provider) {
          storage.provider = value;
          onIncomingChange();
        }
      }} />
      <ProviderFields key={provider} provider={provider} onIncomingChange={onIncomingChange} />
      <Text style={styles.hint}>O provedor escolhido recebe o texto a traduzir e pode cobrar pelas chamadas.</Text>
    </Section>
  );
}

function Statistics({ readStats, subscribeStats }: SettingsProps): JSX.Element {
  const { colors, styles } = getTheme();
  const statsState = React.useState(readStats);
  const stats = statsState[0];
  const setStats = statsState[1];
  React.useEffect(() => {
    const unsubscribe = subscribeStats(setStats);
    setStats(readStats());
    return unsubscribe;
  }, [readStats, subscribeStats]);

  const metrics = [
    ["Tradução automática", stats.enabled ? "ATIVADA" : "DESATIVADA"],
    ["Provedor / modelo salvo", stats.providerModel],
    ["Mensagens aguardando tradução", stats.queued],
    ["Motor de recebimento", stats.incomingStatus],
    ["Motor de envio", stats.outgoingStatus],
    ["Mensagens únicas capturadas", stats.observed],
    ["Chamadas ao renderizador", stats.rowCalls],
    ["Traduções entregues ao renderizador", stats.rendered],
    ["Atualizações confirmadas no armazenamento local", stats.storeApplied],
    ["Diagnóstico de captura", stats.captureStatus],
    ["Diagnóstico da API", stats.apiStatus],
    ["Último erro da tradução", stats.lastError || "Nenhum registrado"],
    ["Chamadas à API", stats.apiCalls],
    ["Requisições em andamento", stats.pending],
    ["Leituras do cache", stats.cacheHits],
    ["Mensagens em cache", stats.cachedMessages],
    ["Erros", stats.errors],
  ] as const;

  return (
    <Section title="Estatísticas da sessão">
      {metrics.map(([label, value]) => (
        <View style={styles.listRow} key={label}>
          <Text style={styles.listName}>{label}</Text>
          <Text style={styles.metric}>{value}</Text>
        </View>
      ))}
    </Section>
  );
}

export default function Settings(props: SettingsProps): JSX.Element {
  const { colors, styles } = getTheme();
  try { useProxy(storage); } catch (error) { throw new Error("POLYZILLA Settings.useProxy: " + String(error)); }
  const tabState = React.useState<keyof typeof tabs>("traducao");
  const tab = tabState[0];
  const setTab = tabState[1];

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.brand}>POLYZILLA</Text>
        <Text style={styles.hint}>by NSC</Text>
        <Text style={styles.tagline}>MONSTRO POLIGLOTA · TRADUÇÃO EM TEMPO REAL</Text>
        <Options labels={themeNames} value={storage.theme ?? "kaiju-dark"} onChange={value => { storage.theme = value; }} />
      </View>
      <View style={styles.tabs}>
        {(Object.keys(tabs) as (keyof typeof tabs)[]).map(key => (
          <Pressable
            key={key}
            style={[styles.tab, key === tab && styles.selected]}
            accessibilityRole="tab"
            accessibilityState={{ selected: key === tab }}
            onPress={() => setTab(key)}
          >
            <Text style={[styles.tabText, key === tab && styles.selectedText]}>{tabs[key]}</Text>
          </Pressable>
        ))}
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {tab === "traducao" && <Translation {...props} />}
        {tab === "filtros" && <Filters {...props} />}
        {tab === "api" && <Api {...props} />}
        {tab === "stats" && <Statistics {...props} />}
      </ScrollView>
    </View>
  );
}

function makeStyles(colors: typeof palettes["kaiju-dark"]) {
  const edge = { borderWidth: 2, borderColor: colors.border, borderRadius: 0 };
  const shadow = { shadowColor: colors.shadow, shadowOffset: { width: 3, height: 3 }, shadowOpacity: 1, shadowRadius: 0, elevation: 2 };
  return {
    screen: { flex: 1, backgroundColor: colors.background },
    header: { padding: 14, backgroundColor: colors.header, borderBottomWidth: 3, borderBottomColor: colors.border },
    brand: { color: colors.brand, fontSize: 30, fontWeight: "900", letterSpacing: 1, textShadowColor: colors.shadow, textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 0 },
    tagline: { color: colors.muted, fontWeight: "800", fontSize: 10, letterSpacing: 0.5, marginTop: 4, marginBottom: 12 },
    content: { padding: 14, paddingBottom: 26 },
    tabs: { flexDirection: "row", paddingHorizontal: 9, paddingVertical: 10, backgroundColor: colors.header },
    tab: { ...edge, flex: 1, paddingVertical: 12, marginHorizontal: 2, justifyContent: "center", backgroundColor: colors.option },
    tabText: { color: colors.text, textAlign: "center", fontSize: 11, fontWeight: "900" },
    card: { ...edge, ...shadow, padding: 14, backgroundColor: colors.card, marginBottom: 16, borderColor: colors.outline },
    heading: { color: colors.text, fontSize: 17, fontWeight: "900", marginBottom: 10, textTransform: "uppercase" },
    text: { color: colors.text },
    label: { color: colors.text, fontWeight: "800", marginTop: 10, marginBottom: 6 },
    hint: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
    toggle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44, marginBottom: 5 },
    toggleText: { flex: 1, marginRight: 10, color: colors.text, fontSize: 14, fontWeight: "700" },
    options: { flexDirection: "row", flexWrap: "wrap" },
    option: { ...edge, backgroundColor: colors.option, minHeight: 44, justifyContent: "center", paddingHorizontal: 10, marginRight: 6, marginBottom: 7 },
    selected: { backgroundColor: colors.accent, borderColor: colors.border, ...shadow },
    selectedText: { color: "#ffffff" },
    optionText: { color: colors.text, fontSize: 12, fontWeight: "800" },
    button: { ...edge, ...shadow, alignSelf: "flex-start", justifyContent: "center", minHeight: 44, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: colors.button, marginRight: 7, marginBottom: 8 },
    buttonText: { color: colors.buttonText, fontSize: 13, fontWeight: "900" },
    field: { marginBottom: 7 },
    input: { ...edge, backgroundColor: colors.input, minHeight: 44, paddingVertical: 8, paddingHorizontal: 10, marginBottom: 6, color: colors.text },
    listRow: { flexDirection: "row", alignItems: "center", minHeight: 44, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.outline },
    listName: { flex: 1, color: colors.text, marginRight: 10 },
    remove: { color: colors.danger, fontWeight: "800" },
    metric: { color: colors.text, fontSize: 18, fontWeight: "900" },
  };
}
