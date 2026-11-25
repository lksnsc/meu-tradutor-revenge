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
  minify: true,
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

const manifest = JSON.parse(await readFile(join(source, "manifest.json"), "utf8"));
manifest.main = "index.js";
manifest.hash = createHash("sha256").update(await readFile(bundle)).digest("hex");

await Promise.all([
  writeFile(join(output, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n"),
  writeFile(join(dist, "index.html"), installPage()),
]);

function installPage() {
  return [
    '<!doctype html>',
    '<html lang="pt-BR">',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>Meu Tradutor para Revenge</title>',
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
    '  <h1>Meu Tradutor para Revenge</h1>',
    '  <p>Traduza mensagens em português (BR), inglês e espanhol. Copie a URL e cole em <strong>Revenge → Plugins → +</strong>.</p>',
    '  <label for="plugin">URL do plugin</label>',
    '  <input id="plugin" readonly spellcheck="false">',
    '  <button id="copy" type="button">Copiar URL</button>',
    '  <p id="status" role="status"></p>',
    '</main>',
    '<script>',
    '  const directory = location.pathname.replace(/\\/index\\.html$/i, "/").replace(/\\/?$/, "/");',
    '  const url = location.origin + directory + "' + slug + '/";',
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
