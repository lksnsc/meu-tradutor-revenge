import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL(".", import.meta.url));
const slug = "meu-tradutor";
const source = join(root, "plugins", slug);
const dist = join(root, "dist");
const output = join(dist, slug);
const bundle = join(output, "index.js");

const vendettaRuntime = {
  name: "vendetta-runtime",
  setup(builder) {
    builder.onResolve({ filter: /^@vendetta(\/.*)?$/ }, ({ path }) => ({
      path,
      namespace: "vendetta-runtime",
    }));

    builder.onLoad({ filter: /.*/, namespace: "vendetta-runtime" }, ({ path }) => {
      // Revenge can expose lazy proxies that resolve to the wrong Metro module.
      // Resolve React and React Native by their actual public capabilities.
      if (path === "@vendetta/metro/common") {
        return { loader: "js", contents: `
          const metro = vendetta.metro;
          const common = metro.common;
          const reactKeys = ["createElement", "useState", "useEffect", "useReducer"];
          const nativeKeys = ["View", "Text", "ScrollView", "TextInput", "Pressable", "Switch"];
          // Never retain the loader's lazy module proxies. Capture actual exports.
          function captureReact(value) {
            if (!value) return;
            const methods = Object.fromEntries(reactKeys.map(key => [key, value[key]]));
            if (!reactKeys.every(key => typeof methods[key] === "function")) return;
            const Probe = () => null;
            const probe = Reflect.apply(methods.createElement, value, [Probe, { test: 1 }]);
            if (!probe || probe.type !== Probe && probe.component !== Probe || probe.props?.test !== 1) return;
            // Explicit independent bindings: no loop-scoped closures in Hermes eval.
            const createElement = methods.createElement;
            const useState = methods.useState;
            const useEffect = methods.useEffect;
            const useReducer = methods.useReducer;
            const result = {
              createElement: function polyzillaCreateElement(...args) {
                return Reflect.apply(createElement, value, args);
              },
              useState: function polyzillaUseState(initial) {
                const output = Reflect.apply(useState, value, [initial]);
                if (typeof output?.[1] !== "function") throw new Error("POLYZILLA useState: setter inválido.");
                return output;
              },
              useEffect: function polyzillaUseEffect(effect, deps) {
                return Reflect.apply(useEffect, value, [effect, deps]);
              },
              useReducer: function polyzillaUseReducer(reducer, initial, init) {
                if (typeof reducer !== "function") throw new Error("POLYZILLA useReducer: reducer inválido.");
                return Reflect.apply(useReducer, value, [reducer, initial, init]);
              }
            };
            return result;
          }
          function captureNative(value) {
            if (!value) return;
            const result = Object.fromEntries(nativeKeys.map(key => [key, value[key]]));
            if (!nativeKeys.every(key => {
              const component = result[key];
              return typeof component === "function" || (component !== null && typeof component === "object");
            })) return;
            return result;
          }
          function select(capture, candidates) {
            for (const candidate of candidates) {
              try {
                const value = candidate();
                const direct = capture(value);
                if (direct) return direct;
                const nested = capture(value?.default);
                if (nested) return nested;
              } catch {}
            }
          }
          function search(capture, keys, candidates) {
            const direct = select(capture, candidates);
            if (direct) return direct;
            try {
              const matches = metro.findByPropsAll?.(...keys) || [];
              return select(capture, Array.from(matches, value => () => value));
            } catch {}
          }
          const React = search(captureReact, reactKeys, [
            () => metro.findByProps(...reactKeys, "isValidElement", "version"),
            () => globalThis.React,
            () => common.React,
            () => metro.findByProps(...reactKeys)
          ]);
          const ReactNative = search(captureNative, ["AppRegistry", ...nativeKeys], [
            () => metro.findByProps("AppRegistry", ...nativeKeys),
            () => globalThis.ReactNative,
            () => common.ReactNative,
            () => metro.findByProps(...nativeKeys),
            () => vendetta.ui?.components?.General
          ]);
          if (!React) throw new Error("POLYZILLA: módulo React incompatível com esta versão do Discord.");
          if (!ReactNative) throw new Error("POLYZILLA: componentes React Native não encontrados.");
          const FluxDispatcher = common.FluxDispatcher;
          export { React, ReactNative, FluxDispatcher };
        ` };
      }
      if (path === "@vendetta/storage") {
        return { loader: "js", contents: `
          import { React } from "@vendetta/metro/common";
          function useProxy(storage) {
            const state = React.useState(0);
            const redraw = state?.[1];
            if (typeof redraw !== "function") throw new Error("POLYZILLA: useProxy não recebeu um setter válido.");
            React.useEffect(() => {
              const refresh = () => redraw(value => value + 1);
              const emitter = storage?.[Symbol.for("vendetta.storage.emitter")];
              if (typeof emitter?.on === "function" && typeof emitter?.off === "function") {
                emitter.on("SET", refresh);
                emitter.on("DEL", refresh);
                return () => {
                  emitter.off("SET", refresh);
                  emitter.off("DEL", refresh);
                };
              }
              const timer = setInterval(refresh, 500);
              return () => clearInterval(timer);
            }, [storage]);
            return storage;
          }
          export { useProxy };
        ` };
      }
      const segments = path.split("/").slice(1);
      const globalPath = segments.reduce((base, key) => {
        return /^[a-z_$][\w$]*$/i.test(key) ? base + "." + key : base + "[" + JSON.stringify(key) + "]";
      }, "vendetta");
      return { contents: "module.exports = " + globalPath + ";", loader: "js" };
    });
  },
};

