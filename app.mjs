import { BRIDGE_DEFAULTS, normalizeBridge, designBridge, parseGrillageCsv, GRILLAGE_TEMPLATE, verificationComparison, engineValidation } from "./bridge-engine.mjs";
import { VARIABLES, runExperiment, trainAnn, runRbdo, rowsToCsv } from "./research.mjs";

const $=id=>document.getElementById(id);
const clone=value=>JSON.parse(JSON.stringify(value));
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const finite=value=>value!==null&&value!==undefined&&value!==""&&Number.isFinite(Number(value));
const fmt=(value,d=2)=>finite(value)?Number(value).toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d}):"—";
const STORAGE_KEY="rc-girder-workbench-projects-v3";
const OFFLINE_EDITION=document.documentElement.dataset.edition==="offline"||location.protocol==="file:";

const UNITS={
  lengthM:{SI:[1,"m"],US:[3.280839895,"ft"]},dimMm:{SI:[1,"mm"],US:[.0393700787,"in"]},areaMm2:{SI:[1,"mm²"],US:[.0015500031,"in²"]},
  strength:{SI:[1,"MPa"],US:[.145037738,"ksi"]},modulus:{SI:[1,"GPa"],US:[145.037738,"ksi"]},line:{SI:[1,"kN/m"],US:[.068521766,"kip/ft"]},
  force:{SI:[1,"kN"],US:[.224808943,"kip"]},moment:{SI:[1,"kN·m"],US:[.737562149,"kip·ft"]},inertia:{SI:[1,"mm⁴"],US:[2.4025096e-6,"in⁴"]},surface:{SI:[1,"kN/m²"],US:[.020885434,"ksf"]},ratio:{SI:[1,"—"],US:[1,"—"]},count:{SI:[1,"—"],US:[1,"—"]}
};

let design=clone(BRIDGE_DEFAULTS),result=designBridge(design),variables=VARIABLES.map(clone),correlations={db:.25,dAs:.15,dlLl:.10},reference={source:"",mPosEd:null,mNegEd:null,vEd:null,tEd:null,deflectionMm:null},experiment=null,ann=null;

const systemFields=[
  {key:"structuralSystem",label:"Structural system",options:[["single","Single span"],["continuous","Continuous span"]]},
  {key:"spanLengthsM",label:"Analytical span length(s)",type:"spans",help:"Comma-separated for continuous spans"},
  {key:"girderLengthM",label:"Physical girder length",type:"lengthM",step:.05},
  {key:"deckWidthM",label:"Overall deck width",type:"lengthM",step:.1,disabled:p=>p.arrangementMode!=="fitWidth",help:"Driving value when fitting girders to width"},
  {key:"carriagewayWidthM",label:"Carriageway width",type:"lengthM",step:.1},
  {key:"girderCount",label:"Girder count",type:"count",step:1},
  {key:"arrangementMode",label:"Width relationship",options:[["fitWidth","Fit spacing to deck width"],["fixedSpacing","Derive width from spacing"]]},
  {key:"girderSpacingM",label:"Girder spacing",type:"lengthM",step:.05,disabled:p=>p.arrangementMode==="fitWidth",help:"Derived or driving component of bridge width"},
  {key:"leftOverhangM",label:"Left deck overhang",type:"lengthM",step:.05},
  {key:"rightOverhangM",label:"Right deck overhang",type:"lengthM",step:.05},
  {key:"designGirder",label:"Design girder number",type:"count",step:1}
];
const sectionFields=[
  {key:"sectionType",label:"Girder section",options:[["T","T section"],["I","I section"],["Rectangular","Rectangular"]]},
  {key:"girderDepthMm",label:"Girder depth",type:"dimMm",step:10},{key:"deckDepthMm",label:"Deck contribution",type:"dimMm",step:10},{key:"webWidthMm",label:"Web / rectangular width",type:"dimMm",step:10},
  {key:"topFlangeWidthMm",label:"Top flange width",type:"dimMm",step:10,disabled:p=>p.sectionType==="Rectangular"},{key:"topFlangeThicknessMm",label:"Top flange thickness",type:"dimMm",step:10,disabled:p=>p.sectionType==="Rectangular"},
  {key:"bottomFlangeWidthMm",label:"Bottom flange width",type:"dimMm",step:10,disabled:p=>p.sectionType!=="I"},{key:"bottomFlangeThicknessMm",label:"Bottom flange thickness",type:"dimMm",step:10,disabled:p=>p.sectionType!=="I"}
];
const materialFields=[
  {key:"fck",label:"Concrete strength fck",type:"strength",step:1},{key:"fyk",label:"Reinforcement fyk",type:"strength",step:10},{key:"ecmGPa",label:"Concrete modulus Ecm",type:"modulus",step:1},
  {key:"effectiveDepthMm",label:"Effective depth d",type:"dimMm",step:10},{key:"coverMm",label:"Nominal cover",type:"dimMm",step:5},{key:"asBottomMm2",label:"Bottom steel As",type:"areaMm2",step:100},{key:"asTopMm2",label:"Top steel As",type:"areaMm2",step:100},{key:"aswPerS",label:"Links Asw/s",type:"ratio",step:.1,unitOverride:"mm²/mm"}
];
const serviceFields=[{key:"stiffnessFactor",label:"Effective / gross stiffness",type:"ratio",step:.05},{key:"torsionFactor",label:"Internal torsion factor",type:"ratio",step:.01},{key:"crackLimitMm",label:"Crack-width limit",type:"dimMm",step:.05},{key:"deflectionDenominator",label:"Deflection limit L /",type:"count",step:25},{key:"fatigueSteelLimitMPa",label:"Fatigue stress-range limit",type:"strength",step:5},{key:"fatigueTrafficFactor",label:"Fatigue traffic factor",type:"ratio",step:.05}];
const loadingFields=[
  {key:"distributionMethod",label:"Transverse method",options:[["courbon","Courbon eccentricity"],["lever","Lever-rule interpolation"],["tributary","Tributary strips"],["imported","Imported grillage"]]},
  {key:"designGirder",label:"Design girder",type:"count",step:1},{key:"surfacingKNm2",label:"Surfacing load",type:"surface",step:.1},{key:"barrierEachKNm",label:"Each barrier line load",type:"line",step:.5},{key:"otherPermanentKNm",label:"Other permanent line load",type:"line",step:.5}
];
const naFields=[
  {key:"gammaG",label:"γG",type:"ratio",step:.05},{key:"gammaQ",label:"γQ",type:"ratio",step:.05},{key:"gammaC",label:"γC",type:"ratio",step:.05},{key:"gammaS",label:"γS",type:"ratio",step:.05},{key:"alphaCc",label:"αcc",type:"ratio",step:.05},
  {key:"alphaQ1",label:"αQ1 (TS lane 1)",type:"ratio",step:.05},{key:"alphaQ2",label:"αQ2 (TS lane 2)",type:"ratio",step:.05},{key:"alphaQ3",label:"αQ3 (TS lane 3+)",type:"ratio",step:.05},
  {key:"alphaq1",label:"αq1 (UDL lane 1)",type:"ratio",step:.05},{key:"alphaq2",label:"αq2 (UDL lane 2)",type:"ratio",step:.05},{key:"alphaq3",label:"αq3 (UDL lane 3+)",type:"ratio",step:.05},{key:"psi1Traffic",label:"ψ1 traffic",type:"ratio",step:.05}
];
const verificationFields=[{key:"mPosEd",label:"Positive ULS moment",type:"moment"},{key:"mNegEd",label:"Negative ULS moment",type:"moment"},{key:"vEd",label:"ULS shear",type:"force"},{key:"tEd",label:"ULS torsion",type:"moment"},{key:"deflectionMm",label:"SLS deflection",type:"dimMm"}];

