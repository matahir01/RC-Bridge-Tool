import assert from "node:assert/strict";
import { DESIGN, VARIABLES, eurocodeModel, latinHypercube, runExperiment, trainAnn, predictAnn, runRbdo, rowsToCsv, validationSuite } from "./research.mjs";

const r=eurocodeModel();
assert.equal(DESIGN.girderDepthMm+DESIGN.deckDepthMm,1200);
assert.equal(r.loads.lm1BridgeUdl,37);
assert.ok(r.flexure.mEd>0&&r.flexure.mRd>0&&r.shear.vEd>0&&r.shear.vRd>0&&r.deflection.value>0);
assert.ok(Object.values(r.g).every(Number.isFinite));
const lhs=latinHypercube(500,VARIABLES,{db:.25,dAs:.15,dlLl:.1},19);
assert.equal(lhs.length,500);
for(const v of VARIABLES)assert.ok(lhs.every(x=>x[v.key]>=v.lower&&x[v.key]<=v.upper));
const exp=runExperiment({n:500,seed:19});
assert.equal(exp.rows.length,500);assert.ok(Object.values(exp.pf).every(x=>x>=0&&x<=1));
const trained=await trainAnn(exp.rows,{epochs:80,hidden:12,seed:22});
const pred=predictAnn(trained.model,exp.rows[0]);assert.ok([pred.gM,pred.gV,pred.gD].every(Number.isFinite));
const rbdo=await runRbdo(trained.model,VARIABLES,{targetBeta:.5,iterations:40,reliabilitySamples:80,seed:7});assert.ok(Number.isFinite(rbdo.best.objective));
const csv=rowsToCsv(exp.rows.slice(0,2));assert.equal(csv.split("\n").length,3);
assert.ok(validationSuite().every(x=>x.pass));
console.log(JSON.stringify({deterministic:{mEd:r.flexure.mEd,mRd:r.flexure.mRd,vEd:r.shear.vEd,vRd:r.shear.vRd,deflection:r.deflection.value},pf:exp.pf,beta:exp.beta,ann:trained.metrics,rbdo:rbdo.best,checks:"passed"},null,2));
