export const DESIGN = Object.freeze({
  spanM: 15, girders: 7, deckWidthM: 11, carriagewayM: 7,
  girderDepthMm: 950, deckDepthMm: 250, spacingM: 1.7,
  webWidthMm: 400, effectiveDepthMm: 1100, fck: 35, fyk: 500,
  asMm2: 9000, aswPerS: 2.4, ecmGPa: 34, stiffnessFactor: 0.45,
  surfacingKNm2: 2.5, barriersTotalKNm: 20,
  udlShare: 0.35, tsShare: 0.35, gammaG: 1.35, gammaQ: 1.5,
  alphaCc: 0.85, gammaC: 1.5, gammaS: 1.15, deflectionDenominator: 250,
});

export const VARIABLES = [
  { key: "fck", label: "fck", unit: "MPa", distribution: "lognormal", mean: 35, cov: 0.10, lower: 25, upper: 50 },
  { key: "fyk", label: "fyk", unit: "MPa", distribution: "normal", mean: 500, cov: 0.05, lower: 435, upper: 600 },
  { key: "d", label: "d", unit: "mm", distribution: "normal", mean: 1100, cov: 0.02, lower: 1030, upper: 1170 },
  { key: "b", label: "b", unit: "mm", distribution: "normal", mean: 400, cov: 0.03, lower: 350, upper: 450 },
  { key: "As", label: "As", unit: "mm²", distribution: "normal", mean: 9000, cov: 0.03, lower: 7800, upper: 10500 },
  { key: "DL", label: "DL factor", unit: "—", distribution: "normal", mean: 1.0, cov: 0.10, lower: 0.70, upper: 1.30 },
  { key: "LL", label: "LL factor", unit: "—", distribution: "lognormal", mean: 1.0, cov: 0.20, lower: 0.50, upper: 1.70 },
];

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
const std = xs => { const m = mean(xs); return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, xs.length - 1)); };