function unitInfo(type,override){if(override)return[1,override];return(UNITS[type]??UNITS.ratio)[design.unitSystem]}
function displayValue(value,type){const [factor]=unitInfo(type);return Number(value)*factor}
function internalValue(value,type){const [factor]=unitInfo(type);return Number(value)/factor}
function fieldHtml(def,source=design){
  const disabled=typeof def.disabled==="function"&&def.disabled(design),raw=source[def.key];
  if(def.options)return `<label class="field"><span>${esc(def.label)}</span><div class="field-control"><select data-field="${def.key}">${def.options.map(([v,l])=>`<option value="${v}" ${raw===v?"selected":""}>${esc(l)}</option>`).join("")}</select></div>${def.help?`<small>${esc(def.help)}</small>`:""}</label>`;
  const [,unit]=unitInfo(def.type,def.unitOverride);let value=raw===null||raw===undefined?"":def.type==="spans"?raw.map(v=>fmt(displayValue(v,"lengthM"),2)).join(", "):fmt(displayValue(raw,def.type),def.type==="count"?0:3).replace(/,/g,"");
  return `<label class="field"><span>${esc(def.label)}</span><div class="field-control ${disabled?"disabled":""}"><input data-field="${def.key}" data-type="${def.type}" type="${def.type==="spans"?"text":"number"}" value="${value}" step="${def.step??.01}" ${disabled?"disabled":""}/><em>${def.type==="spans"?unit:esc(unit)}</em></div>${def.help?`<small>${esc(def.help)}</small>`:""}</label>`;
}
function renderInputGroup(id,defs,source=design){$(id).innerHTML=defs.map(d=>fieldHtml(d,source)).join("")}
function wireDesignFields(){
  document.querySelectorAll("[data-field]").forEach(el=>el.addEventListener("change",()=>{
    const key=el.dataset.field,type=el.dataset.type;
    if(key==="spanLengthsM")design.spanLengthsM=el.value.split(/[,;]+/).map(x=>internalValue(x,"lengthM")).filter(x=>x>0);
    else if(key==="structuralSystem"){
      if(el.value==="single")design.spanLengthsM=[design.spanLengthsM[0]||15];
      else if(design.spanLengthsM.length<2)design.spanLengthsM=[design.spanLengthsM[0]||15,design.spanLengthsM[0]||15];
      design.structuralSystem=el.value;
    }else if(el.tagName==="SELECT")design[key]=el.value;
    else design[key]=internalValue(el.value,type);
    if(key==="distributionMethod")design.useGrillageResults=el.value==="imported"&&design.grillageResults.length>0;
    invalidateResearch();renderAll();
  }));
}

