export const BRIDGE_DEFAULTS = Object.freeze({
  projectName: "15 m RC Girder Study",
  unitSystem: "SI",
  structuralSystem: "single",
  spanLengthsM: [15],
  girderLengthM: 14.95,
  deckWidthM: 11,
  carriagewayWidthM: 7,
  leftOverhangM: 0.4,
  rightOverhangM: 0.4,
  girderCount: 7,
  arrangementMode: "fitWidth",
  girderSpacingM: 1.7,
  designGirder: 4,
  sectionType: "T",
  girderDepthMm: 950,
  deckDepthMm: 250,
  webWidthMm: 400,
  topFlangeWidthMm: 800,
  topFlangeThicknessMm: 180,
  bottomFlangeWidthMm: 600,
  bottomFlangeThicknessMm: 180,
  effectiveDepthMm: 1100,
  coverMm: 60,
  fck: 35,
  fyk: 500,
  ecmGPa: 34,
  asBottomMm2: 9000,
  asTopMm2: 6000,
  aswPerS: 2.4,
  stiffnessFactor: 0.45,
  surfacingKNm2: 2.5,
  barrierEachKNm: 10,
  otherPermanentKNm: 0,
  distributionMethod: "courbon",
  torsionFactor: 0.05,
  useGrillageResults: false,
  grillageResults: [],
  gammaG: 1.35,
  gammaQ: 1.50,
  gammaC: 1.50,
  gammaS: 1.15,
  alphaCc: 0.85,
  alphaQ1: 1.0,
  alphaQ2: 1.0,
  alphaQ3: 1.0,
  alphaq1: 1.0,
  alphaq2: 1.0,
  alphaq3: 1.0,
  psi1Traffic: 0.75,
  deflectionDenominator: 250,
  crackLimitMm: 0.30,
  fatigueSteelLimitMPa: 175,
  fatigueTrafficFactor: 0.50,
});

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const nearly=(a,b,t=1e-8)=>Math.abs(a-b)<=t;

export function normalizeBridge(input={}){
  const p={...BRIDGE_DEFAULTS,...input};
  p.spanLengthsM=(Array.isArray(p.spanLengthsM)?p.spanLengthsM:[p.spanLengthsM]).map(Number).filter(x=>x>0);
  if(!p.spanLengthsM.length)p.spanLengthsM=[15];
  p.girderCount=clamp(Math.round(Number(p.girderCount)||2),2,16);
  if(p.arrangementMode==="fitWidth")p.girderSpacingM=(p.deckWidthM-p.leftOverhangM-p.rightOverhangM)/(p.girderCount-1);
  else p.deckWidthM=p.leftOverhangM+p.rightOverhangM+p.girderSpacingM*(p.girderCount-1);
  p.designGirder=clamp(Math.round(Number(p.designGirder)||1),1,p.girderCount);
  p.structuralSystem=p.spanLengthsM.length>1?"continuous":"single";
  return p;
}

export function bridgeIssues(input={}){
  const p=normalizeBridge(input),issues=[];
  if(p.deckWidthM<=p.carriagewayWidthM)issues.push("Deck width must exceed the carriageway width.");
  if(p.girderSpacingM<0.6||p.girderSpacingM>4)issues.push("Calculated girder spacing is outside the 0.6–4.0 m prototype range.");
  if(p.leftOverhangM<0||p.rightOverhangM<0)issues.push("Deck overhangs cannot be negative.");
  if(p.girderDepthMm<=p.topFlangeThicknessMm+p.bottomFlangeThicknessMm&&p.sectionType==="I")issues.push("I-section flange depths exceed the girder depth.");
  if(p.effectiveDepthMm>=p.girderDepthMm+p.deckDepthMm-p.coverMm/2)issues.push("Effective depth is inconsistent with the total composite depth and cover.");
  const totalSpan=p.spanLengthsM.reduce((a,b)=>a+b,0);
  if(p.structuralSystem==="continuous"&&Math.abs(p.girderLengthM-totalSpan)>.5)issues.push("Continuous-girder length differs from the total analytical span length by more than 0.5 m.");
  if(p.structuralSystem==="single"&&Math.abs(p.girderLengthM-p.spanLengthsM[0])>.5)issues.push("Physical girder length differs from the analytical span by more than 0.5 m.");
  return issues;
}