export function erf(x) {
  const sign = x < 0 ? -1 : 1, a = Math.abs(x), t = 1 / (1 + 0.3275911 * a);
  return sign * (1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a)));
}
export const normalCdf = x => 0.5 * (1 + erf(x / Math.SQRT2));
export function invNormal(p) {
  p = clamp(p, 1e-12, 1 - 1e-12);
  const a = [-39.6968302866538,220.946098424521,-275.928510446969,138.357751867269,-30.6647980661472,2.50662827745924];
  const b = [-54.4760987982241,161.585836858041,-155.698979859887,66.8013118877197,-13.2806815528857];
  const c = [-0.00778489400243029,-0.322396458041136,-2.40075827716184,-2.54973253934373,4.37466414146497,2.93816398269878];
  const d = [0.00778469570904146,0.32246712907004,2.445134137143,3.75440866190742];
  const pl = 0.02425, ph = 1 - pl; let q, r;
  if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
  if (p > ph) { q = Math.sqrt(-2 * Math.log(1-p)); return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
  q = p - .5; r = q*q;
  return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
}

function tsMidMoment(totalP, L) {
  const gap = 1.2, each = totalP / 2, mid = L / 2; let best = 0;
  for (let x = 0; x <= L-gap; x += .03) {
    const positions = [x, x+gap]; let M = 0;
    for (const a of positions) M += a <= mid ? each*a*(L-mid)/L : each*mid*(L-a)/L;
    best = Math.max(best, M);
  }
  return best;
}
function tsSupportShear(totalP, L) { const each = totalP/2; return each*(L-.05)/L + each*(L-1.25)/L; }
function pointDeflectionAt(P, a, x, L, EI) {
  const b = L-a;
  if (x <= a) return P*b*x*(L*L-b*b-x*x)/(6*L*EI);
  const lx = L-x; return P*a*lx*(L*L-a*a-lx*lx)/(6*L*EI);
}

export function eurocodeModel(overrides = {}, random = {}) {
  const p = { ...DESIGN, ...overrides };
  const fck = random.fck ?? p.fck, fyk = random.fyk ?? p.fyk;
  const d = random.d ?? p.effectiveDepthMm, bw = random.b ?? p.webWidthMm, As = random.As ?? p.asMm2;
  const dl = random.DL ?? 1, ll = random.LL ?? 1;
  const Lm = p.spanM, L = Lm*1000, bf = p.spacingM*1000, tf = p.deckDepthMm, hg = p.girderDepthMm;
  const selfWeight = 25*(bw/1000)*(hg/1000) + 25*p.spacingM*(tf/1000);
  const permanent = selfWeight + p.surfacingKNm2*p.spacingM + p.barriersTotalKNm/p.girders;
  const lm1BridgeUdl = 9*3 + 2.5*3 + 2.5*Math.max(0,p.carriagewayM-6);
  const trafficUdl = lm1BridgeUdl*p.udlShare;
  const trafficTS = 600*p.tsShare;
  const mG = permanent*dl*Lm**2/8, vG = permanent*dl*Lm/2;
  const mQ = trafficUdl*ll*Lm**2/8 + tsMidMoment(trafficTS*ll,Lm);
  const vQ = trafficUdl*ll*Lm/2 + tsSupportShear(trafficTS*ll,Lm);
  const mEd = p.gammaG*mG + p.gammaQ*mQ, vEd = p.gammaG*vG + p.gammaQ*vQ;

  const fcd = p.alphaCc*fck/p.gammaC, fyd = fyk/p.gammaS, T = As*fyd;
  const flangeCapacity = fcd*bf*tf; let a;
  if (T <= flangeCapacity) a = T/(fcd*bf); else a = tf + (T-flangeCapacity)/(fcd*bw);
  const af = Math.min(a,tf), Cflange=fcd*bf*af, Cweb=a>tf?fcd*bw*(a-tf):0;
  const mRd=(Cflange*(d-af/2)+Cweb*(d-(tf+(a-tf)/2)))/1e6;
  const x=a/.8, ductility=x/d;

  const rho=clamp(As/(bw*d),0,.02), k=Math.min(2,1+Math.sqrt(200/d));
  const vrdc=Math.max(.12*k*Math.cbrt(100*rho*fck),.035*k**1.5*Math.sqrt(fck));
  const vRdC=vrdc*bw*d/1000, z=.9*d, fywd=fyk/p.gammaS, cotTheta=1;
  const vRdS=p.aswPerS*z*fywd*cotTheta/1000, nu1=.6*(1-fck/250);
  const vRdMax=bw*z*nu1*fcd/(cotTheta+1/cotTheta)/1000;
  const vRd=Math.max(vRdC,Math.min(vRdS,vRdMax));

  const aWeb=bw*hg,aFlange=bf*tf,yWeb=hg/2,yFlange=hg+tf/2;
  const ybar=(aWeb*yWeb+aFlange*yFlange)/(aWeb+aFlange);
  const iGross=bw*hg**3/12+aWeb*(ybar-yWeb)**2+bf*tf**3/12+aFlange*(yFlange-ybar)**2;
  const EI=p.ecmGPa*1000*iGross*p.stiffnessFactor;
  const serviceUdl=permanent*dl+trafficUdl*ll;
  const deltaUdl=5*serviceUdl*L**4/(384*EI);
  const gap=1200, first=(L-gap)/2, second=first+gap, each=trafficTS*ll*1000/2;
  const deltaTS=pointDeflectionAt(each,first,L/2,L,EI)+pointDeflectionAt(each,second,L/2,L,EI);
  const deflection=deltaUdl+deltaTS, deflectionLimit=L/p.deflectionDenominator;
  return {
    input:{...p,fck,fyk,d,bw,As,dl,ll}, loads:{selfWeight,permanent,lm1BridgeUdl,trafficUdl,trafficTS,mG,mQ,vG,vQ},
    flexure:{mEd,mRd,util:mEd/mRd,a,x,xOverD:ductility}, shear:{vEd,vRd,vRdC,vRdS,vRdMax,util:vEd/vRd},
    deflection:{value:deflection,limit:deflectionLimit,util:deflection/deflectionLimit,iGross},
    g:{flexure:mRd-mEd,shear:vRd-vEd,deflection:deflectionLimit-deflection},
  };
}

function seeded(seed=1234567){let x=seed|0;return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296;};}
function shuffle(a,rng){for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function cholesky(A){const n=A.length,L=Array.from({length:n},()=>Array(n).fill(0));for(let i=0;i<n;i++)for(let j=0;j<=i;j++){let s=0;for(let k=0;k<j;k++)s+=L[i][k]*L[j][k];if(i===j){const v=A[i][i]-s;if(v<=1e-10)throw new Error("Correlation matrix is not positive definite");L[i][j]=Math.sqrt(v);}else L[i][j]=(A[i][j]-s)/L[j][j];}return L;}
function quantile(u,v){if(v.distribution==="uniform")return v.lower+u*(v.upper-v.lower);const z=invNormal(u);let x;if(v.distribution==="lognormal"){const sigma=Math.sqrt(Math.log(1+v.cov**2)),mu=Math.log(v.mean)-sigma*sigma/2;x=Math.exp(mu+sigma*z);}else x=v.mean+v.mean*v.cov*z;return clamp(x,v.lower,v.upper);}

export function makeCorrelation(vars, correlations={}){
  const n=vars.length,A=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>i===j?1:0));
  const pairs=[["d","b",correlations.db??.25],["d","As",correlations.dAs??.15],["DL","LL",correlations.dlLl??.10]];
  for(const[a,b,r]of pairs){const i=vars.findIndex(v=>v.key===a),j=vars.findIndex(v=>v.key===b);if(i>=0&&j>=0)A[i][j]=A[j][i]=clamp(Number(r),-.75,.75);}return A;
}