function renderInputs(){
  renderInputGroup("system-fields",systemFields);renderInputGroup("section-fields",sectionFields);renderInputGroup("material-fields",materialFields);renderInputGroup("service-fields",serviceFields);renderInputGroup("loading-fields",loadingFields);renderInputGroup("na-fields",naFields);wireDesignFields();
  $("unit-system").value=design.unitSystem;$("project-name").value=design.projectName;
  $("verification-fields").innerHTML=verificationFields.map(d=>fieldHtml(d,reference).replace("data-field=", "data-reference=")).join("");
  document.querySelectorAll("[data-reference]").forEach(el=>el.addEventListener("change",()=>{reference[el.dataset.reference]=internalValue(el.value,el.dataset.type);renderVerification();}));
}

function renderBridge(){
  const p=result.input,spans=p.spanLengthsM.map(x=>fmt(displayValue(x,"lengthM"),2)).join(" + "),[,lu]=unitInfo("lengthM");
  $("system-title").textContent=p.structuralSystem==="continuous"?`${p.spanLengthsM.length}-span continuous girder`:`Single-span girder`;
  $("model-subtitle").textContent=`${spans} ${lu} analytical span · ${p.sectionType} section · Girder ${p.designGirder} selected`;
  $("bridge-diagram").innerHTML=`<div class="deck-shape"></div><div class="girder-row">${Array.from({length:p.girderCount},(_,i)=>`<i class="girder-glyph ${i+1===p.designGirder?"selected":""}"></i>`).join("")}</div><div class="dimension">${fmt(displayValue(p.deckWidthM,"lengthM"),2)} ${lu} overall deck · ${p.girderCount} girders</div>`;
  $("stat-width").textContent=`${fmt(displayValue(p.deckWidthM,"lengthM"),2)} ${lu}`;$("stat-spacing").textContent=`${fmt(displayValue(p.girderSpacingM,"lengthM"),2)} ${lu}`;
  const [,iu]=unitInfo("inertia");$("stat-inertia").textContent=`${fmt(displayValue(result.properties.composite.I,"inertia"),design.unitSystem==="SI"?0:1)} ${iu}`;$("stat-source").textContent=result.actions.source;
  $("overall-status").textContent=result.status;$("overall-status").className=`status ${result.status.startsWith("Within")?"":"warn"}`;
  const issues=result.issues;$("input-issues").hidden=!issues.length;$("input-issues").innerHTML=issues.map(esc).join("<br>");
}