await mkdir(output, { recursive: true });
await build({
  entryPoints: [join(source, "src", "index.ts")],
  outfile: bundle,
  bundle: true,
  minify: false,
  keepNames: true,
  format: "iife",
  globalName: "__plugin",
  target: "es2020",
  jsx: "transform",
  jsxFactory: "React.createElement",
  jsxFragment: "React.Fragment",
  banner: { js: "(() => {" },
  footer: { js: "return __plugin; })()" },
  plugins: [vendettaRuntime],
});

// Regression: the actual Revenge loader may return lazy proxies whose exports
// disappear after initialization. Render recursively after invalidating those proxies.
let tab = "traducao";
const mockReact = {
  createElement: (component, props, ...children) => {
    if (typeof component !== "function" && typeof component !== "object") throw new Error("createElement recebeu componente inválido");
    return { component, props: { ...props, children } };
  },
  // Deliberately non-iterable hook result: only indexed access is supported.
  useState: initial => ({ 0: initial === "traducao" ? tab : typeof initial === "function" ? initial() : initial, 1: () => {} }),
  useEffect: effect => { if (typeof effect !== "function") throw new Error("useEffect recebeu callback inválido"); },
  useReducer: () => { throw new Error("A interface não deve chamar useReducer"); },
  isValidElement: () => true,
  version: "19.0.0",
};
const mockNative = Object.fromEntries(["AppRegistry", "View", "Text", "ScrollView", "TextInput", "Pressable", "Switch"].map(key => [key, () => null]));
let expired = false;
const transient = target => new Proxy(target, {
  get(obj, key) { return expired ? undefined : obj[key]; },
});
const reactProxy = transient(mockReact);
const nativeProxy = transient(mockNative);
const mockVendetta = {
  metro: {
    common: { React: { useState: mockReact.useState }, ReactNative: { AppRegistry: {} } },
    findByProps: (...keys) => [reactProxy, nativeProxy].find(module => keys.every(key => key in module)),
    findByName: () => undefined,
    findByStoreName: () => undefined,
  },
  plugin: { storage: {} },
  patcher: {},
  ui: { toasts: { showToast: () => {} } },
  storage: {},
};
const code = await readFile(bundle, "utf8");
const testedPlugin = new Function("vendetta", "return " + code)(mockVendetta).default;
testedPlugin.onLoad();
expired = true;
function renderTree(node) {
  if (node == null || typeof node !== "object") return;
  if (Array.isArray(node)) { node.forEach(renderTree); return; }
  if (typeof node.component !== "function" && typeof node.component !== "object") throw new Error("Componente sem implementação");
  if (!Object.values(mockNative).includes(node.component)) renderTree(node.component(node.props));
  else renderTree(node.props?.children);
}
for (const theme of ["neobrutal-light", "kaiju-dark"]) {
  mockVendetta.plugin.storage.theme = theme;
  for (tab of ["traducao", "filtros", "api", "stats"]) {
    const settingsRoot = testedPlugin.settings();
    if (settingsRoot.component !== mockNative.View) throw new Error("Falha no teste da interface de configuração.");
    renderTree(settingsRoot);
  }
}
testedPlugin.onUnload();
console.log("POLYZILLA: renderização recursiva das quatro abas e dois temas com proxies invalidados aprovada.");

