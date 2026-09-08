import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile('retro-museum.json', 'utf8'));
// The QuickJS sandbox has no Node built-ins: swap node:crypto for the injected Web Crypto.
const randomPlugin = {
  name: 'isolated-random',
  setup(builder) {
    builder.onResolve({ filter: /^node:crypto$/ }, () => ({ path: 'random', namespace: 'isolated' }));
    builder.onLoad({ filter: /.*/, namespace: 'isolated' }, () => ({
      contents: 'export function randomInt(max){if(!Number.isInteger(max)||max<1)throw Error("Invalid bound");const a=new Uint32Array(1),limit=4294967296-(4294967296%max);do{crypto.getRandomValues(a);}while(a[0]>=limit);return a[0]%max;}',
      loader: 'js',
    }));
  },
};
const bundle = async (file, plugins = []) =>
  (await build({ entryPoints: [file], bundle: true, write: false, format: 'iife', target: 'chrome58', minify: true, plugins })).outputFiles[0].text;

const engine = await bundle('src/adapter.js', [randomPlugin]);
const client = await bundle('src/view.js');
const css = await readFile('public/chess.css', 'utf8');
const compat = `if(!Array.prototype.at)Array.prototype.at=function(n){n=Math.trunc(n)||0;if(n<0)n+=this.length;if(n<0||n>=this.length)return;return this[n]};if(!Object.fromEntries)Object.fromEntries=function(e){var o={};for(var i=0;i<e.length;i++)o[e[i][0]]=e[i][1];return o};if(!window.structuredClone)window.structuredClone=function(v){return JSON.parse(JSON.stringify(v))};`;
const view = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><main id="app"></main><div id="notice" role="status"></div><script>${compat}</script><script>${client.replaceAll('</script', '<\\/script')}</script></body></html>`;

await mkdir('dist', { recursive: true });
await writeFile('dist/game.rmg.json', JSON.stringify({
  manifest, engine, view, assets: {},
  licenseText: await readFile('LICENSE', 'utf8'),
}));
console.log('Built ' + manifest.id + ' ' + manifest.version);