function checkData(){const c=result.checks;return[
  {key:"flexurePos",label:"Positive flexure",u:c.flexurePos.util,demand:c.flexurePos.demand,resistance:c.flexurePos.resistance,type:"moment",symbol:"M+"},
  {key:"flexureNeg",label:"Negative flexure",u:c.flexureNeg.util,demand:c.flexureNeg.demand,resistance:c.flexureNeg.resistance,type:"moment",symbol:"M−"},
  {key:"shear",label:"Shear",u:c.shear.util,demand:c.shear.demand,resistance:c.shear.resistance,type:"force",symbol:"V"},
  {key:"torsion",label:"Shear + torsion",u:c.torsion.util,demand:c.torsion.tEd,resistance:c.torsion.tRdMax,type:"moment",symbol:"V+T"},
  {key:"cracking",label:"Crack width",u:c.cracking.util,demand:c.cracking.wkMm,resistance:c.cracking.limitMm,type:"dimMm",symbol:"wk"},
  {key:"deflection",label:"Deflection",u:c.deflection.util,demand:c.deflection.valueMm,resistance:c.deflection.limitMm,type:"dimMm",symbol:"δ"},
  {key:"fatigue",label:"Fatigue",u:c.fatigue.util,demand:c.fatigue.stressRangeMPa,resistance:c.fatigue.limitMPa,type:"strength",symbol:"Δσ"}
];}
function renderOverview(){
  const top=checkData().filter(x=>["flexurePos","shear","deflection","fatigue"].includes(x.key));
  $("headline-checks").innerHTML=top.map(x=>`<article class="headline ${x.u<=1?"ok":"warn"}"><span>${x.label}</span><strong>${fmt(x.u,3)}</strong><small>${x.u<=1?"Within":"Exceeds"} prototype check</small></article>`).join("");
  $("utilisation-chart").innerHTML=checkData().map(x=>`<div class="bar-row"><span>${x.label}</span><div class="bar-track"><i class="bar-fill ${x.u>1?"over":x.u>.8?"near":""}" style="width:${Math.min(120,Math.max(0,x.u*100))/1.2}%"></i></div><strong>${fmt(x.u,3)}</strong></div>`).join("");
}
function renderLoading(){
  const d=result.distribution,order=d.bestLaneOrder??result.lanes.map(l=>l.index),lanes=order.map(id=>result.lanes.find(l=>String(l.index)===String(id))).filter(Boolean),[,lu]=unitInfo("lengthM"),[,fu]=unitInfo("force"),[,lineu]=unitInfo("line"),[,mu]=unitInfo("moment"),[,du]=unitInfo("dimMm");
  $("lane-table").innerHTML=lanes.map((l,i)=>`<tr><td>${i+1}: Lane ${l.index}</td><td>${fmt(displayValue(l.widthM,"lengthM"),2)} ${lu}</td><td>${fmt(l.qKNm2,2)} kN/m²</td><td>${fmt(displayValue(l.tsKN,"force"),0)} ${fu}</td><td>αQ ${fmt(l.alphaQ,2)} / αq ${fmt(l.alphaq,2)}</td></tr>`).join("");
  $("distribution-caption").textContent=`Girder ${d.selectedGirder}: UDL share ${fmt(d.selectedUdlShare*100,1)}%, tandem share ${fmt(d.selectedTsShare*100,1)}%`;
  $("distribution-method").textContent=d.method.toUpperCase();const max=Math.max(...d.udlShares,...d.tsShares,.01);
  $("distribution-chart").innerHTML=d.udlShares.map((v,i)=>`<div class="distribution-group ${i+1===d.selectedGirder?"selected":""}"><i class="dist-bar" title="UDL ${fmt(v*100,1)}%" style="height:${v/max*88}%"></i><i class="dist-bar ts" title="TS ${fmt(d.tsShares[i]*100,1)}%" style="height:${d.tsShares[i]/max*88}%"></i><label>G${i+1}</label></div>`).join("");
  const a=result.actions;$("action-grid").innerHTML=[['MEd +',displayValue(a.mPosEd,'moment'),mu],['MEd −',displayValue(a.mNegEd,'moment'),mu],['VEd',displayValue(a.vEd,'force'),fu],['TEd',displayValue(a.tEd,'moment'),mu],['MSLS',displayValue(a.mService,'moment'),mu],['δ',displayValue(a.deflectionMm,'dimMm'),du]].map(x=>`<div><span>${x[0]}</span><strong>${fmt(x[1],2)} ${x[2]}</strong></div>`).join("");
  $("calculation-trace").innerHTML=[
    ["Width relationship",`${fmt(displayValue(result.input.leftOverhangM,"lengthM"),2)} + (${result.input.girderCount} − 1) × ${fmt(displayValue(result.input.girderSpacingM,"lengthM"),2)} + ${fmt(displayValue(result.input.rightOverhangM,"lengthM"),2)} = ${fmt(displayValue(result.input.deckWidthM,"lengthM"),2)} ${lu}`],
    ["Permanent line load",`Self ${fmt(displayValue(result.loads.selfWeight,"line"),2)} + finishes/barriers = ${fmt(displayValue(result.loads.permanent,"line"),2)} ${lineu}`],
    ["Traffic to girder",`UDL ${fmt(displayValue(result.loads.trafficUdl,"line"),2)} ${lineu}; tandem ${fmt(displayValue(result.loads.trafficTS,"force"),1)} ${fu}`],
    ["Envelope",`${result.input.spanLengthsM.length===1?"Single loaded span":"All loaded-span patterns"}; moving tandem scanned along ${result.input.spanLengthsM.length} span(s)`],
    ["Combination",`ULS = ${fmt(result.input.gammaG,2)}G + ${fmt(result.input.gammaQ,2)}Q; service traffic ψ1 = ${fmt(result.input.psi1Traffic,2)}`]
  ].map(x=>`<div class="trace-row"><b>${x[0]}</b><span>${x[1]}</span></div>`).join("");
  const imported=result.input.useGrillageResults&&result.input.grillageResults.length;$("grillage-state").textContent=imported?`${result.input.grillageResults.length} grillage row(s) loaded; ${result.actions.source} active for girder ${result.input.designGirder}.`:`No active grillage override. ${result.actions.source} is active.`;
}