const manifest = JSON.parse(await readFile(join(source, "manifest.json"), "utf8"));
manifest.main = "index.js";
manifest.hash = createHash("sha256").update(await readFile(bundle)).digest("hex");

await Promise.all([
  writeFile(join(output, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n"),
  writeFile(join(dist, "index.html"), installPage()),
  writeFile(join(dist, "index.js"), code),
  writeFile(join(dist, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n"),
]);

function installPage() {
  return [
    '<!doctype html>',
    '<html lang="pt-BR">',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>POLYZILLA para Revenge</title>',
    '<style>',
    '  :root { color-scheme: dark; font: 16px/1.55 system-ui,sans-serif; background: #111214; color: #f2f3f5; }',
    '  * { box-sizing: border-box; }',
    '  body { margin: 0; min-height: 100vh; display: grid; align-items: center; padding: 24px; }',
    '  main { margin: auto; width: 100%; max-width: 680px; padding: clamp(18px,5vw,36px); background: #1e1f22; border: 1px solid #35363c; border-radius: 14px; }',
    '  h1 { font-size: clamp(1.65rem,5vw,2.25rem); line-height: 1.2; margin: 0 0 .7em; }',
    '  label { display: block; font-weight: 650; margin-bottom: .45rem; }',
    '  input,button { font: inherit; padding: .65rem .8rem; border-radius: 8px; min-height: 44px; }',
    '  input { display: block; width: 100%; border: 1px solid #757781; color: #f2f3f5; background: #111214; }',
    '  button { margin-top: .75rem; background: #5865f2; border: 0; color: white; font-weight: 650; cursor: pointer; }',
    '  #status { min-height: 1.55em; margin-bottom: 0; color: #c0c2ca; }',
    '</style>',
    '<body>',
    '<main>',
    '  <h1>POLYZILLA para Revenge</h1>',
    '  <p>Traduza mensagens em português (BR), inglês e espanhol. Copie a URL e cole em <strong>Revenge → Plugins → +</strong>.</p>',
    '  <label for="plugin">URL do plugin</label>',
    '  <input id="plugin" readonly spellcheck="false">',
    '  <button id="copy" type="button">Copiar URL</button>',
    '  <p id="status" role="status"></p>',
    '</main>',
    '<script>',
    '  const directory = location.pathname.replace(/\\/index\\.html$/i, "/").replace(/\\/?$/, "/");',
    '  const url = location.origin + directory;',
    '  const field = document.getElementById("plugin");',
    '  const status = document.getElementById("status");',
    '  field.value = url;',
    '  field.onclick = () => field.select();',
    '  document.getElementById("copy").onclick = async () => {',
    '    try {',
    '      await navigator.clipboard.writeText(url);',
    '      status.textContent = "URL copiada.";',
    '    } catch {',
    '      field.focus();',
    '      field.select();',
    '      field.setSelectionRange(0, field.value.length);',
    '      status.textContent = "URL selecionada. Use a opção de copiar do aparelho.";',
    '    }',
    '  };',
    '</script>',
    '</body>',
    '</html>',
    '',
  ].join("\n");
}