function girderRectangles(p){
  const h=p.girderDepthMm,bw=p.webWidthMm,tf=p.topFlangeThicknessMm,bf=p.topFlangeWidthMm,bb=p.bottomFlangeWidthMm,tb=p.bottomFlangeThicknessMm;
  if(p.sectionType==="Rectangular")return[{b:bw,h,y0:0,label:"web"}];
  if(p.sectionType==="I")return[
    {b:bb,h:tb,y0:0,label:"bottom flange"},
    {b:bw,h:Math.max(1,h-tf-tb),y0:tb,label:"web"},
    {b:bf,h:tf,y0:h-tf,label:"top flange"},
  ];
  return[{b:bw,h:Math.max(1,h-tf),y0:0,label:"web"},{b:bf,h:tf,y0:h-tf,label:"top flange"}];
}

export function sectionProperties(input={}){
  const p=normalizeBridge(input),rects=girderRectangles(p),bf=p.girderSpacingM*1000;
  const composite=[...rects,{b:bf,h:p.deckDepthMm,y0:p.girderDepthMm,label:"deck"}];
  const props=list=>{const area=list.reduce((s,r)=>s+r.b*r.h,0),ybar=list.reduce((s,r)=>s+r.b*r.h*(r.y0+r.h/2),0)/area,I=list.reduce((s,r)=>s+r.b*r.h**3/12+r.b*r.h*(r.y0+r.h/2-ybar)**2,0);return{area,ybar,I};};
  return{girder:props(rects),composite:props(composite),rectangles:rects,compositeRectangles:composite,effectiveFlangeWidthMm:bf};
}

export function notionalLanes(input={}){
  const p=normalizeBridge(input),w=p.carriagewayWidthM,n=Math.floor(w/3),lanes=[];
  const laneCount=Math.max(1,n);
  for(let i=0;i<laneCount;i++)lanes.push({index:i+1,widthM:Math.min(3,w-i*3),qKNm2:i===0?9:2.5,tsKN:i===0?600:i===1?400:200,alphaQ:i===0?p.alphaQ1:i===1?p.alphaQ2:p.alphaQ3,alphaq:i===0?p.alphaq1:i===1?p.alphaq2:p.alphaq3});
  const used=laneCount*3;if(w>used+1e-9)lanes.push({index:"R",widthM:w-used,qKNm2:2.5,tsKN:0,alphaQ:0,alphaq:p.alphaq3});
  return lanes;
}

function girderPositions(p){const left=-p.deckWidthM/2+p.leftOverhangM;return Array.from({length:p.girderCount},(_,i)=>left+i*p.girderSpacingM);}
function unitSharesAt(y,p,method){
  const xs=girderPositions(p),n=xs.length;
  if(method==="tributary"){let k=0,d=Infinity;xs.forEach((x,i)=>{if(Math.abs(x-y)<d){d=Math.abs(x-y);k=i;}});return xs.map((_,i)=>i===k?1:0);}
  if(method==="courbon"){
    const denom=xs.reduce((s,x)=>s+x*x,0)||1,raw=xs.map(x=>Math.max(0,1/n+y*x/denom)),sum=raw.reduce((a,b)=>a+b,0)||1;return raw.map(v=>v/sum);
  }
  if(y<=xs[0])return xs.map((_,i)=>i===0?1:0);if(y>=xs[n-1])return xs.map((_,i)=>i===n-1?1:0);
  let right=1;while(xs[right]<y)right++;const left=right-1,t=(y-xs[left])/(xs[right]-xs[left]);return xs.map((_,i)=>i===left?1-t:i===right?t:0);
}

function importedRow(p){if(!p.useGrillageResults||!Array.isArray(p.grillageResults))return null;return p.grillageResults.find(r=>Number(r.girder)===p.designGirder)||null;}