function renderChecks(){
  $("check-cards").innerHTML=checkData().map(x=>{const [,unit]=unitInfo(x.type);return `<article class="check-card ${x.u<=1?"":"warn"}"><h2>${x.symbol} · ${x.label}</h2><strong>${fmt(x.u,3)}</strong><div class="check-line"><i style="width:${Math.min(100,Math.max(0,x.u*100))}%"></i></div><dl><div><dt>Demand</dt><dd>${fmt(displayValue(x.demand,x.type),2)} ${unit}</dd></div><div><dt>Resistance / limit</dt><dd>${fmt(displayValue(x.resistance,x.type),2)} ${unit}</dd></div></dl></article>`}).join("");
  const r=result.reinforcement;$("reinforcement-table").innerHTML=`<tr><td>Midspan bottom steel</td><td>${fmt(displayValue(r.positive.requiredMm2,"areaMm2"),0)}</td><td>${fmt(displayValue(r.positive.providedMm2,"areaMm2"),0)}</td><td>${esc(r.positive.recommendation.label)}</td></tr><tr><td>Support top steel</td><td>${fmt(displayValue(r.negative.requiredMm2,"areaMm2"),0)}</td><td>${fmt(displayValue(r.negative.providedMm2,"areaMm2"),0)}</td><td>${esc(r.negative.recommendation.label)}</td></tr><tr><td>Shear links</td><td>${fmt(r.shear.aswPerSRequired,3)} mm²/mm</td><td>${fmt(r.shear.provided,3)} mm²/mm</td><td>${esc(r.shear.recommendation)}</td></tr><tr><td>Torsion addition</td><td>${fmt(r.torsion.longitudinalRequiredMm2,0)} mm² longitudinal</td><td>—</td><td>${fmt(r.torsion.transverseRequired,3)} mm²/mm closed links</td></tr>`;
  $("detailing-notes").innerHTML=["Provide full anchorage and development beyond theoretical cut-off points.","Keep top reinforcement continuous over internal supports and verify construction stages.","Check link spacing, closed torsion links, cover, congestion and aggregate clearance.","Review local bearing, diaphragms, deck transverse reinforcement and durability separately.","Do not issue this prototype schedule for construction without a qualified engineer's full code check."].map(x=>`<li>${x}</li>`).join("");
  renderSectionDrawing();
}
function renderSectionDrawing(){
  const p=result.input,w=p.sectionType==="Rectangular"?p.webWidthMm:Math.max(p.topFlangeWidthMm,p.sectionType==="I"?p.bottomFlangeWidthMm:0),h=p.girderDepthMm,scale=Math.min(250/Math.max(w,p.girderSpacingM*1000),190/h),cx=150,base=225,rect=(width,height,y)=>`<rect x="${cx-width*scale/2}" y="${base-(y+height)*scale}" width="${width*scale}" height="${height*scale}" rx="2"/>`,deck=rect(p.girderSpacingM*1000,p.deckDepthMm,h);let girder="";
  if(p.sectionType==="Rectangular")girder=rect(p.webWidthMm,h,0);else if(p.sectionType==="T")girder=rect(p.webWidthMm,h-p.topFlangeThicknessMm,0)+rect(p.topFlangeWidthMm,p.topFlangeThicknessMm,h-p.topFlangeThicknessMm);else girder=rect(p.bottomFlangeWidthMm,p.bottomFlangeThicknessMm,0)+rect(p.webWidthMm,h-p.topFlangeThicknessMm-p.bottomFlangeThicknessMm,p.bottomFlangeThicknessMm)+rect(p.topFlangeWidthMm,p.topFlangeThicknessMm,h-p.topFlangeThicknessMm);
  $("section-drawing-title").textContent=`${p.sectionType} girder + deck`;
  $("section-drawing").innerHTML=`<svg class="section-svg" viewBox="0 0 300 250" aria-label="${p.sectionType} girder section"><g fill="#dbe5e4" stroke="#48646e" stroke-width="2">${deck}</g><g fill="#efb866" stroke="#835e29" stroke-width="2">${girder}</g><line x1="150" x2="150" y1="8" y2="232" stroke="#187e6c" stroke-dasharray="5 5"/><text x="158" y="18" font-size="11" fill="#5c6b70">centreline</text></svg>`;
  const sp=result.properties.composite;$("section-properties").innerHTML=[['Area',`${fmt(displayValue(sp.area,"areaMm2"),0)} ${unitInfo("areaMm2")[1]}`],['Centroid',`${fmt(displayValue(sp.ybar,"dimMm"),1)} ${unitInfo("dimMm")[1]}`],['Gross I',`${fmt(displayValue(sp.I,"inertia"),design.unitSystem==="SI"?0:1)} ${unitInfo("inertia")[1]}`]].map(x=>`<div><span>${x[0]}</span><b>${x[1]}</b></div>`).join("");
}

function researchDesign(){const p=result.input,d=result.distribution;return{spanM:Math.max(...p.spanLengthsM),girders:p.girderCount,deckWidthM:p.deckWidthM,carriagewayM:p.carriagewayWidthM,girderDepthMm:p.girderDepthMm,deckDepthMm:p.deckDepthMm,spacingM:p.girderSpacingM,webWidthMm:p.webWidthMm,effectiveDepthMm:p.effectiveDepthMm,fck:p.fck,fyk:p.fyk,asMm2:p.asBottomMm2,aswPerS:p.aswPerS,ecmGPa:p.ecmGPa,stiffnessFactor:p.stiffnessFactor,surfacingKNm2:p.surfacingKNm2,barriersTotalKNm:2*p.barrierEachKNm,udlShare:d.selectedUdlShare,tsShare:d.selectedTsShare,gammaG:p.gammaG,gammaQ:p.gammaQ,alphaCc:p.alphaCc,gammaC:p.gammaC,gammaS:p.gammaS,deflectionDenominator:p.deflectionDenominator};}
function renderVariables(){
  $("variable-body").innerHTML=variables.map((v,i)=>`<tr><td><b>${esc(v.label)}</b><small>${esc(v.unit)}</small></td><td><select data-var="${i}" data-prop="distribution"><option ${v.distribution==="normal"?"selected":""}>normal</option><option ${v.distribution==="lognormal"?"selected":""}>lognormal</option><option ${v.distribution==="uniform"?"selected":""}>uniform</option></select></td>${["mean","cov","lower","upper"].map(prop=>`<td><input data-var="${i}" data-prop="${prop}" type="number" value="${v[prop]}" step="${prop==="cov"?.01:.1}" /></td>`).join("")}</tr>`).join("");
  document.querySelectorAll("[data-var]").forEach(el=>el.addEventListener("change",()=>{variables[Number(el.dataset.var)][el.dataset.prop]=el.dataset.prop==="distribution"?el.value:Number(el.value);invalidateResearch();}));
}
function invalidateResearch(){if(!experiment)return;experiment=null;ann=null;$("lhs-state").textContent="Deterministic inputs changed. Run LHS again.";$("train-ann").disabled=true;$("run-rbdo").disabled=true;$("export-csv").disabled=true;}
function renderReliability(){
  const labels=[["flexure","Flexure"],["shear","Shear"],["deflection","Deflection"],["system","System"]];$("beta-grid").innerHTML=labels.map(([k,l])=>`<div><span>${l}</span><strong>${experiment?fmt(experiment.beta[k],2):"—"}</strong><small>${experiment?`Pf ${experiment.pf[k]===0?`< ${fmt(.5/experiment.n,5)}`:fmt(experiment.pf[k],5)}`:"β / Pf"}</small></div>`).join("");
  $("ann-metrics").innerHTML=[['gM','Flexure'],['gV','Shear'],['gD','Deflection']].map(([k,l])=>`<div><span>${l} R²</span><strong>${ann?fmt(ann.metrics[k].r2,3):"—"}</strong><small>${ann?`RMSE ${fmt(ann.metrics[k].rmse,2)}`:"Awaiting training"}</small></div>`).join("");
}