export function latinHypercube(n,variables=VARIABLES,correlations={},seed=7341){
  n=clamp(Math.round(n),100,10000);const rng=seeded(seed),k=variables.length;
  const cols=Array.from({length:k},()=>shuffle(Array.from({length:n},(_,i)=>(i+rng())/n),rng));
  const L=cholesky(makeCorrelation(variables,correlations));
  return Array.from({length:n},(_,row)=>{const z=cols.map(col=>invNormal(col[row]));const cz=L.map((li,i)=>li.slice(0,i+1).reduce((s,l,j)=>s+l*z[j],0));const obj={};variables.forEach((v,j)=>obj[v.key]=quantile(normalCdf(cz[j]),v));return obj;});
}

function betaFromPf(pf,n){const adjusted=clamp(pf,0.5/n,1-0.5/n);return-invNormal(adjusted);}
export function runExperiment({n=1000,variables=VARIABLES,correlations={},design=DESIGN,seed=7341}={}){
  const samples=latinHypercube(n,variables,correlations,seed);const rows=samples.map((sample,i)=>{const r=eurocodeModel(design,sample);return{id:i+1,...sample,gM:r.g.flexure,gV:r.g.shear,gD:r.g.deflection,mEd:r.flexure.mEd,mRd:r.flexure.mRd,vEd:r.shear.vEd,vRd:r.shear.vRd,deflection:r.deflection.value,systemFail:r.g.flexure<=0||r.g.shear<=0||r.g.deflection<=0};});
  const pf={flexure:rows.filter(r=>r.gM<=0).length/rows.length,shear:rows.filter(r=>r.gV<=0).length/rows.length,deflection:rows.filter(r=>r.gD<=0).length/rows.length,system:rows.filter(r=>r.systemFail).length/rows.length};
  const beta={flexure:betaFromPf(pf.flexure,rows.length),shear:betaFromPf(pf.shear,rows.length),deflection:betaFromPf(pf.deflection,rows.length),system:betaFromPf(pf.system,rows.length)};
  return{rows,pf,beta,n:rows.length,seed};
}