export function transverseDistribution(input={}){
  const p=normalizeBridge(input),lanes=notionalLanes(p),xs=girderPositions(p),target=p.designGirder-1,method=p.distributionMethod;
  const imported=importedRow(p);
  if(imported&&Number.isFinite(Number(imported.udlShare))&&Number.isFinite(Number(imported.tsShare)))return{method:"imported",girderPositionsM:xs,udlShares:xs.map((_,i)=>i===target?Number(imported.udlShare):0),tsShares:xs.map((_,i)=>i===target?Number(imported.tsShare):0),selectedUdlShare:Number(imported.udlShare),selectedTsShare:Number(imported.tsShare),selectedGirder:p.designGirder,lanes};
  const permutations=list=>{if(list.length<=1)return[list];const out=[];list.forEach((item,i)=>permutations([...list.slice(0,i),...list.slice(i+1)]).forEach(rest=>out.push([item,...rest])));return out;};
  const evaluate=ordered=>{const start=-p.carriagewayWidthM/2,udlReactions=Array(p.girderCount).fill(0),tsReactions=Array(p.girderCount).fill(0);let totalUdl=0,totalTs=0,y0=start;for(const lane of ordered){const steps=Math.max(12,Math.ceil(lane.widthM*20)),dy=lane.widthM/steps,intensity=lane.qKNm2*lane.alphaq;for(let s=0;s<steps;s++){const y=y0+(s+.5)*dy,shares=unitSharesAt(y,p,method);shares.forEach((v,i)=>udlReactions[i]+=intensity*dy*v);totalUdl+=intensity*dy;}if(lane.tsKN>0){const center=y0+lane.widthM/2,wheelYs=[center-1,center+1],wheelP=lane.tsKN*lane.alphaQ/2;for(const y of wheelYs){const shares=unitSharesAt(clamp(y,-p.deckWidthM/2,p.deckWidthM/2),p,method);shares.forEach((v,i)=>tsReactions[i]+=wheelP*v);totalTs+=wheelP;}}y0+=lane.widthM;}return{ordered,udlReactions,tsReactions,totalUdl,totalTs,score:udlReactions[target]+tsReactions[target]/Math.max(1,p.carriagewayWidthM)};};
  const candidates=lanes.length<=6?permutations(lanes).map(evaluate):[evaluate(lanes)],best=candidates.sort((a,b)=>b.score-a.score)[0],{udlReactions,tsReactions,totalUdl,totalTs}=best;
  const udlShares=udlReactions.map(v=>v/(totalUdl||1)),tsShares=tsReactions.map(v=>v/(totalTs||1));
  return{method,girderPositionsM:xs,udlShares,tsShares,selectedUdlShare:udlShares[target],selectedTsShare:tsShares[target],selectedGirder:p.designGirder,lanes,bestLaneOrder:best.ordered.map(x=>x.index),totalBridgeUdlKNm:totalUdl,totalBridgeTSKN:totalTs};
}

function solveLinear(A,b){const n=b.length,M=A.map((r,i)=>[...r,b[i]]);for(let k=0;k<n;k++){let pivot=k;for(let i=k+1;i<n;i++)if(Math.abs(M[i][k])>Math.abs(M[pivot][k]))pivot=i;[M[k],M[pivot]]=[M[pivot],M[k]];const d=M[k][k];if(Math.abs(d)<1e-12)throw new Error("Beam stiffness matrix is singular");for(let j=k;j<=n;j++)M[k][j]/=d;for(let i=0;i<n;i++){if(i===k)continue;const f=M[i][k];if(Math.abs(f)<1e-18)continue;for(let j=k;j<=n;j++)M[i][j]-=f*M[k][j];}}return M.map(r=>r[n]);}

