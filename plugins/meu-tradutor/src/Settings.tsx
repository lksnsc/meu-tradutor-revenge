import { React, ReactNative } from "@vendetta/metro/common";
import { useProxy } from "@vendetta/storage";
import { showToast } from "@vendetta/ui/toasts";
import { storage, stores, type FilterMode, type Stats } from "./state";
import { cleanString, translateText, selectedModel, DEFAULT_MODELS, LANG_NAMES, PROVIDER_NAMES, type LangCode, type ProviderId } from "./translator";

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
        <Text style={styles.hint}>!en inglês · !es espanhol · !pt português (BR) · !raw texto original. Os atalhos funcionam mesmo com a tradução automática desligada e respeitam os filtros de envio. Digite o comando no início da mensagem. Para enviar sem comando, ligue Traduzir ao enviar e selecione o modo automático.</Text>
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
    const id = cleanString(input);
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
        value={typeof value === "string" ? value : ""}
        onChangeText={text => onChange(typeof text === "string" ? text : "")}
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
  if (!cleanString(key)) throw new Error("Informe sua chave de API Gemini.");
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
        headers: { "x-goog-api-key": cleanString(key) },
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
  const apiKeyState = React.useState(cleanString(storage.apiKeys?.[provider]));
  const apiKey = apiKeyState[0];
  const setApiKey = apiKeyState[1];
  const savedModel = provider === "deepl" ? "" : selectedModel(provider, storage.models?.[provider]);
  const modelState = React.useState(savedModel);
  const model = modelState[0];
  const setModel = modelState[1];
  const accountState = React.useState(cleanString(storage.cloudflareAccountId));
  const account = accountState[0];
  const setAccount = accountState[1];
  const endpointState = React.useState(cleanString(storage.customEndpoint));
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
  const manualModelState = React.useState(false);
  const manualModel = manualModelState[0];
  const setManualModel = manualModelState[1];
  const searchState = React.useState("");
  const query = searchState[0];
  const setQuery = searchState[1];
  const refreshCatalog = async () => {
    if (loading) return;
    setLoading(true);
    setCatalogStatus("Consultando catálogo do Google...");
    try {
      const result = await loadGeminiModels(cleanString(apiKey));
      setCatalog(result);
      setCatalogOpen(true);
      setCatalogStatus(Object.keys(result).length + " modelos encontrados. Teste o modelo escolhido para verificar acesso e cota.");
    } catch (error) {
      setCatalogStatus("Falha na consulta: " + (error instanceof Error ? error.message : String(error)));
    } finally { setLoading(false); }
  };
  const matchingModels = Object.keys(catalog).filter(id => (id + " " + catalog[id]).toLowerCase().includes(cleanString(query).toLowerCase()));
  const family = (id: string): string => {
    if (/^gemini-4(?:[.-]|$)/i.test(id)) return "Gemini 4";
    if (/^gemini-3(?:[.-]|$)/i.test(id)) return "Gemini 3";
    if (/^gemini-2(?:[.-]|$)/i.test(id)) return "Gemini 2";
    if (/^gemma-/i.test(id)) return "Gemma";
    return "Outros modelos";
  };
  const groups = ["Gemini 4", "Gemini 3", "Gemini 2", "Gemma", "Outros modelos"];
  const activeModel = cleanString(model) || savedModel;
  const pickModel = (id: string) => { setModel(id); setCatalogOpen(false); setQuery(""); setManualModel(false); setTestResult(""); };

  const testApi = (activate = false) => {
    if (testing) return;
    setTesting(true);
    const sample = "Good morning, how are you?";
    const started = Date.now();
    let httpStatus = 0;
    let stage = "validação";
    let actualTranslation = "";
    setTestResult("Original (EN): " + sample + "\nConsultando o provedor...");
    function reportFailure(error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      setTestResult("Original (EN): " + sample + "\n" +
        (actualTranslation ? "Tradução (PT-BR): " + actualTranslation + "\n" : "") +
        (httpStatus ? "HTTP " + httpStatus + "\n" : "Sem resposta HTTP confirmada.\n") +
        "Falha [" + stage + "]: " + detail);
      setTesting(false);
    }
    try {
      const nextKey = cleanString(apiKey);
      const nextModel = provider === "deepl" ? "" : selectedModel(provider, model);
      const nextEndpoint = provider === "custom" ? cleanString(endpoint) : undefined;
      if (!nextKey) throw new Error("Informe a chave de API antes de testar.");
      const nextAccount = cleanString(account);
      stage = "requisição e tradução";
      const request = translateText(sample, {
        provider, targetLang: "PT-BR", apiKey: nextKey, model: nextModel, customEndpoint: nextEndpoint,
        cloudflareAccountId: nextAccount, sourceLang: "EN",
        onResponse: function recordStatus(status) { if (typeof status === "number") httpStatus = status; },
      });
      request.then(function receiveTranslation(result) {
        stage = "validação da resposta";
        actualTranslation = cleanString(result);
        if (!actualTranslation) throw new Error("O motor não devolveu texto válido (tipo: " + typeof result + ").");
        if (actualTranslation.toLowerCase() === sample.toLowerCase()) throw new Error("O modelo não traduziu a frase de teste.");
        const summary = "Resposta da API (" + (nextModel || provider) + ")\nOriginal (EN): " + sample +
          "\nTradução (PT-BR): " + actualTranslation +
          "\n" + (httpStatus ? "HTTP " + httpStatus + " · " : "") + (Date.now() - started) + " ms";
        // Display the actual answer before saving or restarting the chat engine.
        setTestResult(summary);
        if (!activate) { setTesting(false); return; }
        stage = "salvamento";
        storage.apiKeys = { ...storage.apiKeys, [provider]: nextKey };
        if (provider !== "deepl") storage.models = { ...storage.models, [provider]: nextModel };
        if (provider === "custom") storage.customEndpoint = nextEndpoint ?? "";
        if (provider === "cloudflare") storage.cloudflareAccountId = nextAccount;
        storage.provider = provider;
        storage.autoTranslate = true;
        Promise.resolve(onIncomingChange(true)).then(function activated() {
          setTestResult(summary + "\nConfiguração salva e tradução automática ativada. Os filtros atuais foram mantidos.");
          setTesting(false);
        }, reportFailure);
      }).catch(reportFailure);
    } catch (error) { reportFailure(error); }
  };

  const save = () => {
    const nextKey = cleanString(apiKey);
    const nextModel = provider === "deepl" ? "" : selectedModel(provider, model);
    const nextEndpoint = provider === "custom" ? cleanString(endpoint) : "";
    const nextAccount = cleanString(account);
    if (provider === "cloudflare" && !/^[a-f0-9]{32}$/i.test(nextAccount)) { setTestResult("Informe o Account ID válido da Cloudflare."); return; }
    if (nextKey !== (storage.apiKeys[provider] ?? "")
      || nextModel !== savedModel
      || (provider === "custom" && nextEndpoint !== storage.customEndpoint)
      || (provider === "cloudflare" && nextAccount !== storage.cloudflareAccountId)) {
      storage.apiKeys = { ...storage.apiKeys, [provider]: nextKey };
      if (provider !== "deepl") storage.models = { ...storage.models, [provider]: nextModel };
      if (provider === "custom") storage.customEndpoint = nextEndpoint;
      if (provider === "cloudflare") storage.cloudflareAccountId = nextAccount;
      onIncomingChange(true);
    }
    showToast("Configuração da API salva.");
  };

  return (
    <View>
      <ApiInput label="Chave de API" value={apiKey} onChange={setApiKey}
        placeholder="Cole a sua chave" secure />
      {provider !== "deepl" && provider !== "gemini" && provider !== "groq" && provider !== "openrouter-free" && provider !== "cloudflare" && (
        <ApiInput label="Modelo" value={model} onChange={setModel}
          placeholder={DEFAULT_MODELS[provider] || "Nome do modelo"} />
      )}
      {provider === "cloudflare" && (
        <View style={styles.modelSection}>
          <ApiInput label="Account ID da Cloudflare" value={account} onChange={setAccount} placeholder="32 caracteres hexadecimais" />
          <View style={styles.modelTrigger}>
            <View style={styles.modelMain}>
              <Text style={styles.modelEyebrow}>WORKERS AI · COTA GRATUITA</Text>
              <Text style={styles.modelTitle}>Meta M2M100 1.2B</Text>
              <Text style={styles.modelId}>{DEFAULT_MODELS.cloudflare}</Text>
            </View>
          </View>
          <Text style={styles.hint}>Use um token Workers AI Read restrito à sua conta. Cota gratuita compartilhada: 10.000 neurônios/dia. O plano pago pode cobrar excedentes. O modelo exige idioma de origem definido.</Text>
          <Text style={styles.label}>Idioma de origem das mensagens recebidas</Text>
          <Options labels={LANG_NAMES} value={storage.cloudflareIncomingSource} onChange={value => { storage.cloudflareIncomingSource = value; onIncomingChange(true); }} />
          <Text style={styles.label}>Idioma de origem das mensagens enviadas</Text>
          <Options labels={LANG_NAMES} value={storage.cloudflareOutgoingSource} onChange={value => { storage.cloudflareOutgoingSource = value; }} />
          <Text style={styles.hint}>Teste da API: inglês para português, independentemente dos idiomas dos chats. Obtenha as credenciais em Workers AI → Use REST API.</Text>
        </View>
      )}
      {(provider === "groq" || provider === "openrouter-free") && (
        <View style={styles.modelSection}>
          <Text style={styles.label}>Modelo gratuito</Text>
          <View style={styles.modelTrigger}>
            <View style={styles.modelMain}>
              <Text style={styles.modelEyebrow}>{provider === "groq" ? "GROQ · PLANO FREE" : "OPENROUTER · SOMENTE GRATUITOS"}</Text>
              <Text style={styles.modelTitle}>{provider === "groq" ? "Qwen 3.8 27B" : "Free Models Router"}</Text>
              <Text style={styles.modelId}>{DEFAULT_MODELS[provider]}</Text>
            </View>
          </View>
          <Text style={styles.hint}>{provider === "groq" ? "Use uma chave do plano Free da Groq. Limite publicado: 1.000 requisições/dia, 30/min, sujeito também a cotas de tokens. Contas pagas podem cobrar pelo uso." : "Roteamento somente para modelos gratuitos, sem troca para modelos pagos. Limite padrão: 50 requisições/dia, 20/min."}</Text>
          <Text style={styles.hint}>{provider === "groq" ? "Crie sua chave em console.groq.com/keys" : "Crie sua chave em openrouter.ai/keys"}</Text>
        </View>
      )}
      {provider === "gemini" && (
        <View style={styles.modelSection}>
          <Text style={styles.label}>Modelo de tradução</Text>
          <Pressable style={[styles.modelTrigger, catalogOpen && styles.modelTriggerOpen]}
            accessibilityLabel="Escolher modelo" accessibilityRole="button"
            onPress={() => { setCatalogOpen(!catalogOpen); setQuery(""); setManualModel(false); }}>
            <View style={styles.modelMain}>
              <Text style={styles.modelEyebrow}>{activeModel === savedModel ? "MODELO SALVO" : "SELEÇÃO NÃO SALVA"}</Text>
              <Text style={styles.modelTitle}>{catalog[activeModel] || activeModel || "Selecionar modelo"}</Text>
              {catalog[activeModel] && catalog[activeModel] !== activeModel && <Text style={styles.modelId}>{activeModel}</Text>}
            </View>
          </Pressable>
          {catalogOpen && (
            <View style={styles.modelPanel}>
              <View style={styles.modelPanelHead}>
                <Text style={styles.modelCount}>{matchingModels.length} modelos</Text>
                <Pressable accessibilityRole="button" onPress={() => { setCatalogOpen(false); setQuery(""); }}><Text style={styles.modelLink}>Fechar ×</Text></Pressable>
              </View>
              <TextInput accessibilityLabel="Pesquisar modelo" value={typeof query === "string" ? query : ""}
                onChangeText={text => setQuery(typeof text === "string" ? text : "")}
                autoCorrect={false} autoCapitalize="none" placeholder="Buscar modelo..." placeholderTextColor={colors.muted}
                style={styles.modelSearch} />
              <ScrollView style={styles.modelList} nestedScrollEnabled keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
                {matchingModels.length === 0 && <Text style={styles.modelEmpty}>Nenhum modelo encontrado.</Text>}
                {groups.map(group => {
                  const ids = matchingModels.filter(id => family(id) === group);
                  if (!ids.length) return null;
                  return (
                    <View key={group}>
                      <Text style={styles.modelGroup}>{group}</Text>
                      {ids.map(id => (
                        <Pressable key={id} style={[styles.modelRow, activeModel === id && styles.modelRowActive]}
                          accessibilityLabel={"Selecionar " + catalog[id]} accessibilityRole="button"
                          accessibilityState={{ selected: activeModel === id }} onPress={() => pickModel(id)}>
                          <Text style={[styles.modelDot, activeModel === id && styles.modelDotActive]}>{activeModel === id ? "●" : "○"}</Text>
                          <View style={styles.modelMain}>
                            <Text style={styles.modelRowTitle}>{catalog[id]}</Text>
                            {catalog[id] !== id && <Text style={styles.modelId}>{id}</Text>}
                          </View>
                          {activeModel === id && <Text style={styles.modelCheck}>✓</Text>}
                        </Pressable>
                      ))}
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          )}
          <View style={styles.modelTools}>
            <Pressable style={styles.modelTool} accessibilityRole="button" onPress={() => { void refreshCatalog(); }}>
              <Text style={styles.modelLink}>{loading ? "Consultando..." : "↻ Atualizar lista pela API"}</Text>
            </Pressable>
            <Pressable style={styles.modelTool} accessibilityRole="button" onPress={() => { setManualModel(!manualModel); setCatalogOpen(false); }}>
              <Text style={styles.modelLink}>{manualModel ? "Ocultar ID" : "Editar ID"}</Text>
            </Pressable>
          </View>
          {manualModel && <ApiInput label="ID do modelo" value={model} onChange={value => { setModel(value); setTestResult(""); }}
            placeholder={DEFAULT_MODELS.gemini} />}
          <Text style={styles.hint}>{catalogStatus}</Text>
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
        <View style={styles.statRow} key={label}>
          <Text style={styles.statLabel}>{label}</Text>
          <Text style={styles.statValue}>{String(value)}</Text>
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
        <Text style={styles.hint}>by NSC · R31</Text>
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
    statRow: { flexDirection: "column", alignItems: "stretch", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.outline },
    statLabel: { color: colors.muted, fontSize: 12, lineHeight: 17, marginBottom: 4 },
    statValue: { color: colors.text, fontSize: 15, lineHeight: 21, fontWeight: "700", flexShrink: 1 },
    modelSection: { marginBottom: 14 },
    modelTrigger: { ...edge, borderColor: colors.outline, backgroundColor: colors.input, flexDirection: "row", alignItems: "center", padding: 12, minHeight: 70 },
    modelTriggerOpen: { borderColor: colors.accent },
    modelMain: { flex: 1 },
    modelEyebrow: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1, marginBottom: 4 },
    modelTitle: { color: colors.text, fontSize: 16, fontWeight: "900" },
    modelId: { color: colors.muted, fontSize: 10, marginTop: 2 },
    modelPanel: { ...edge, borderColor: colors.outline, backgroundColor: colors.card, marginTop: 5, padding: 8 },
    modelPanelHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 4, marginBottom: 6 },
    modelCount: { color: colors.muted, fontSize: 11, fontWeight: "800" },
    modelSearch: { ...edge, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.input, color: colors.text, minHeight: 42, paddingHorizontal: 10, marginBottom: 5 },
    modelList: { maxHeight: 248 },
    modelGroup: { color: colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase", paddingHorizontal: 8, paddingTop: 12, paddingBottom: 5 },
    modelRow: { flexDirection: "row", alignItems: "center", minHeight: 48, paddingVertical: 6, paddingHorizontal: 8, borderLeftWidth: 3, borderLeftColor: "transparent", borderBottomWidth: 1, borderBottomColor: colors.outline },
    modelRowActive: { borderLeftColor: colors.accent, backgroundColor: colors.option },
    modelDot: { color: colors.muted, fontSize: 15, marginRight: 9 },
    modelDotActive: { color: colors.accent },
    modelRowTitle: { color: colors.text, fontSize: 13, fontWeight: "700" },
    modelCheck: { color: colors.accent, fontSize: 16, fontWeight: "900", marginLeft: 6 },
    modelEmpty: { color: colors.muted, padding: 14, fontSize: 12 },
    modelTools: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4, flexWrap: "wrap" },
    modelTool: { minHeight: 44, justifyContent: "center", paddingHorizontal: 3 },
    modelLink: { color: colors.text, fontSize: 12, fontWeight: "800" },
  };
}