const zeros=(r,c)=>Array.from({length:r},()=>Array(c).fill(0));
function statsMatrix(rows,keys){const mu=keys.map(k=>mean(rows.map(r=>r[k]))),sd=keys.map((k,j)=>Math.max(1e-9,std(rows.map(r=>r[k]))));return{mu,sd};}
function normalizeRow(row,keys,s){return keys.map((k,j)=>(row[k]-s.mu[j])/s.sd[j]);}
export async function trainAnn(rows,{epochs=180,hidden=14,seed=811,onProgress=()=>{}}={}){
  if(!rows||rows.length<200)throw new Error("Run at least 200 LHS samples first.");
  const xKeys=["fck","fyk","d","b","As","DL","LL"],yKeys=["gM","gV","gD"],rng=seeded(seed);
  const order=shuffle([...rows.keys()],rng),nTrain=Math.floor(rows.length*.7),nVal=Math.floor(rows.length*.15);
  const train=order.slice(0,nTrain),val=order.slice(nTrain,nTrain+nVal),test=order.slice(nTrain+nVal);
  const xs=statsMatrix(train.map(i=>rows[i]),xKeys),ys=statsMatrix(train.map(i=>rows[i]),yKeys);
  const X=rows.map(r=>normalizeRow(r,xKeys,xs)),Y=rows.map(r=>normalizeRow(r,yKeys,ys));const I=xKeys.length,O=yKeys.length,H=hidden;
  const W1=Array.from({length:I},()=>Array.from({length:H},()=>(rng()-.5)*.35)),b1=Array(H).fill(0),W2=Array.from({length:H},()=>Array.from({length:O},()=>(rng()-.5)*.35)),b2=Array(O).fill(0);
  const params=[W1,b1,W2,b2],m=[zeros(I,H),Array(H).fill(0),zeros(H,O),Array(O).fill(0)],v=[zeros(I,H),Array(H).fill(0),zeros(H,O),Array(O).fill(0)];let step=0;
  const forward=x=>{const h=Array.from({length:H},(_,j)=>Math.tanh(b1[j]+x.reduce((s,xi,k)=>s+xi*W1[k][j],0)));const y=Array.from({length:O},(_,o)=>b2[o]+h.reduce((s,hj,j)=>s+hj*W2[j][o],0));return{h,y};};
  const loss=ids=>mean(ids.flatMap(i=>{const pr=forward(X[i]).y;return pr.map((p,o)=>(p-Y[i][o])**2);}));
  for(let epoch=1;epoch<=epochs;epoch++){
    shuffle(train,rng);for(let start=0;start<train.length;start+=64){const ids=train.slice(start,start+64),g=[zeros(I,H),Array(H).fill(0),zeros(H,O),Array(O).fill(0)];for(const idx of ids){const {h,y}=forward(X[idx]),dy=y.map((q,o)=>2*(q-Y[idx][o])/O);for(let j=0;j<H;j++)for(let o=0;o<O;o++)g[2][j][o]+=dy[o]*h[j];for(let o=0;o<O;o++)g[3][o]+=dy[o];const dh=h.map((hj,j)=>(1-hj*hj)*dy.reduce((s,dyo,o)=>s+dyo*W2[j][o],0));for(let k=0;k<I;k++)for(let j=0;j<H;j++)g[0][k][j]+=dh[j]*X[idx][k];for(let j=0;j<H;j++)g[1][j]+=dh[j];}step++;const lr=.012,beta1=.9,beta2=.999,eps=1e-8;for(let pi=0;pi<4;pi++){const P=params[pi],G=g[pi],M=m[pi],V=v[pi];if(Array.isArray(P[0]))for(let i=0;i<P.length;i++)for(let j=0;j<P[i].length;j++){const grad=G[i][j]/ids.length;M[i][j]=beta1*M[i][j]+(1-beta1)*grad;V[i][j]=beta2*V[i][j]+(1-beta2)*grad*grad;P[i][j]-=lr*(M[i][j]/(1-beta1**step))/(Math.sqrt(V[i][j]/(1-beta2**step))+eps);}else for(let i=0;i<P.length;i++){const grad=G[i]/ids.length;M[i]=beta1*M[i]+(1-beta1)*grad;V[i]=beta2*V[i]+(1-beta2)*grad*grad;P[i]-=lr*(M[i]/(1-beta1**step))/(Math.sqrt(V[i]/(1-beta2**step))+eps);}}}
    if(epoch===1||epoch%20===0||epoch===epochs){onProgress({epoch,trainLoss:loss(train),valLoss:loss(val)});await new Promise(resolve=>setTimeout(resolve,0));}
  }
  const model={xKeys,yKeys,xs,ys,W1,b1,W2,b2,hidden:H};
  const predict=row=>predictAnn(model,row);const metrics={};yKeys.forEach((key,o)=>{const truth=test.map(i=>rows[i][key]),pred=test.map(i=>predict(rows[i])[key]),ym=mean(truth);const sse=truth.reduce((s,y,i)=>s+(y-pred[i])**2,0),sst=truth.reduce((s,y)=>s+(y-ym)**2,0);metrics[key]={r2:1-sse/Math.max(1e-12,sst),rmse:Math.sqrt(sse/truth.length)};});
  return{model,metrics,split:{train:train.length,val:val.length,test:test.length},history:{trainLoss:loss(train),valLoss:loss(val)}};
}