function createBeam(spansM,EI,elementsPerSpan=6){
  const nodes=[0],spanOfElement=[];let x=0;for(let s=0;s<spansM.length;s++){const le=spansM[s]*1000/elementsPerSpan;for(let e=0;e<elementsPerSpan;e++){x+=le;nodes.push(x);spanOfElement.push(s);}}
  const nd=nodes.length*2,K=Array.from({length:nd},()=>Array(nd).fill(0));
  for(let e=0;e<nodes.length-1;e++){const L=nodes[e+1]-nodes[e],c=EI/L**3,k=[[12,6*L,-12,6*L],[6*L,4*L**2,-6*L,2*L**2],[-12,-6*L,12,-6*L],[6*L,2*L**2,-6*L,4*L**2]];const map=[2*e,2*e+1,2*e+2,2*e+3];for(let i=0;i<4;i++)for(let j=0;j<4;j++)K[map[i]][map[j]]+=c*k[i][j];}
  const supportNodes=[0];let acc=0;for(const span of spansM){acc+=span*1000;supportNodes.push(nodes.findIndex(n=>nearly(n,acc,.01)));}const fixed=new Set(supportNodes.map(i=>2*i)),free=Array.from({length:nd},(_,i)=>i).filter(i=>!fixed.has(i));return{nodes,spanOfElement,K,free,fixed,EI,elementsPerSpan,spansM};
}

function analyseBeamCase(model,udlBySpan=[],points=[]){
  const {nodes,spanOfElement,K,free,EI}=model,nd=nodes.length*2,F=Array(nd).fill(0),elementLoads=[];
  for(let e=0;e<nodes.length-1;e++){const L=nodes[e+1]-nodes[e],q=Number(udlBySpan[spanOfElement[e]]||0),fe=[-q*L/2,-q*L**2/12,-q*L/2,q*L**2/12];elementLoads[e]=[...fe];const map=[2*e,2*e+1,2*e+2,2*e+3];fe.forEach((v,i)=>F[map[i]]+=v);}
  for(const pt of points){const xp=pt.xM*1000,P=Number(pt.pKN)*1000;let e=nodes.findIndex((n,i)=>i<nodes.length-1&&xp>=n-1e-6&&xp<=nodes[i+1]+1e-6);if(e<0)e=nodes.length-2;const L=nodes[e+1]-nodes[e],xi=clamp((xp-nodes[e])/L,0,1),N=[1-3*xi**2+2*xi**3,L*(xi-2*xi**2+xi**3),3*xi**2-2*xi**3,L*(-(xi**2)+xi**3)],map=[2*e,2*e+1,2*e+2,2*e+3];N.forEach((v,i)=>{F[map[i]]-=P*v;elementLoads[e][i]-=P*v;});}
  const Kff=free.map(i=>free.map(j=>K[i][j])),Ff=free.map(i=>F[i]),uf=solveLinear(Kff,Ff),u=Array(nd).fill(0);free.forEach((d,i)=>u[d]=uf[i]);
  let maxPos=-Infinity,minNeg=Infinity,maxAbsV=0,maxDeflection=0;const stations=[];
  for(let e=0;e<nodes.length-1;e++){const L=nodes[e+1]-nodes[e],ue=[u[2*e],u[2*e+1],u[2*e+2],u[2*e+3]];for(let s=0;s<=5;s++){const xi=s/5,x=nodes[e]+xi*L,d2=[(-6+12*xi)/L**2,(-4+6*xi)/L,(6-12*xi)/L**2,(-2+6*xi)/L],d3=[12/L**3,6/L**2,-12/L**3,6/L**2],N=[1-3*xi**2+2*xi**3,L*(xi-2*xi**2+xi**3),3*xi**2-2*xi**3,L*(-(xi**2)+xi**3)],moment=EI*d2.reduce((a,v,i)=>a+v*ue[i],0)/1e6,shear=EI*d3.reduce((a,v,i)=>a+v*ue[i],0)/1000,defl=N.reduce((a,v,i)=>a+v*ue[i],0);maxPos=Math.max(maxPos,moment);minNeg=Math.min(minNeg,moment);maxAbsV=Math.max(maxAbsV,Math.abs(shear));maxDeflection=Math.max(maxDeflection,Math.abs(defl));stations.push({xM:x/1000,momentKNm:moment,shearKN:shear,deflectionMm:defl});}}
  return{maxPos:Math.max(0,maxPos),minNeg:Math.min(0,minNeg),maxAbsV,maxDeflection,stations};
}

