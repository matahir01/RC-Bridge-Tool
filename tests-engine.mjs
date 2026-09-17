import assert from "node:assert/strict";
import { BRIDGE_DEFAULTS, normalizeBridge, sectionProperties, transverseDistribution, designBridge, parseGrillageCsv, verificationComparison, engineValidation } from "./bridge-engine.mjs";

const baseline=designBridge(BRIDGE_DEFAULTS);
assert.equal(baseline.input.girderDepthMm,950);
assert.equal(baseline.input.deckDepthMm,250);
assert.equal(baseline.input.deckWidthM,11);
assert.ok(Math.abs(baseline.input.girderSpacingM-1.7)<1e-9);
assert.ok(baseline.actions.mPosEd>1500&&baseline.actions.mPosEd<3000);
assert.ok(baseline.actions.vEd>300&&baseline.actions.vEd<700);
assert.ok(baseline.actions.deflectionMm>5&&baseline.actions.deflectionMm<50);
assert.ok(Object.values(baseline.checks).every(x=>Number.isFinite(x.util)));

const fitted=normalizeBridge({...BRIDGE_DEFAULTS,deckWidthM:12,leftOverhangM:.5,rightOverhangM:.5,girderCount:6,arrangementMode:"fitWidth"});
assert.ok(Math.abs(fitted.girderSpacingM-2.2)<1e-9);
const spaced=normalizeBridge({...BRIDGE_DEFAULTS,girderSpacingM:2,girderCount:6,leftOverhangM:.5,rightOverhangM:.5,arrangementMode:"fixedSpacing"});
assert.equal(spaced.deckWidthM,11);

const rect=sectionProperties({...BRIDGE_DEFAULTS,sectionType:"Rectangular"});
const tee=sectionProperties({...BRIDGE_DEFAULTS,sectionType:"T"});
const iSection=sectionProperties({...BRIDGE_DEFAULTS,sectionType:"I"});
assert.notEqual(rect.composite.I,tee.composite.I);
assert.notEqual(tee.composite.I,iSection.composite.I);

for(const method of["courbon","lever","tributary"]){const d=transverseDistribution({...BRIDGE_DEFAULTS,distributionMethod:method});assert.ok(Math.abs(d.udlShares.reduce((a,b)=>a+b,0)-1)<1e-6);assert.ok(Math.abs(d.tsShares.reduce((a,b)=>a+b,0)-1)<1e-6);}

const continuous=designBridge({...BRIDGE_DEFAULTS,spanLengthsM:[12,15,12],girderLengthM:39,sectionType:"I"});
assert.ok(continuous.actions.mPosEd>0);
assert.ok(continuous.actions.mNegEd>0);

const rows=parseGrillageCsv("girder,udl_share,ts_share,m_uls_pos_knm,m_uls_neg_knm,v_uls_kn,t_uls_knm,m_sls_knm,deflection_mm\n4,.31,.35,1500,420,360,90,900,18");
const imported=designBridge({...BRIDGE_DEFAULTS,useGrillageResults:true,distributionMethod:"imported",grillageResults:rows});
assert.equal(imported.actions.source,"imported grillage results");
assert.equal(imported.actions.mPosEd,1500);
assert.equal(imported.actions.mNegEd,420);
assert.equal(imported.actions.deflectionMm,18);

const comparison=verificationComparison(baseline,{mPosEd:baseline.actions.mPosEd,mNegEd:1,vEd:baseline.actions.vEd,tEd:baseline.actions.tEd,deflectionMm:baseline.actions.deflectionMm});
assert.equal(comparison[0].pass,true);
assert.equal(comparison[2].pass,true);
assert.ok(engineValidation().every(x=>x.pass));

console.log("Bridge engine verification passed: baseline, geometry linking, sections, distribution, continuous spans, grillage import and comparison.");
