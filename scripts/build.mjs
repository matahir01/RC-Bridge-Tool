// Build the hosted files and a standalone offline edition using Node's built-ins.
// No package installation or network access is needed.
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=name=>readFile(path.join(root,name),"utf8");
const assets=["index.html","styles.css","app.mjs","bridge-engine.mjs","research.mjs","manifest.webmanifest","icon.svg","sw.js"];
const entry=await read("app.mjs");
const imports=[...entry.matchAll(/^import\s+\{[^}]+\}\s+from\s+["'](\.\/[^"']+)["'];?$/gm)];
assert.equal(imports.length,2,"Review the offline build when entry imports change.");
let script=entry;
for(const item of imports){
  const name=item[1].slice(2);
  assert.ok(["bridge-engine.mjs","research.mjs"].includes(name),`Unrecognised offline module: ${name}`);
  const source=await read(name);
  assert.ok(!/^\s*import\b/m.test(source),`Bundle nested imports before using ${name} offline.`);
  const embedded="data:text/javascript;base64,"+Buffer.from(source).toString("base64");
  script=script.replace(item[0],()=>item[0].replace(item[1],embedded));
}
const template=await read("index.html"),css=await read("styles.css");
assert.ok(template.includes('<script type="module" src="app.mjs"></script>'));
assert.ok(template.includes('<link rel="stylesheet" href="styles.css" />'));
const offline=template
  .replace('<html lang="en">','<html lang="en" data-edition="offline">')
  .replace(/\s*<link rel="manifest"[^>]*>/,"")
  .replace(/\s*<a id="download-offline"[^>]*>[^<]*<\/a>/,"")
  .replace('<link rel="stylesheet" href="styles.css" />',()=>`<style>${css}</style>`)
  .replace('<script type="module" src="app.mjs"></script>',()=>`<script type="module">${script.replace(/<\/script/gi,"<\\/script")}</script>`);
assert.ok(!/<(?:script|link)\b[^>]*(?:src|href)=["'](?!data:)/i.test(offline),"Standalone edition still contains an external resource.");
await mkdir(path.join(root,"dist","offline"),{recursive:true});
for(const name of assets)await copyFile(path.join(root,name),path.join(root,"dist",name));
await writeFile(path.join(root,"RC-Girder-Workbench.html"),offline);
await writeFile(path.join(root,"dist","offline","RC-Girder-Workbench.html"),offline);
console.log(`Built ${assets.length} hosted assets and standalone RC-Girder-Workbench.html (${Buffer.byteLength(offline)} bytes).`);