function envelope(cases){return cases.reduce((a,r)=>({maxPos:Math.max(a.maxPos,r.maxPos),minNeg:Math.min(a.minNeg,r.minNeg),maxAbsV:Math.max(a.maxAbsV,r.maxAbsV),maxDeflection:Math.max(a.maxDeflection,r.maxDeflection)}),{maxPos:0,minNeg:0,maxAbsV:0,maxDeflection:0});}

function trafficEnvelopes(model,spans,udl,ts){
  const patterns=[];for(let mask=1;mask<(1<<spans.length);mask++)patterns.push(spans.map((_,i)=>mask&(1<<i)?udl:0));
  const udlEnv=envelope(patterns.map(q=>analyseBeamCase(model,q,[]))),length=spans.reduce((a,b)=>a+b,0),gap=1.2,pointCases=[];
  const step=Math.max(.25,length/90);for(let x=.05;x<=length-gap-.05;x+=step)pointCases.push(analyseBeamCase(model,spans.map(()=>0),[{xM:x,pKN:ts/2},{xM:x+gap,pKN:ts/2}]));
  return{udl:udlEnv,ts:envelope(pointCases)};
}

function compressionLayers(p,direction="positive"){
  if(direction==="positive"){
    const layers=[{width:p.girderSpacingM*1000,depth:p.deckDepthMm}];
    if(p.sectionType!=="Rectangular")layers.push({width:p.topFlangeWidthMm,depth:p.topFlangeThicknessMm});
    layers.push({width:p.webWidthMm,depth:p.girderDepthMm-(p.sectionType==="Rectangular"?0:p.topFlangeThicknessMm)});return layers;
  }
  const layers=[];if(p.sectionType==="I")layers.push({width:p.bottomFlangeWidthMm,depth:p.bottomFlangeThicknessMm});layers.push({width:p.webWidthMm,depth:p.girderDepthMm-(p.sectionType==="I"?p.bottomFlangeThicknessMm:0)});return layers;
}

function flexuralResistance(p,As,direction="positive"){
  const fcd=p.alphaCc*p.fck/p.gammaC,fyd=p.fyk/p.gammaS,T=As*fyd,layers=compressionLayers(p,direction);let remaining=T,fromTop=0,moment=0,blockDepth=0;
  for(const layer of layers){const cap=fcd*layer.width*layer.depth,take=Math.min(remaining,cap),used=take/(fcd*layer.width),centroid=fromTop+used/2;moment+=take*centroid;remaining-=take;blockDepth=fromTop+used;fromTop+=layer.depth;if(remaining<=1e-6)break;}
  const effectiveD=direction==="positive"?p.effectiveDepthMm:p.girderDepthMm-p.coverMm;
  const mRd=remaining>1e-3?0:(T*effectiveD-moment)/1e6;return{mRd:Math.max(0,mRd),blockDepth,x:blockDepth/.8,xOverD:blockDepth/.8/effectiveD};
}

function requiredSteel(p,demand,direction="positive"){
  const props=sectionProperties(p),bt=direction==="positive"?p.webWidthMm:(p.sectionType==="I"?p.bottomFlangeWidthMm:p.webWidthMm),d=direction==="positive"?p.effectiveDepthMm:p.girderDepthMm-p.coverMm,fctm=.3*p.fck**(2/3),minAs=Math.max(.26*fctm/p.fyk*bt*d,.0013*bt*d),maxAs=.04*props.girder.area;
  let lo=minAs,hi=maxAs;if(flexuralResistance(p,hi,direction).mRd<demand)return{required:maxAs,minAs,maxAs,adequate:false};for(let i=0;i<55;i++){const mid=(lo+hi)/2;if(flexuralResistance(p,mid,direction).mRd>=demand)hi=mid;else lo=mid;}return{required:Math.max(minAs,hi),minAs,maxAs,adequate:true};
}

function recommendBars(area,width,cover){let best=null;for(const dia of[16,20,25,32,40]){const bar=Math.PI*dia**2/4,n=Math.ceil(area/bar),perLayer=Math.max(2,Math.floor((width-2*cover+25)/(dia+25))),layers=Math.ceil(n/perLayer),provided=n*bar,score=provided/area+layers*.03+(dia>=40?.05:0);if(!best||score<best.score)best={diameter:dia,count:n,layers,provided,score,label:`${n}Y${dia}${layers>1?` in ${layers} layers`:""}`};}return best;}