export function predictAnn(model,row){const x=model.xKeys.map((k,j)=>(row[k]-model.xs.mu[j])/model.xs.sd[j]);const h=model.b1.map((b,j)=>Math.tanh(b+x.reduce((s,xi,k)=>s+xi*model.W1[k][j],0)));const y=model.b2.map((b,o)=>b+h.reduce((s,hj,j)=>s+hj*model.W2[j][o],0));return Object.fromEntries(model.yKeys.map((k,o)=>[k,y[o]*model.ys.sd[o]+model.ys.mu[o]]));}

function sampleAroundDesign(candidate,variables,rng){const row={};for(const v of variables){const copy={...v};if(v.key==="d")copy.mean=candidate.d;if(v.key==="b")copy.mean=candidate.b;if(v.key==="As")copy.mean=candidate.As;row[v.key]=quantile(clamp(rng(),1e-6,1-1e-6),copy);}return row;}
export async function runRbdo(model,variables=VARIABLES,{targetBeta=2,iterations=240,reliabilitySamples=180,seed=991,onProgress=()=>{}}={}){
  if(!model)throw new Error("Train the ANN surrogate first.");const rng=seeded(seed),base={d:DESIGN.effectiveDepthMm,b:DESIGN.webWidthMm,As:DESIGN.asMm2};
  const get=v=>variables.find(x=>x.key===v);const bounds={d:[get("d").lower,get("d").upper],b:[get("b").lower,get("b").upper],As:[get("As").lower,get("As").upper]};let best=null,bestAny=null;
  for(let i=0;i<iterations;i++){const candidate={d:bounds.d[0]+rng()*(bounds.d[1]-bounds.d[0]),b:bounds.b[0]+rng()*(bounds.b[1]-bounds.b[0]),As:bounds.As[0]+rng()*(bounds.As[1]-bounds.As[0])};const failures=[0,0,0];for(let j=0;j<reliabilitySamples;j++){const sample=sampleAroundDesign(candidate,variables,rng),g=predictAnn(model,sample);if(g.gM<=0)failures[0]++;if(g.gV<=0)failures[1]++;if(g.gD<=0)failures[2]++;}const betas=failures.map(c=>betaFromPf(c/reliabilitySamples,reliabilitySamples));const objective=.45*(candidate.b*candidate.d/(base.b*base.d))+.45*(candidate.As/base.As)+.10*(candidate.b/base.b);const minBeta=Math.min(...betas),feasible=minBeta>=targetBeta,penalized=objective+Math.max(0,targetBeta-minBeta)*4;const item={...candidate,objective,betas,minBeta,feasible,penalized};if(!bestAny||item.penalized<bestAny.penalized)bestAny=item;if(feasible&&(!best||objective<best.objective))best=item;if(i%30===0){onProgress({iteration:i+1,best:best??bestAny});await new Promise(resolve=>setTimeout(resolve,0));}}
  return{best:best??bestAny,feasible:!!best,iterations,reliabilitySamples,targetBeta};
}

export function rowsToCsv(rows){const headers=["id","fck_MPa","fyk_MPa","d_mm","b_mm","As_mm2","DL_factor","LL_factor","gM_kNm","gV_kN","gD_mm","MEd_kNm","MRd_kNm","VEd_kN","VRd_kN","deflection_mm","system_fail"];
  return[headers.join(","),...rows.map(r=>[r.id,r.fck,r.fyk,r.d,r.b,r.As,r.DL,r.LL,r.gM,r.gV,r.gD,r.mEd,r.mRd,r.vEd,r.vRd,r.deflection,r.systemFail?1:0].map(x=>typeof x==="number"?Number(x.toFixed(6)):x).join(","))].join("\n");}

export function validationSuite(){const r=eurocodeModel(),exp=runExperiment({n:300,seed:41});return[
  {label:"Composite depth equals 1,200 mm",pass:DESIGN.girderDepthMm+DESIGN.deckDepthMm===1200},
  {label:"Seven girders at 1.70 m spacing",pass:DESIGN.girders===7&&DESIGN.spacingM===1.7},
  {label:"LM1 lane UDL total equals 37 kN/m",pass:Math.abs(r.loads.lm1BridgeUdl-37)<1e-9},
  {label:"All three limit-state margins are finite",pass:Object.values(r.g).every(Number.isFinite)},
  {label:"LHS sample count and bounds verified",pass:exp.rows.length===300&&VARIABLES.every(v=>exp.rows.every(x=>x[v.key]>=v.lower-1e-9&&x[v.key]<=v.upper+1e-9))},
];}