function renderVerification(){
  const comp=verificationComparison(result,reference);$("reference-source").value=reference.source||"";$("verification-table").innerHTML=comp.map((r,i)=>{const type=verificationFields[i].type,[,unit]=unitInfo(type);return `<tr><td>${r.label}</td><td>${fmt(displayValue(r.app,type),2)} ${unit}</td><td>${finite(r.reference)?`${fmt(displayValue(r.reference,type),2)} ${unit}`:"—"}</td><td>${r.differencePercent===null?"—":`${fmt(r.differencePercent,2)}%`}</td><td class="${r.pass===true?"pass":r.pass===false?"fail":""}">${r.pass===true?"Within 5%":r.pass===false?"Review":"Awaiting"}</td></tr>`}).join("");
  $("validation-list").innerHTML=engineValidation().map(v=>`<div><span>${esc(v.label)}</span><b class="${v.pass?"pass":"fail"}">${v.pass?"PASS":"REVIEW"}</b></div>`).join("");
}

function renderAll(){design=normalizeBridge(design);result=designBridge(design);renderInputs();renderBridge();renderOverview();renderLoading();renderChecks();renderVerification();renderReliability();}

function toast(message){const t=$("toast");t.textContent=message;t.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove("show"),2600)}
function download(name,text,type="text/plain"){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function savedProjects(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}")}catch{return{}}}
function snapshot(){return{version:3,savedAt:new Date().toISOString(),design:{...design,projectName:$("project-name").value.trim()||"Untitled RC Girder"},variables,correlations,reference}}
function exportProject(){const data=snapshot();download(`${data.design.projectName.replace(/[^a-z0-9]+/gi,"-").toLowerCase()}.rcgirder.json`,JSON.stringify(data,null,2),"application/json")}
function saveProject(){
  design.projectName=$("project-name").value.trim()||"Untitled RC Girder";
  let stored=false;
  try{const projects=savedProjects();projects[design.projectName]=snapshot();localStorage.setItem(STORAGE_KEY,JSON.stringify(projects));stored=true;refreshSaved();$("saved-projects").value=design.projectName}catch{}
  if(OFFLINE_EDITION||!stored){exportProject();toast("Project file downloaded. Use Import JSON to reopen it.")}
  else toast("Saved in this browser. Export JSON to keep a project file.");
}
function refreshSaved(){const projects=savedProjects(),selected=$("saved-projects").value;$("saved-projects").innerHTML=`<option value="">Open saved project…</option>${Object.keys(projects).sort().map(n=>`<option value="${esc(n)}" ${selected===n?"selected":""}>${esc(n)}</option>`).join("")}`}
function loadSnapshot(data){if(!data?.design)throw new Error("This is not a valid RC Girder Workbench project file.");design={...clone(BRIDGE_DEFAULTS),...data.design};variables=Array.isArray(data.variables)?data.variables.map(clone):VARIABLES.map(clone);correlations={db:.25,dAs:.15,dlLl:.10,...data.correlations};reference={source:"",mPosEd:null,mNegEd:null,vEd:null,tEd:null,deflectionMm:null,...data.reference};experiment=null;ann=null;renderVariables();renderAll();toast("Project loaded")}

function reportHtml(){
  const p=result.input,c=checkData(),nativeUnit={moment:"kN·m",force:"kN",dimMm:"mm",strength:"MPa"},checks=c.map(x=>`<tr><td>${esc(x.label)}</td><td>${fmt(x.demand,2)} ${nativeUnit[x.type]}</td><td>${fmt(x.resistance,2)} ${nativeUnit[x.type]}</td><td>${fmt(x.u,3)}</td><td>${x.u<=1?"Within":"Review"}</td></tr>`).join(""),comp=verificationComparison(result,reference).map((r,i)=>`<tr><td>${r.label}</td><td>${fmt(r.app,2)} ${nativeUnit[verificationFields[i].type]}</td><td>${finite(r.reference)?`${fmt(r.reference,2)} ${nativeUnit[verificationFields[i].type]}`:"—"}</td><td>${r.differencePercent===null?"—":fmt(r.differencePercent,2)+"%"}</td></tr>`).join("");
  return `<!doctype html><html><head><title>${esc(p.projectName)} calculation report</title><style>body{font-family:Arial,sans-serif;color:#162830;margin:34px;font-size:12px}h1,h2{font-family:Georgia,serif;font-weight:500}h1{font-size:26px;margin-bottom:4px}h2{font-size:18px;border-bottom:2px solid #183b47;padding-bottom:5px;margin-top:24px}.meta{color:#65747a}.notice{background:#fff3d7;border-left:4px solid #d99a38;padding:10px;line-height:1.5}table{width:100%;border-collapse:collapse;margin-top:8px}th,td{text-align:left;border-bottom:1px solid #d8dfdf;padding:7px}th{background:#eef2f0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}.grid div{background:#f2f4f2;padding:8px}.grid b,.grid span{display:block}.grid span{color:#69777c;margin-top:3px}@media print{body{margin:15mm}.page{break-before:page}}</style></head><body><h1>${esc(p.projectName)}</h1><p class="meta">RC Girder Workbench v3 · generated ${new Date().toLocaleString()} · ${esc(result.actions.source)}</p><p class="notice"><b>Scope:</b> transparent research and preliminary-design calculations only. Confirm the adopted standards, National Annex, load model, analysis model and detailing through independent calculations and qualified engineering review before professional use.</p><h2>Model</h2><div class="grid"><div><b>System</b><span>${p.structuralSystem}; spans ${p.spanLengthsM.join(" + ")} m</span></div><div><b>Girder</b><span>${p.sectionType}; ${p.girderDepthMm} mm + ${p.deckDepthMm} mm deck</span></div><div><b>Deck arrangement</b><span>${p.deckWidthM} m; ${p.girderCount} girders @ ${fmt(p.girderSpacingM,3)} m</span></div><div><b>Materials</b><span>fck ${p.fck} MPa; fyk ${p.fyk} MPa; Ecm ${p.ecmGPa} GPa</span></div></div><h2>Actions and checks (native SI units)</h2><table><thead><tr><th>Check</th><th>Demand</th><th>Resistance / limit</th><th>Utilisation</th><th>Status</th></tr></thead><tbody>${checks}</tbody></table><h2>Reinforcement recommendations</h2><table><tr><th>Zone</th><th>Required</th><th>Provided / suggestion</th></tr><tr><td>Bottom flexural</td><td>${fmt(result.reinforcement.positive.requiredMm2,0)} mm²</td><td>${esc(result.reinforcement.positive.recommendation.label)}</td></tr><tr><td>Support flexural</td><td>${fmt(result.reinforcement.negative.requiredMm2,0)} mm²</td><td>${esc(result.reinforcement.negative.recommendation.label)}</td></tr><tr><td>Shear links</td><td>${fmt(result.reinforcement.shear.aswPerSRequired,3)} mm²/mm</td><td>${esc(result.reinforcement.shear.recommendation)}</td></tr></table><div class="page"><h2>National Annex / project parameters</h2><div class="grid">${naFields.map(f=>`<div><b>${esc(f.label)}</b><span>${fmt(p[f.key],3)}</span></div>`).join("")}</div><h2>Independent comparison</h2><p>Source: ${esc(reference.source||"Not entered")}</p><table><thead><tr><th>Quantity</th><th>Workbench</th><th>Reference</th><th>Difference</th></tr></thead><tbody>${comp}</tbody></table><h2>Modelling assumptions and limitations</h2><ul><li>Euler–Bernoulli line-beam longitudinal analysis with six elements per span.</li><li>LM1-style notional lanes and UDL/tandem envelopes; transverse distribution is ${esc(result.distribution.method)}.</li><li>Cracking, fatigue and torsion procedures are preliminary screening checks, not a complete code clause audit.</li><li>Construction stages, prestress, creep/shrinkage, bearing and diaphragm design, seismic effects, collision, thermal actions and foundation interaction are outside the current scope.</li><li>Imported grillage values are used as supplied and are not independently validated by this app.</li></ul></div></body></html>`;
}
function printReport(){const w=window.open("","_blank");if(!w){toast("Allow pop-ups to open the report");return}w.document.write(reportHtml());w.document.close();w.focus();setTimeout(()=>w.print(),250)}

document.querySelectorAll(".tab").forEach(tab=>tab.addEventListener("click",()=>{document.querySelectorAll(".tab,.tab-panel").forEach(x=>x.classList.remove("active"));tab.classList.add("active");$(`panel-${tab.dataset.tab}`).classList.add("active");window.scrollTo({top:0,behavior:"smooth"})}));
$("unit-system").addEventListener("change",e=>{design.unitSystem=e.target.value;renderAll()});
$("project-name").addEventListener("change",e=>{design.projectName=e.target.value.trim()||"Untitled RC Girder"});
$("reset-model").addEventListener("click",()=>{design=clone(BRIDGE_DEFAULTS);reference={source:"",mPosEd:null,mNegEd:null,vEd:null,tEd:null,deflectionMm:null};invalidateResearch();renderAll();toast("Baseline restored")});
$("new-project").addEventListener("click",()=>{design=clone(BRIDGE_DEFAULTS);design.projectName="Untitled RC Girder";reference={source:"",mPosEd:null,mNegEd:null,vEd:null,tEd:null,deflectionMm:null};experiment=null;ann=null;renderAll();toast("New project started")});
$("save-project").addEventListener("click",saveProject);
$("saved-projects").addEventListener("change",e=>{if(!e.target.value)return;const item=savedProjects()[e.target.value];if(item)loadSnapshot(item)});
$("export-project").addEventListener("click",exportProject);
$("import-project").addEventListener("change",async e=>{try{loadSnapshot(JSON.parse(await e.target.files[0].text()))}catch(err){toast(err.message)}e.target.value=""});
$("grillage-file").addEventListener("change",async e=>{try{design.grillageResults=parseGrillageCsv(await e.target.files[0].text());design.useGrillageResults=true;design.distributionMethod="imported";renderAll();toast(`${design.grillageResults.length} grillage row(s) imported`)}catch(err){toast(err.message)}e.target.value=""});
$("download-template").addEventListener("click",()=>download("grillage-results-template.csv",GRILLAGE_TEMPLATE,"text/csv"));
$("reference-source").addEventListener("change",e=>reference.source=e.target.value);
$("compare-results").addEventListener("click",()=>{renderVerification();toast("Comparison updated")});
$("print-report").addEventListener("click",printReport);$("print-report-secondary").addEventListener("click",printReport);

let installPrompt=null;
window.addEventListener("beforeinstallprompt",event=>{if(OFFLINE_EDITION)return;event.preventDefault();installPrompt=event;$("install-app").hidden=false});
$("install-app").addEventListener("click",async()=>{if(!installPrompt)return;installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;$("install-app").hidden=true});
if(!OFFLINE_EDITION&&/^https?:$/.test(location.protocol)&&"serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
if(OFFLINE_EDITION){$("run-mode").textContent="Offline edition";$("storage-note").textContent="No hosting required · Save downloads a project file · Import JSON to reopen it";$("save-project").textContent="Save project file";$("install-app").hidden=true}

document.querySelectorAll("[data-corr]").forEach(el=>el.addEventListener("change",()=>{correlations[el.dataset.corr]=Number(el.value);invalidateResearch()}));
$("sync-means").addEventListener("click",()=>{const map={fck:design.fck,fyk:design.fyk,d:design.effectiveDepthMm,b:design.webWidthMm,As:design.asBottomMm2};variables.forEach(v=>{if(map[v.key]!==undefined)v.mean=map[v.key]});renderVariables();invalidateResearch();toast("Means synced to the current design")});
$("run-lhs").addEventListener("click",()=>{try{$("lhs-state").textContent="Running correlated Latin Hypercube experiment…";experiment=runExperiment({n:Number($("sample-count").value),seed:Number($("sample-seed").value),variables,correlations,design:researchDesign()});ann=null;$("lhs-state").textContent=`${experiment.n.toLocaleString()} samples complete. Equivalent governing span: ${fmt(Math.max(...design.spanLengthsM),2)} m.`;$("train-ann").disabled=false;$("export-csv").disabled=false;$("run-rbdo").disabled=true;renderReliability()}catch(err){$("lhs-state").textContent=err.message}});
$("export-csv").addEventListener("click",()=>{if(experiment)download("rc-girder-lhs-ann-dataset.csv",rowsToCsv(experiment.rows),"text/csv")});
$("train-ann").addEventListener("click",async()=>{try{$("train-ann").disabled=true;$("ann-state").textContent="Training…";ann=await trainAnn(experiment.rows,{hidden:Number($("hidden-neurons").value),epochs:Number($("ann-epochs").value),onProgress:p=>{$("ann-progress").style.width=`${p.epoch/Number($("ann-epochs").value)*100}%`;$("ann-state").textContent=`Epoch ${p.epoch} · validation loss ${fmt(p.valLoss,4)}`}});$("ann-state").textContent=`Training complete · ${ann.split.train}/${ann.split.val}/${ann.split.test} split`;$("run-rbdo").disabled=false;renderReliability()}catch(err){$("ann-state").textContent=err.message;$("train-ann").disabled=false}});
$("run-rbdo").addEventListener("click",async()=>{try{$("run-rbdo").disabled=true;$("rbdo-state").textContent="Searching the sampled design domain…";const out=await runRbdo(ann.model,variables,{targetBeta:Number($("target-beta").value),iterations:Number($("rbdo-iterations").value),onProgress:p=>$("rbdo-state").textContent=`Candidate ${p.iteration} · best βmin ${fmt(p.best?.minBeta,2)}`});const b=out.best;$("rbdo-state").textContent=out.feasible?"Feasible surrogate-assisted candidate found.":"No candidate met the target; best penalised point shown.";$("rbdo-result").innerHTML=`<div class="mini-stats"><div><span>d</span><b>${fmt(b.d,0)} mm</b></div><div><span>b</span><b>${fmt(b.b,0)} mm</b></div><div><span>As</span><b>${fmt(b.As,0)} mm²</b></div></div><p class="hint">β = ${b.betas.map(x=>fmt(x,2)).join(" / ")} · relative objective ${fmt(b.objective,3)}</p>`}catch(err){$("rbdo-state").textContent=err.message}finally{$("run-rbdo").disabled=false}});

renderVariables();refreshSaved();renderAll();