function crackCheck(p,mService,As){
  const h=p.girderDepthMm+p.deckDepthMm,d=p.effectiveDepthMm,z=.9*d,sigma=mService*1e6/(Math.max(As,1)*z),fctm=.3*p.fck**(2/3),Es=200000,alphaE=Es/(p.ecmGPa*1000),hceff=Math.max(1,Math.min(2.5*(h-d),(h-d*.35)/3,h/2)),aceff=p.webWidthMm*hceff,rho=Math.max(1e-5,As/aceff),phi=25,srmax=3.4*p.coverMm+.8*.5*.425*phi/rho,eps=Math.max((sigma-.6*fctm/rho*(1+alphaE*rho))/Es,.6*sigma/Es),wk=Math.max(0,srmax*eps);return{wkMm:wk,limitMm:p.crackLimitMm,util:wk/p.crackLimitMm,steelStressMPa:sigma,srmaxMm:srmax};
}

function torsionCheck(p,tEd,vEd){
  const fcd=p.alphaCc*p.fck/p.gammaC,fyd=p.fyk/p.gammaS,h=p.girderDepthMm+p.deckDepthMm,c=p.coverMm,ak=Math.max(1,(p.webWidthMm-2*c)*(h-2*c)),uk=2*((p.webWidthMm-2*c)+(h-2*c)),teff=Math.max(1,ak/uk),nu1=.6*(1-p.fck/250),tRdMax=2*nu1*fcd*ak*teff/2/1e6,aswT=tEd*1e6/(2*ak*fyd),aslT=tEd*1e6*uk/(2*ak*fyd),torsionOnlyUtil=tEd/Math.max(1,tRdMax),combinedUtil=vEd/Math.max(1,torsionCheck.lastVmax||Infinity)+torsionOnlyUtil;return{tEd,tRdMax,util:combinedUtil,torsionOnlyUtil,combinedUtil,aswPerSRequired:aswT,aslRequired:aslT};
}

