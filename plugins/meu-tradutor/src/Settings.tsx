import { React, ReactNative } from "@vendetta/metro/common";
import { useProxy } from "@vendetta/storage";
import { showToast } from "@vendetta/ui/toasts";
import { storage, stores, type FilterMode, type Stats } from "./state";
import { DEFAULT_MODELS, LANG_NAMES, PROVIDER_NAMES, type LangCode, type ProviderId } from "./translator";

const { View, Text, ScrollView, Pressable, TextInput, Switch, StyleSheet } = ReactNative;

const colors = {
  background: "#111214",
  card: "#1e1f22",
  border: "#35363c",
  accent: "#5865f2",
  text: "#f2f3f5",
  muted: "#c0c2ca",
};

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
  return (
    <Pressable style={styles.button} onPress={onPress} accessibilityRole="button">
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

function Options<T extends string>({
  labels, value, onChange,
}: { labels: Record<T, string>; value: T; onChange: (value: T) => void }): JSX.Element {
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
          <Text style={styles.buttonText}>{labels[option]}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Translation({ onIncomingChange, onRetranslate }: SettingsProps): JSX.Element {
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
  const [manual, setManual] = React.useState("");
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

function ProviderFields({
  provider, onIncomingChange,
}: { provider: ProviderId; onIncomingChange: SettingsProps["onIncomingChange"] }): JSX.Element {
  const [apiKey, setApiKey] = React.useState(storage.apiKeys[provider] ?? "");
  const savedModel = provider === "deepl" ? "" : storage.models[provider] ?? DEFAULT_MODELS[provider];
  const [model, setModel] = React.useState(savedModel);
  const [endpoint, setEndpoint] = React.useState(storage.customEndpoint);

  const save = () => {
    const nextKey = apiKey.trim();
    const nextModel = model.trim();
    const nextEndpoint = endpoint.trim();
    if (nextKey !== (storage.apiKeys[provider] ?? "")
      || nextModel !== savedModel
      || (provider === "custom" && nextEndpoint !== storage.customEndpoint)) {
      storage.apiKeys[provider] = nextKey;
      if (provider !== "deepl") storage.models[provider] = nextModel;
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
      {provider === "custom" && (
        <ApiInput label="Endpoint compatível com OpenAI" value={endpoint} onChange={setEndpoint}
          placeholder="https://exemplo.com/v1/chat/completions" url />
      )}
      <Button label="Salvar API" onPress={save} />
    </View>
  );
}

function Api({ onIncomingChange }: SettingsProps): JSX.Element {
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
  const [stats, setStats] = React.useState(readStats);
  React.useEffect(() => {
    const unsubscribe = subscribeStats(setStats);
    setStats(readStats());
    return unsubscribe;
  }, [readStats, subscribeStats]);

  const metrics = [
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
  useProxy(storage);
  const [tab, setTab] = React.useState<keyof typeof tabs>("traducao");

  return (
    <View style={styles.screen}>
      <View style={styles.tabs}>
        {(Object.keys(tabs) as (keyof typeof tabs)[]).map(key => (
          <Pressable
            key={key}
            style={[styles.tab, key === tab && styles.selected]}
            accessibilityRole="tab"
            accessibilityState={{ selected: key === tab }}
            onPress={() => setTab(key)}
          >
            <Text style={styles.tabText}>{tabs[key]}</Text>
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 14, paddingBottom: 26 },
  tabs: { flexDirection: "row", paddingHorizontal: 9, paddingTop: 9, paddingBottom: 5 },
  tab: { flex: 1, borderRadius: 9, paddingVertical: 12, marginHorizontal: 3, justifyContent: "center", backgroundColor: colors.card },
  tabText: { color: colors.text, textAlign: "center", fontSize: 12, fontWeight: "700" },
  card: { padding: 14, backgroundColor: colors.card, borderRadius: 12, marginBottom: 12 },
  heading: { color: colors.text, fontSize: 17, fontWeight: "700", marginBottom: 10 },
  text: { color: colors.text },
  label: { color: colors.text, fontWeight: "600", marginTop: 10, marginBottom: 6 },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  toggle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44, marginBottom: 5 },
  toggleText: { flex: 1, marginRight: 10, color: colors.text, fontSize: 14 },
  options: { flexDirection: "row", flexWrap: "wrap" },
  option: { backgroundColor: colors.background, minHeight: 44, justifyContent: "center", paddingHorizontal: 11, borderRadius: 8, marginRight: 6, marginBottom: 6 },
  selected: { backgroundColor: colors.accent },
  button: { alignSelf: "flex-start", justifyContent: "center", minHeight: 44, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: colors.accent, borderRadius: 8, marginRight: 6, marginBottom: 6 },
  buttonText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  field: { marginBottom: 7 },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 8, minHeight: 44, paddingVertical: 8, paddingHorizontal: 10, marginBottom: 6, color: colors.text },
  listRow: { flexDirection: "row", alignItems: "center", minHeight: 44, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  listName: { flex: 1, color: colors.text, marginRight: 10 },
  remove: { color: "#ffb4b4", fontWeight: "600" },
  metric: { color: colors.text, fontSize: 18, fontWeight: "700" },
});
