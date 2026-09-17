import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {spawnSync} from "node:child_process";

const read=name=>readFile(new URL(name,import.meta.url),"utf8");
const html=await read("RC-Girder-Workbench.html");
assert.equal(html,await read("dist/offline/RC-Girder-Workbench.html"));
assert.ok(html.includes('data-edition="offline"'));
assert.ok(!/<(?:script|link)\b[^>]*(?:src|href)=["'](?!data:)/i.test(html));
assert.ok(!/<link\b[^>]*rel="manifest"/i.test(html));
assert.ok(!/<a\b[^>]*id="download-offline"/i.test(html));
const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
assert.ok(script,"Standalone application script is missing.");
const syntax=spawnSync(process.execPath,["--input-type=module","--check"],{input:script,encoding:"utf8"});
assert.equal(syntax.status,0,syntax.stderr);
const embedded=[...script.matchAll(/from "(data:text\/javascript;base64,([^"]+))"/g)];
assert.equal(embedded.length,2);
for(const [index,name] of ["bridge-engine.mjs","research.mjs"].entries()){
  assert.equal(Buffer.from(embedded[index][2],"base64").toString("utf8"),await read(name));
  assert.ok(!/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/.test(await read(name)));
}
assert.ok(!(await read("styles.css")).match(/@import|url\(/));
for(const name of ["tests-engine.mjs","tests-research.mjs"]){
  let test=await read(name);
  test=test.replaceAll('"./bridge-engine.mjs"',JSON.stringify(embedded[0][1])).replaceAll('"./research.mjs"',JSON.stringify(embedded[1][1]));
  await import("data:text/javascript;base64,"+Buffer.from(test).toString("base64"));
}
console.log("Standalone packaging verified: no external runtime assets; both embedded calculation modules match the source and pass their existing tests. Browser interaction testing is separate.");