export function designBridge(input={}){
  const p=normalizeBridge(input),issues=bridgeIssues(p),props=sectionProperties(p),dist=transverseDistribution(p),spans=p.spanLengthsM;
  const girderAreaM2=props.girder.area/1e6,deckAreaM2=p.girderSpacingM*p.deckDepthMm/1000,selfWeight=25*(girderAreaM2+deckAreaM2),permanent=selfWeight+p.surfacingKNm2*p.girderSpacingM+2*p.barrierEachKNm/p.girderCount+p.otherPermanentKNm;
  const trafficUdl=(dist.totalBridgeUdlKNm??notionalLanes(p).reduce((s,l)=>s+l.qKNm2*l.alphaq*l.widthM,0))*dist.selectedUdlShare,trafficTS=(dist.totalBridgeTSKN??notionalLanes(p).reduce((s,l)=>s+l.tsKN*l.alphaQ,0))*dist.selectedTsShare;
  const EI=p.ecmGPa*1000*props.composite.I*p.stiffnessFactor,model=createBeam(spans,EI),g=analyseBeamCase(model,spans.map(()=>permanent),[]),q=trafficEnvelopes(model,spans,trafficUdl,trafficTS);
  let actions={mPosEd:p.gammaG*g.maxPos+p.gammaQ*(q.udl.maxPos+q.ts.maxPos),mNegEd:Math.abs(p.gammaG*g.minNeg+p.gammaQ*(q.udl.minNeg+q.ts.minNeg)),vEd:p.gammaG*g.maxAbsV+p.gammaQ*(q.udl.maxAbsV+q.ts.maxAbsV),mService:g.maxPos+p.psi1Traffic*(q.udl.maxPos+q.ts.maxPos),deflectionMm:g.maxDeflection+q.udl.maxDeflection+q.ts.maxDeflection,tEd:0,source:"internal beam + transverse model"};
  actions.tEd=p.torsionFactor*Math.max(actions.mPosEd,actions.mNegEd);
  const imp=importedRow(p);if(imp){actions={mPosEd:Number(imp.mUlsPosKNm??actions.mPosEd),mNegEd:Number(imp.mUlsNegKNm??actions.mNegEd),vEd:Number(imp.vUlsKN??actions.vEd),tEd:Number(imp.tUlsKNm??actions.tEd),mService:Number(imp.mSlsKNm??actions.mService),deflectionMm:Number(imp.deflectionMm??actions.deflectionMm),source:"imported grillage results"};}
  const pos=flexuralResistance(p,p.asBottomMm2,"positive"),neg=flexuralResistance(p,p.asTopMm2,"negative"),reqPos=requiredSteel(p,actions.mPosEd,"positive"),reqNeg=requiredSteel(p,actions.mNegEd,"negative"),barsPos=recommendBars(reqPos.required,p.webWidthMm,p.coverMm),barsNeg=recommendBars(reqNeg.required,p.sectionType==="I"?p.bottomFlangeWidthMm:p.webWidthMm,p.coverMm);
  const rho=clamp(p.asBottomMm2/(p.webWidthMm*p.effectiveDepthMm),0,.02),k=Math.min(2,1+Math.sqrt(200/p.effectiveDepthMm)),vRdc=Math.max(.12*k*Math.cbrt(100*rho*p.fck),.035*k**1.5*Math.sqrt(p.fck))*p.webWidthMm*p.effectiveDepthMm/1000,z=.9*p.effectiveDepthMm,fywd=p.fyk/p.gammaS,vRds=p.aswPerS*z*fywd/1000,nu1=.6*(1-p.fck/250),vRdMax=p.webWidthMm*z*nu1*(p.alphaCc*p.fck/p.gammaC)/2/1000,vRd=Math.max(vRdc,Math.min(vRds,vRdMax)),aswReq=actions.vEd<=vRdc?0:actions.vEd*1000/(z*fywd),linkSpacing=Math.max(75,Math.min(300,Math.floor((4*Math.PI*12**2/4/Math.max(aswReq,.001))/25)*25));
  torsionCheck.lastVmax=vRdMax;const torsion=torsionCheck(p,actions.tEd,actions.vEd),crack=crackCheck(p,actions.mService,p.asBottomMm2),deflectionLimit=Math.min(...spans)*1000/p.deflectionDenominator,deltaM=p.fatigueTrafficFactor*(q.udl.maxPos+q.ts.maxPos),fatigueStress=deltaM*1e6/(p.asBottomMm2*.9*p.effectiveDepthMm),fatigue={stressRangeMPa:fatigueStress,limitMPa:p.fatigueSteelLimitMPa,util:fatigueStress/p.fatigueSteelLimitMPa};
  const checks={flexurePos:{demand:actions.mPosEd,resistance:pos.mRd,util:actions.mPosEd/pos.mRd},flexureNeg:{demand:actions.mNegEd,resistance:neg.mRd,util:actions.mNegEd/Math.max(neg.mRd,1)},shear:{demand:actions.vEd,resistance:vRd,util:actions.vEd/vRd,vRdc,vRds,vRdMax},torsion,cracking:crack,deflection:{valueMm:actions.deflectionMm,limitMm:deflectionLimit,util:actions.deflectionMm/deflectionLimit},fatigue};
  const reinforcement={positive:{requiredMm2:reqPos.required,providedMm2:p.asBottomMm2,recommendation:barsPos},negative:{requiredMm2:reqNeg.required,providedMm2:p.asTopMm2,recommendation:barsNeg},shear:{aswPerSRequired:aswReq,provided:p.aswPerS,recommendation:`4Y12 links @ ${linkSpacing} mm c/c`},torsion:{longitudinalRequiredMm2:torsion.aslRequired,transverseRequired:torsion.aswPerSRequired}};
  const allUtils=[checks.flexurePos.util,checks.flexureNeg.util,checks.shear.util,checks.torsion.util,checks.cracking.util,checks.deflection.util,checks.fatigue.util].filter(Number.isFinite),status=allUtils.every(u=>u<=1)&&!issues.length?"Within prototype checks":"Review required";
  return{input:p,issues,properties:props,distribution:dist,lanes:notionalLanes(p),loads:{selfWeight,permanent,trafficUdl,trafficTS},actions,checks,reinforcement,envelopes:{permanent:g,trafficUdl:q.udl,trafficTS:q.ts},status,governingUtil:Math.max(...allUtils)};
}

export function parseGrillageCsv(text){
  const lines=String(text).trim().split(/\r?\n/).filter(Boolean);if(lines.length<2)throw new Error("The grillage file needs a header and at least one data row.");const norm=s=>s.trim().toLowerCase().replace(/[^a-z0-9]+/g,""),heads=lines[0].split(",").map(norm),aliases={girder:["girder","girderno","beam","beamno"],udlShare:["udlshare","udlfactor"],tsShare:["tsshare","tsfactor","tandemfactor"],mUlsPosKNm:["mulsposknm","mposknm","mpositiveknm"],mUlsNegKNm:["mulsnegknm","mnegknm","mnegativeknm"],vUlsKN:["vulskn","vkn","shearkn"],tUlsKNm:["tulsknm","tknm","torsionknm"],mSlsKNm:["mslsknm","mserviceknm"],deflectionMm:["deflectionmm","deltamm"]};const index={};for(const[k,vals]of Object.entries(aliases))index[k]=heads.findIndex(h=>vals.includes(h));if(index.girder<0)throw new Error("The grillage CSV must include a girder column.");
  return lines.slice(1).map(line=>{const cells=line.split(","),row={};for(const[k,i]of Object.entries(index))if(i>=0&&cells[i]!=="")row[k]=Number(cells[i]);return row;}).filter(r=>Number.isFinite(r.girder));
}

export const GRILLAGE_TEMPLATE="girder,udl_share,ts_share,m_uls_pos_knm,m_uls_neg_knm,v_uls_kn,t_uls_knm,m_sls_knm,deflection_mm\n1,0.10,0.08,0,0,0,0,0,0\n";

export function verificationComparison(result,reference={}){const pairs=[[
  "Positive moment",result.actions.mPosEd,Number(reference.mPosEd)],
  ["Negative moment",result.actions.mNegEd,Number(reference.mNegEd)],
  ["Shear",result.actions.vEd,Number(reference.vEd)],
  ["Torsion",result.actions.tEd,Number(reference.tEd)],
  ["Deflection",result.actions.deflectionMm,Number(reference.deflectionMm)]
];return pairs.map(([label,app,ref])=>({label,app,reference:ref,differencePercent:Number.isFinite(ref)&&Math.abs(ref)>1e-9?(app-ref)/ref*100:null,pass:Number.isFinite(ref)&&Math.abs(ref)>1e-9?Math.abs((app-ref)/ref*100)<=5:null}));}

export function engineValidation(){
  const single=designBridge(),rect=designBridge({...BRIDGE_DEFAULTS,sectionType:"Rectangular"}),continuous=designBridge({...BRIDGE_DEFAULTS,spanLengthsM:[15,15],girderLengthM:30});return[
    {label:"Width/spacing relationship",pass:nearly(single.input.deckWidthM,single.input.leftOverhangM+single.input.rightOverhangM+(single.input.girderCount-1)*single.input.girderSpacingM,1e-9)},
    {label:"Single-span simply supported moment",pass:single.actions.mPosEd>0&&single.actions.mNegEd<1e-4},
    {label:"Continuous model develops hogging",pass:continuous.actions.mNegEd>0},
    {label:"Section choices change stiffness",pass:Math.abs(rect.properties.composite.I-single.properties.composite.I)>1e6},
    {label:"Distribution shares conserve load",pass:Math.abs(single.distribution.udlShares.reduce((a,b)=>a+b,0)-1)<1e-6&&Math.abs(single.distribution.tsShares.reduce((a,b)=>a+b,0)-1)<1e-6},
    {label:"All requested check utilisations finite",pass:Object.values(single.checks).every(c=>Number.isFinite(c.util))},
  ];}
