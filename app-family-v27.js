// CManager PWA v27: manual performance and remaining discounts; preserves prior records and backup compatibility.
'use strict';
/* Personal data stays in this device's browser storage; the hosting server never receives it. */
const STORAGE='cmanager_family_db_v1';
const TIER_STORAGE='cmanager_family_tiers_v1';
const MANUAL_STORAGE='cmanager_family_manual_v1';
let manualRecords=readManual();
const RULE_STORAGE='cmanager_family_recurring_rules_v1';
const ENTRY_STORAGE='cmanager_family_recurring_entries_v1';
// Benefit settlement is distinct from qualifying performance. No automatic claim or receipt.
const BENEFIT_STATE_STORAGE='cmanager_family_benefit_states_v1';
let benefitStates=readBenefitStates();
// Keep usage entered per payment month separate from legacy benefit allocations.
// Old awarded/use records remain intact; no data migration deletes them.
const BENEFIT_USAGE_STORAGE='cmanager_family_benefit_usage_v1';
let benefitUsageRecords=readBenefitObject(BENEFIT_USAGE_STORAGE);
const BENEFIT_MODE_STORAGE='cmanager_family_benefit_modes_v1';
let benefitModeRecords=readBenefitObject(BENEFIT_MODE_STORAGE);
function readBenefitObject(key){try{const value=JSON.parse(localStorage.getItem(key)||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}catch{return {}}}
function saveBenefitUsage(){localStorage.setItem(BENEFIT_USAGE_STORAGE,JSON.stringify(benefitUsageRecords));render();queueCloudSync()}
function saveBenefitMode(cid,mode){
 const card=db.cards.find(c=>c.id===cid);if(!card||!['balance','discount'].includes(mode))return;
 const now=new Date().toISOString();card.benefitMode=mode;card.updatedAt=now;
 benefitModeRecords[cid]={mode,updatedAt:now};
 localStorage.setItem(BENEFIT_MODE_STORAGE,JSON.stringify(benefitModeRecords));
 save(); // Stages both card + dedicated benefit_mode row before any cloud refresh.
}
function benefitUsageMonth(cid,m){return Math.max(0,Number(benefitUsageRecords[benefitKey(cid,m)]?.amount)||0)}
function benefitPayment(c,paymentMonth){
 const earnedMonth=monthPlus(paymentMonth,-2),eligible=stats(c.id,earnedMonth).eligible;
 const awardedTier=tierStatus(c,eligible).current;
 return {earnedMonth,eligible,amount:Math.max(0,Number(awardedTier?.benefit)||0),tier:awardedTier};
}

function readBenefitStates(){try{const x=JSON.parse(localStorage.getItem(BENEFIT_STATE_STORAGE)||'{}');return x&&typeof x==='object'&&!Array.isArray(x)?x:{}}catch{return {}}}
function saveBenefitStates(){localStorage.setItem(BENEFIT_STATE_STORAGE,JSON.stringify(benefitStates));render();queueCloudSync()}
function benefitMode(c){const mode=benefitModeRecords[c.id]?.mode||c.benefitMode;return mode==='balance'?'balance':'discount'}
function benefitKey(cid,m){return cid+'|'+m}
function monthPlus(m,n){const [y,mm]=m.split('-').map(Number);const d=new Date(y,mm-1+n,1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
function awardedAmount(c,m){const rec=benefitStates[benefitKey(c.id,m)];return Number.isSafeInteger(rec?.amount)&&rec.amount>=0?rec.amount:(tierStatus(c,stats(c.id,m).eligible).current?.benefit||0)}
function balanceLedger(c){
 // Accrue benefits from actual qualifying spending two months before the payout,
 // not from a previously stored confirmation. Recompute whenever historical spending changes.
 const earnedMonths=new Set();
 const prefix=c.id+'|';
 for(const k of Object.keys(manualRecords))if(k.startsWith(prefix))earnedMonths.add(k.slice(prefix.length));
 for(const k of Object.keys(benefitStates))if(k.startsWith(prefix))earnedMonths.add(k.slice(prefix.length));
 for(const rec of db.records)if(rec.cardID===c.id)earnedMonths.add(rec.month);
 for(const rec of db.expenses)if(rec.cardID===c.id)earnedMonths.add(expenseMonth(rec));
 for(const rec of recurringEntries){const rule=recurringRules.find(r=>r.id===rec.ruleID);if(rule?.cardID===c.id)earnedMonths.add(rec.month)}
 // Automatic recurring contributions can qualify from their start month onward.
 for(const rule of recurringRules.filter(r=>r.cardID===c.id&&r.active!==false&&ruleMonthValid(r.startMonth))){
  for(let current=rule.startMonth,i=0;current<=month()&&i<240;current=monthPlus(current,1),i++)earnedMonths.add(current);
 }
 let credited=0;
 for(const earnedMonth of earnedMonths){
  if(!ruleMonthValid(earnedMonth)||monthPlus(earnedMonth,2)>month())continue;
  credited+=benefitPayment(c,monthPlus(earnedMonth,2)).amount;
 }
 // Keep recorded usage in both old and new storage to preserve existing deductions.
 const historicalUsed=Object.entries(benefitStates).filter(([k,v])=>k.startsWith(prefix)&&v.received).reduce((sum,[,v])=>sum+Math.max(0,Number(v.used)||0),0);
 const monthlyUsed=Object.entries(benefitUsageRecords).filter(([k])=>k.startsWith(prefix)).reduce((sum,[,v])=>sum+Math.max(0,Number(v.amount)||0),0);
 const spent=historicalUsed+monthlyUsed;
 return{credited,spent,remaining:Math.max(0,credited-spent),historicalUsed,monthlyUsed};
}
function ruleMonthValid(m){return typeof m==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(m)}
function automaticDiscount(c,m,ts){return ts.remaining===0?Math.max(0,Number(ts.current?.benefit)||0):0}
function benefitSummary(c,m,st,ts){if(benefitMode(c)==='balance'){const bal=balanceLedger(c);return `<div class="manual-benefit"><span>잔여 혜택</span><strong>${won(bal.remaining)}</strong></div>`}const amount=automaticDiscount(c,m,ts);return `<div class="manual-benefit"><span>청구 달성형 · ${amount>0?'✓ 목표 달성 · 혜택 자동 기록':'목표 미달성'}</span><strong>${won(amount)}</strong></div>`}
function benefitPanel(c,m,st,ts){
 if(benefitMode(c)==='discount'){
  const amount=automaticDiscount(c,m,ts);
  return `<div class="panel benefit-panel"><h3>청구 달성형 혜택</h3><p class="note">설정한 목표 실적을 달성하면 혜택 금액이 자동 기록돼요. 실제 카드 명세서의 할인 처리일과는 다를 수 있어요.</p><div class="row"><span>${amount>0?'목표 달성 · 혜택 자동 기록':'목표 미달성'}</span><b>${won(amount)}</b></div></div>`;
 }
 const payment=benefitPayment(c,m);
 const available=m<=month();
 return `<div class="panel benefit-panel balance-entry-panel"><h3>혜택 사용 이력</h3>
 <p class="note">${monthLabel(payment.earnedMonth)} 인정 실적에 따라 ${monthLabel(m)} 혜택을 자동 계산해요. 과거 실적을 수정하면 금액도 바로 변경돼요.</p>
 <div class="benefit-entry-unified">
  <div class="benefit-entry-award"><div class="benefit-entry-award-head"><span class="auto-award-label">${monthLabel(m)} ${available?'자동 반영':'지급 예정'} 혜택</span><span class="auto-award-badge">자동 계산</span></div>
   <strong>${won(payment.amount)}</strong><small>${payment.tier?won(payment.tier.threshold)+' 이상 구간 · '+monthLabel(payment.earnedMonth)+' 실적 '+won(payment.eligible):'달성한 혜택 구간 없음 · '+monthLabel(payment.earnedMonth)+' 실적 '+won(payment.eligible)}</small>
  </div>
  <form id="benefit-usage-form" class="benefit-entry-usage">${amountControlEight('사용 실적','benefitUsed',benefitUsageMonth(c.id,m))}<div class="actions"><button class="primary" type="submit">사용 실적 저장</button></div><p class="note" id="benefit-usage-status" role="status">${monthLabel(m)} 사용 실적 누계 · 버튼이나 숫자 입력으로 조정해요.</p></form>
 </div></div>`;
}
function benefitLedgerOpen(cid,backMonth=month()){
 const c=db.cards.find(x=>x.id===cid);if(!c)return;
 const records=Object.entries(benefitStates).filter(([k,v])=>k.startsWith(cid+'|')&&v.received).sort((a,b)=>a[0].localeCompare(b[0]));const balance=balanceLedger(c);
 openSheet('혜택 지급·사용 관리',`<div class="panel"><h3>현재 혜택 잔액 ${won(balance.remaining)}</h3><p class="note">실제 지급 확인 후 입력하세요. 지급월은 실적월보다 2개월 뒤입니다.</p><form id="grant-form"><label class="formlabel">실적 달성 월</label><input name="earnedMonth" type="month" value="${esc(monthPlus(month(),-2))}" required><label class="formlabel">실제 지급 금액 (원)</label><input name="grantAmount" type="number" min="0" step="1" required placeholder="지급 확인한 금액"><button class="primary" type="submit">지급 확인·등록</button></form></div><div class="panel"><h3>사용 금액 차감</h3><form id="spend-form"><label class="formlabel">이번에 사용한 혜택 금액 (원)</label><input name="spendAmount" type="number" min="1" step="1" required><button class="primary" type="submit">사용 금액 차감</button></form><p class="note">지급된 혜택 중 오래된 지급분부터 차감합니다. 사용액은 누적으로 저장돼요.</p></div><div class="panel"><h3>지급 내역</h3>${records.map(([k,v])=>`<div class="item"><b>${monthLabel(k.slice(-7))} 실적 → ${monthLabel(monthPlus(k.slice(-7),2))} 지급</b><div class="row"><span>지급 ${won(v.amount)}</span><span>사용 ${won(v.used||0)}</span></div></div>`).join('')||'<p class="note">지급 내역이 없어요.</p>'}</div><button type="button" class="secondary" id="back-benefit">카드 상세로 돌아가기</button>`);
 $('#back-benefit').onclick=()=>cardDetail(cid,backMonth);
 $('#grant-form').onsubmit=e=>{e.preventDefault();const f=e.currentTarget,m=f.elements.earnedMonth.value,amount=Number(f.elements.grantAmount.value);if(!/^\d{4}-\d{2}$/.test(m)||!Number.isSafeInteger(amount)||amount<0||monthPlus(m,2)>month()){alert('지급 예정월이 지났고 실제 지급 확인된 혜택만 등록할 수 있어요.');return}const k=benefitKey(cid,m),prior=benefitStates[k]||{};if(prior.received&&!confirm('이미 등록한 지급 기록이야. 금액을 수정할까?'))return;if((prior.used||0)>amount){alert('기존 사용 금액보다 지급액을 작게 설정할 수 없어요.');return}benefitStates[k]={...prior,received:true,amount,used:prior.used||0,updatedAt:new Date().toISOString()};saveBenefitStates();benefitLedgerOpen(cid,backMonth)};
 $('#spend-form').onsubmit=e=>{e.preventDefault();let amount=Number(e.currentTarget.elements.spendAmount.value);if(!Number.isSafeInteger(amount)||amount<=0||amount>balance.remaining){alert('현재 잔액 이하의 올바른 사용 금액을 입력해 주세요.');return}for(const [k,v] of records){const available=Math.max(0,v.amount-(v.used||0)),take=Math.min(amount,available);if(take){benefitStates[k]={...v,used:(v.used||0)+take,updatedAt:new Date().toISOString()};amount-=take}if(!amount)break}saveBenefitStates();benefitLedgerOpen(cid,backMonth)};
}
function benefitModeEdit(cid,m){const c=db.cards.find(x=>x.id===cid);if(!c)return;openSheet('혜택 관리 방식',`<form id="benefit-mode-form" class="benefit-mode-form"><p class="note">혜택 관리 방식만 변경합니다. 기존 실적·정기 입력·지급 기록은 삭제되지 않아요.</p><label class="formlabel">혜택 유형</label><div class="benefit-mode-options" role="radiogroup" aria-label="혜택 유형"><label class="benefit-mode-option"><input type="radio" name="mode" value="balance" ${benefitMode(c)==='balance'?'checked':''}><span class="mode-icon" aria-hidden="true">▤</span><span class="mode-copy"><strong>잔액 차감형</strong><small>목표 달성 후 2개월 뒤 지급된 혜택을 등록하고, 사용한 만큼 잔액에서 차감해요.</small></span></label><label class="benefit-mode-option"><input type="radio" name="mode" value="discount" ${benefitMode(c)==='discount'?'checked':''}><span class="mode-icon mode-icon-discount" aria-hidden="true">%</span><span class="mode-copy"><strong>청구 달성형</strong><small>목표 실적 달성 시 해당 구간의 할인 혜택 금액이 자동 기록돼요.</small></span></label></div><p class="mode-note">카드별 혜택 방식에 따라 관리 방법이 달라집니다. 언제든 변경할 수 있어요.</p><div class="actions"><button class="primary" type="submit">유형 저장</button><button type="button" class="secondary" id="cancel-benefit-mode">취소</button></div></form>`);$('#cancel-benefit-mode').onclick=()=>cardDetail(cid,m);bindForm(f=>{c.benefitMode=v(f,'mode');save();cardDetail(cid,m)})}

let recurringRules=readArray(RULE_STORAGE),recurringEntries=readArray(ENTRY_STORAGE);
function readArray(k){try{const x=JSON.parse(localStorage.getItem(k)||'[]');return Array.isArray(x)?x:[]}catch{return []}}
function writeRecurring(){localStorage.setItem(RULE_STORAGE,JSON.stringify(recurringRules));localStorage.setItem(ENTRY_STORAGE,JSON.stringify(recurringEntries));queueCloudSync()}

function readManual(){try{const d=JSON.parse(localStorage.getItem(MANUAL_STORAGE)||'{}');return d&&typeof d==='object'&&!Array.isArray(d)?d:{}}catch{return {}}}
function writeManual(){localStorage.setItem(MANUAL_STORAGE,JSON.stringify(manualRecords));queueCloudSync()}
const manualKey=(cid,m)=>cid+'|'+m;

let tierSettings=readTiers();
function readTiers(){try{const x=JSON.parse(localStorage.getItem(TIER_STORAGE)||'{}');return x&&typeof x==='object'&&!Array.isArray(x)?x:{}}catch{return {}}}
function saveTiers(){try{localStorage.setItem(TIER_STORAGE,JSON.stringify(tierSettings));queueCloudSync()}catch(e){alert('목표 실적 설정을 저장하지 못했어. '+e.message)}}

const KEYS=['cards','records','expenses','benefits','usages'];
const EMPTY=()=>({cards:[],records:[],expenses:[],benefits:[],usages:[]});
let db=readDB();
const $=s=>document.querySelector(s);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const won=n=>Number(n||0).toLocaleString('ko-KR')+'원';
const day=()=>{let d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
const month=()=>day().slice(0,7);
const monthLabel=s=>s?`${s.slice(0,4)}년 ${s.slice(5,7)}월`:'';
const id=()=>globalThis.crypto?.randomUUID?.()||'id-'+Date.now()+'-'+Math.random().toString(36).slice(2);
const colors=['#2563eb','#149b7f','#7752bd','#e07939','#298caf','#c04f81'];
const icons=['▣','◆','▤','✈','★','▰'];
let ownerFilter='all';
function filteredCards(){return db.cards.filter(c=>ownerFilter==='all'||(c.owner||'shared')===ownerFilter)}

function readDB(){try{const parsed=JSON.parse(localStorage.getItem(STORAGE));if(parsed&&KEYS.every(k=>Array.isArray(parsed[k])))return parsed}catch{}return EMPTY()}
function save(){try{localStorage.setItem(STORAGE,JSON.stringify(db))}catch(e){alert('저장 공간이 부족하거나 저장이 차단되어 있어요. 백업 파일을 저장해 주세요.\n'+e.message)}render();queueCloudSync()}
const expenseMonth=e=>String(e.date||'').slice(0,7);
const legacy=(cid,m)=>db.records.find(x=>x.cardID===cid&&x.month===m);
const monthExpenses=(cid,m)=>db.expenses.filter(x=>x.cardID===cid&&expenseMonth(x)===m);
const cardBenefits=cid=>db.benefits.filter(x=>x.cardID===cid);
const usageMonth=u=>String(u.date||'').slice(0,7);
// The manual base is the card issuer's cumulative approved performance, not an amount to double-count.
// Recurring items that the issuer has already included must be flagged as includedInBase.
function recurrenceFor(cid,m){
 const today=day(),thisMonth=month(),todayDay=Number(today.slice(8));
 let total=0,extras=[];
 for(const rule of recurringRules.filter(r=>r.cardID===cid&&r.active!==false&&r.startMonth<=m)){
  const effectiveDay=Math.min(rule.day,new Date(Number(m.slice(0,4)),Number(m.slice(5,7)),0).getDate());
  const due=m+'-'+String(effectiveDay).padStart(2,'0');
  if(m>thisMonth||(m===thisMonth&&todayDay<effectiveDay))continue;
  const saved=recurringEntries.find(e=>e.ruleID===rule.id&&e.month===m);
  if(saved?.status==='skipped')continue;
  const amount=saved?.status==='entered'?Number(saved.amount)||0:(rule.type==='fixed'?Number(rule.amount)||0:0);
  const counted=amount>0&&!saved?.includedInBase;
  if(counted)total+=amount;
  extras.push({rule,due,amount,saved,entered:!!saved&&saved.status==='entered',included:!!saved?.includedInBase,counted});
 }
 return{extra:total,items:extras};
}
function stats(cid,m){
 const entered=manualRecords[manualKey(cid,m)];
 const ex=monthExpenses(cid,m),old=legacy(cid,m);
 const priorEligible=ex.length?sum(ex.filter(e=>!e.excluded),'amount'):(old?.spending||0);
 const bid=new Set(cardBenefits(cid).map(x=>x.id));
 const uses=db.usages.filter(x=>bid.has(x.benefitID)&&usageMonth(x)===m);
 const priorUsed=uses.length?sum(uses,'amount'):(old?.benefitUsed||0);
 const card=db.cards.find(x=>x.id===cid);
 const benefitCeiling=tierFor(card||{target:1,benefitLimit:0,id:cid}).tiers.filter(t=>t.threshold<=priorEligible).at(-1)?.benefit ?? Number(card?.benefitLimit||0);
 const base=entered?Number(entered.eligible)||0:priorEligible;
 const recurring=recurrenceFor(cid,m);
 return {base,eligible:base+recurring.extra,recurringAmount:recurring.extra,recurringItems:recurring.items,
   benefitRemaining:entered?Math.max(0,Number(entered.benefitRemaining)||0):Math.max(0,benefitCeiling-priorUsed),manual:!!entered};
}
function sum(items,k){return items.reduce((s,x)=>s+(Number(x[k])||0),0)}
function tierFor(card){
 const raw=tierSettings[card.id];
 const fallback=Math.max(1,Number(card.target)||1);
 let tiers=Array.isArray(raw?.tiers)?raw.tiers.filter(x=>Number.isFinite(x.threshold)&&x.threshold>0&&Number.isFinite(x.benefit)&&x.benefit>=0).map(x=>({threshold:Math.round(x.threshold),benefit:Math.round(x.benefit)})):[];
 if(!tiers.length)tiers=[{threshold:fallback,benefit:Math.max(0,Number(card.benefitLimit)||0)}];
 tiers.sort((a,b)=>a.threshold-b.threshold);
 const goal=tiers.some(x=>x.threshold===raw?.goal)?raw.goal:(tiers.find(x=>x.threshold===Number(card.target))?.threshold||tiers[0].threshold);
 return{tiers,goal};
}
function tierStatus(card,eligible){
 const cfg=tierFor(card);
 const current=cfg.tiers.filter(t=>eligible>=t.threshold).at(-1)||null;
 const next=cfg.tiers.find(t=>eligible<t.threshold)||null;
 return{...cfg,current,next,remaining:Math.max(0,cfg.goal-eligible)};
}
function parseTierRows(value){
 const lines=value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 const parsed=[];
 for(const row of lines){
  const match=row.match(/^(\d+)\s*[:：,]\s*(\d+)$/);
  if(!match)return {error:'구간은 300000:10000 형식으로 한 줄씩 입력해 줘.'};
  const threshold=Number(match[1]),benefit=Number(match[2]);
  if(!Number.isSafeInteger(threshold)||threshold<=0||!Number.isSafeInteger(benefit)||benefit<0)return {error:'금액은 올바른 0 이상의 숫자로 입력해 줘.'};
  parsed.push({threshold,benefit});
 }
 if(!parsed.length)return {error:'실적 구간을 한 개 이상 입력해 줘.'};
 if(new Set(parsed.map(t=>t.threshold)).size!==parsed.length)return {error:'같은 실적 구간 금액이 중복되어 있어.'};
 return {tiers:parsed.sort((a,b)=>a.threshold-b.threshold)};
}
function tierLines(card,eligible){
 const cfg=tierStatus(card,eligible);
 return `<p class="note">원하는 구간을 누르면 내 목표로 바로 저장돼요.</p><div class="tier-list">${cfg.tiers.map(t=>`<button type="button" class="tier-line tier-choice ${eligible>=t.threshold?'tier-done':''} ${t.threshold===cfg.goal?'tier-goal':''}" data-select-goal="${t.threshold}" aria-pressed="${t.threshold===cfg.goal}"><span>${eligible>=t.threshold?'✓':'○'} ${won(t.threshold)} 이상</span><b>할인 한도 ${won(t.benefit)}</b></button>`).join('')}</div>`;
}
function setGoal(cid,goal,m=month()){
 const card=db.cards.find(c=>c.id===cid);
 if(!card)return;
 const cfg=tierFor(card);
 if(!cfg.tiers.some(t=>t.threshold===goal))return;
 tierSettings[cid]={tiers:cfg.tiers,goal};
 saveTiers();render();cardDetail(cid,m);
}
function tierEdit(cid,m=month()){
 const card=db.cards.find(c=>c.id===cid);if(!card)return;
 const cfg=tierFor(card);let chosenGoal=cfg.goal;
 let rows=cfg.tiers.map(x=>({threshold:x.threshold,benefit:x.benefit}));
 openSheet('실적 구간 설정',`<form id="tier-form"><p class="note">실적 구간과 혜택을 각각 입력하세요. 목표 구간은 아래에서 선택할 수 있어요.</p><div class="tier-grid-head"><span>실적 구간 (원)</span><span>혜택 한도 (원)</span></div><div id="tier-edit-list"></div><button type="button" class="secondary tier-add" id="tier-add">＋ 구간 추가</button><label class="formlabel">목표 실적 구간 선택</label><div id="tier-options" class="tier-options"></div><p id="tier-error" class="note warn" role="alert"></p><div class="actions"><button class="primary" type="submit">구간 및 목표 저장</button><button type="button" class="secondary" id="cancel-tier">취소</button></div></form>`);
 const list=$('#tier-edit-list'),choices=$('#tier-options'),error=$('#tier-error');
 function readRows(){
  const result=[];
  for(const row of list.querySelectorAll('.tier-edit-row')){
   const a=readAmount(row,'threshold'),b=readAmount(row,'benefit');
   if(a===null||a===0||b===null)return {error:'실적 구간은 1원 이상, 혜택은 0원 이상으로 입력해 줘.'};
   if(result.some(x=>x.threshold===a))return {error:'같은 실적 구간을 중복 등록할 수 없어요.'};
   result.push({threshold:a,benefit:b});
  }
  if(!result.length)return {error:'최소 한 개의 실적 구간이 필요해요.'};
  result.sort((a,b)=>a.threshold-b.threshold);return {tiers:result};
 }
 function redrawChoices(){
  const val=readRows();if(val.error){error.textContent=val.error;choices.innerHTML='';return null}
  error.textContent='';const parsed=val.tiers;
  if(!parsed.some(x=>x.threshold===chosenGoal))chosenGoal=parsed[0].threshold;
  choices.innerHTML=parsed.map(t=>`<button type="button" class="tier-option ${t.threshold===chosenGoal?'selected':''}" data-goal-option="${t.threshold}" aria-pressed="${t.threshold===chosenGoal}"><span><strong>${won(t.threshold)} 이상</strong><small>혜택 ${won(t.benefit)}</small></span><span class="tier-check">${t.threshold===chosenGoal?'✓ 선택됨':'목표로 선택'}</span></button>`).join('');
  choices.querySelectorAll('[data-goal-option]').forEach(btn=>btn.onclick=()=>{chosenGoal=Number(btn.dataset.goalOption);redrawChoices()});
  return parsed;
 }
 function drawRows(){
  list.innerHTML=rows.map((r,i)=>`<div class="tier-edit-row" data-row="${i}"><div class="tier-edit-values"><div><span class="field-mini-label">실적</span><input name="threshold" type="text" inputmode="numeric" data-amount-name="threshold" value="${Number(r.threshold||0).toLocaleString('ko-KR')}" aria-label="실적 구간 ${i+1}"></div><div><span class="field-mini-label">혜택</span><input name="benefit" type="text" inputmode="numeric" data-amount-name="benefit" value="${Number(r.benefit||0).toLocaleString('ko-KR')}" aria-label="혜택 금액 ${i+1}"></div></div><button type="button" class="tier-remove" data-tier-remove="${i}" aria-label="구간 ${i+1} 삭제">✕</button></div>`).join('');
  list.querySelectorAll('input').forEach(el=>el.addEventListener('input',redrawChoices));
  list.querySelectorAll('[data-tier-remove]').forEach(btn=>btn.onclick=()=>{if(rows.length===1){error.textContent='최소 한 개의 구간을 남겨야 해요.';return}rows=Array.from(list.querySelectorAll('.tier-edit-row')).map(el=>({threshold:readAmount(el,'threshold')||0,benefit:readAmount(el,'benefit')||0}));rows.splice(Number(btn.dataset.tierRemove),1);drawRows()});
  redrawChoices();
 }
 $('#tier-add').onclick=()=>{const result=readRows();if(!result.tiers){redrawChoices();return}rows=[...result.tiers,{threshold:0,benefit:0}];drawRows();list.querySelector('.tier-edit-row:last-child input')?.focus()};
 $('#cancel-tier').onclick=()=>cardDetail(cid,m);
 drawRows();
 bindForm(()=>{const parsed=redrawChoices();if(!parsed)return;tierSettings[cid]={tiers:parsed,goal:chosenGoal};saveTiers();render();cardDetail(cid,m)});
}
// v10: show each saved spending milestone along the current goal progress bar.
// Markers are display-only: they never change selected goals or stored data.
function tierProgressMarkers(ts, eligible){
 const goal=Math.max(1,Number(ts.goal)||1);
 const visible=ts.tiers.filter(t=>t.threshold<=goal);
 const labels=visible.map(t=>{
  const pct=Math.min(100,Math.max(0,(t.threshold/goal)*100));
  const reached=eligible>=t.threshold;
  const label=Number(t.threshold/10000).toLocaleString('ko-KR',{maximumFractionDigits:2})+'만';
  const last=pct>=99.99;
  return `<span class="milestone ${reached?'reached':''} ${last?'last':''}" style="left:${pct}%" title="${won(t.threshold)} ${reached?'달성':'미달성'}"><span class="milestone-dot"></span><span class="milestone-label">${label}</span></span>`;
 }).join('');
 return `<div class="milestone-progress" aria-label="목표 ${won(goal)}. 실적 구간: ${visible.map(t=>won(t.threshold)).join(', ')}"><div class="milestone-track"><div class="milestone-fill" style="width:${Math.min(100, Math.max(0,eligible/goal*100))}%"></div></div>${labels}</div>`;
}
function render(){
 const m=month();const visible=filteredCards();
 // The hero always shows household-wide totals, even when list filters are selected.
 const allCards=db.cards;
 const remainingFor=card=>tierStatus(card,stats(card.id,m).eligible).remaining;
 const myCards=allCards.filter(card=>card.owner!=='wife');
 const wifeCards=allCards.filter(card=>card.owner==='wife');
 const myRemaining=myCards.reduce((total,card)=>total+remainingFor(card),0);
 const wifeRemaining=wifeCards.reduce((total,card)=>total+remainingFor(card),0);
 $('#current-month').textContent=monthLabel(m)+' 이용 현황';
 $('#card-count').textContent=allCards.length+'개';
 $('#card-achieved').textContent=allCards.filter(c=>remainingFor(c)===0).length+' / '+allCards.length;
 $('#total-remaining').textContent=won(myRemaining+wifeRemaining);
 $('#mine-count').textContent=myCards.length+'개';
 $('#wife-count').textContent=wifeCards.length+'개';
 $('#mine-remaining').textContent=won(myRemaining);
 $('#wife-remaining').textContent=won(wifeRemaining);
 $('#cards').innerHTML=visible.length?visible.map((c,i)=>{
  const st=stats(c.id,m),ts=tierStatus(c,st.eligible),pct=Math.min(100,Math.round(st.eligible/ts.goal*100)),col=colors[i%colors.length];
  const owner=c.owner==='mine'?'내 카드':c.owner==='wife'?'와이프 카드':'공동 카드';
  const ownerClass=c.owner==='mine'?'owner-mine':c.owner==='wife'?'owner-wife':'owner-shared';
  return `<article class="card card-selectable" data-card-id="${esc(c.id)}" tabindex="0" role="button" aria-label="${esc(c.name)} 실적과 할인 잔여 금액 관리. 길게 누르면 카드 관리 메뉴">
  <div class="cardtop"><div class="cardico" style="background:${col}">${icons[i%icons.length]}</div><div class="tap"><div class="cardname-line"><div class="cardname">${esc(c.name)}</div><span class="owner-badge ${ownerClass}">${owner}</span></div><div class="sub">선택 목표 ${won(ts.goal)}</div></div><span class="pill">${ts.remaining===0?'목표 달성':'진행 중'}</span></div>
  <div class="card-summary"><div class="row"><span class="label">이번 달 예상 인정 실적</span><b style="color:${col}">${pct}%</b></div>${tierProgressMarkers(ts, st.eligible)}<div class="row"><b>${won(st.eligible)}</b><span class="label">${ts.remaining===0?'내 목표 달성':won(ts.remaining)+' 남음'}</span></div><p class="note">카드사 기준 ${won(st.base)} + 미포함 정기 실적 ${won(st.recurringAmount)}</p></div>
  ${benefitSummary(c,m,st,ts)}
  <div class="tier-hint"><span>${ts.current?'현재 '+won(ts.current.threshold)+' 구간 달성':'달성한 구간 없음'}</span><span>${ts.next?'다음 '+won(ts.next.threshold)+' · '+won(ts.next.threshold-st.eligible)+' 남음':'최고 구간 달성'}</span></div>
  </article>`;
 }).join(''):'<div class="empty">💳<h3>표시할 카드가 없어요</h3><p>카드를 등록하거나 다른 필터를 선택하세요.</p></div>';
 renderDueBanner();
}
function dueItems(){let result=[];for(const c of db.cards){for(const entry of recurrenceFor(c.id,month()).items){if(entry.rule.type==='variable'&&!entry.entered&&!entry.saved?.status)result.push({card:c,...entry})}}return result}
function renderDueBanner(){
 const list=dueItems();const banner=$('#due-banner');if(!banner)return;
 banner.hidden=!list.length;
 if(list.length)banner.innerHTML=`<b>🔔 이번 달 정기 실적 입력 대기 ${list.length}건</b><p>${list.slice(0,3).map(x=>esc(x.card.name+' · '+x.rule.title)).join(' / ')}${list.length>3?' 외':''}</p><button type="button" class="secondary small" id="open-pending">금액 입력하기</button>`;
 banner.querySelector('#open-pending')?.addEventListener('click',()=>regularOpen(list[0].card.id));
}
const modal=$('#modal'),title=$('#sheet-title'),body=$('#sheet-body');
function openSheet(t,html){title.textContent=t;body.innerHTML=html;modal.hidden=false;document.body.style.overflow='hidden';body.scrollTop=0}
function closeSheet(){modal.hidden=true;document.body.style.overflow='';body.innerHTML=''}
const numeric=(form,name)=>Math.max(0,Math.round(Number(new FormData(form).get(name))||0));
const v=(form,name)=>String(new FormData(form).get(name)||'').trim();
const dateInput=(name,value=day())=>`<label class="formlabel">날짜</label><input name="${name}" type="date" value="${esc(value)}" required>`;
const numberInput=(label,name,value='')=>`<label class="formlabel">${label}</label><input name="${name}" type="number" inputmode="numeric" min="0" step="1" value="${esc(value)}" required>`;
function amountControl(label,name,value,step){
 const amt=Math.max(0,Number(value)||0);
 return `<div class="amount-control"><div class="amount-label">${esc(label)}</div><div class="amount-value"><input type="text" inputmode="numeric" autocomplete="off" pattern="[0-9,]*" data-amount-name="${esc(name)}" name="${esc(name)}" value="${amt.toLocaleString('ko-KR')}" aria-label="${esc(label)}"><span>원</span></div><div class="amount-actions"><button type="button" data-amount-adjust="-${step*5}" data-amount-target="${esc(name)}">−${(step*5).toLocaleString('ko-KR')}</button><button type="button" data-amount-adjust="-${step}" data-amount-target="${esc(name)}">−${step.toLocaleString('ko-KR')}</button><button type="button" data-amount-adjust="${step}" data-amount-target="${esc(name)}">+${step.toLocaleString('ko-KR')}</button><button type="button" data-amount-adjust="${step*5}" data-amount-target="${esc(name)}">+${(step*5).toLocaleString('ko-KR')}</button></div></div>`;
}
function amountControlEight(label,name,value){
 const amt=Math.max(0,Number(value)||0);
 const units=[100,500,1000,5000];
 const controls=units.map(unit=>`<div class="amount-pair"><button type="button" data-amount-adjust="-${unit}" data-amount-target="${esc(name)}" aria-label="${unit.toLocaleString('ko-KR')}원 차감">−${unit.toLocaleString('ko-KR')}</button><button type="button" data-amount-adjust="${unit}" data-amount-target="${esc(name)}" aria-label="${unit.toLocaleString('ko-KR')}원 추가">+${unit.toLocaleString('ko-KR')}</button></div>`).join('');
 return `<div class="amount-control usage-amount-control"><div class="amount-label">${esc(label)}</div><div class="amount-value"><input type="text" inputmode="numeric" autocomplete="off" pattern="[0-9,]*" name="${esc(name)}" data-amount-name="${esc(name)}" value="${amt.toLocaleString('ko-KR')}" aria-label="${esc(label)}"><span>원</span></div><div class="amount-pairs" aria-label="사용 실적 빠른 금액 조정">${controls}</div></div>`;
}
function bindAmountControls(root=body){
 root.querySelectorAll('[data-amount-name]').forEach(field=>{
  field.addEventListener('focus',()=>{field.value=String(Number(field.value.replace(/,/g,''))||0);field.select()});
  field.addEventListener('blur',()=>{field.value=(Math.max(0,Number(field.value.replace(/,/g,''))||0)).toLocaleString('ko-KR')});
 });
 root.querySelectorAll('[data-amount-adjust]').forEach(btn=>btn.onclick=()=>{
  const el=Array.from(root.querySelectorAll('[data-amount-name]')).find(x=>x.dataset.amountName===btn.dataset.amountTarget);
  if(!el)return;const base=Number(el.value.replace(/,/g,''))||0;
  el.value=Math.max(0,base+Number(btn.dataset.amountAdjust)).toLocaleString('ko-KR');el.dispatchEvent(new Event('input',{bubbles:true}));
 });
}
function readAmount(form,name){const field=form.querySelector(`[name="${name}"]`);const raw=String(field?.value||'').replace(/,/g,'').trim();const n=Number(raw);return raw!==''&&Number.isSafeInteger(n)&&n>=0?n:null;}
function bindForm(fn){const f=body.querySelector('form');f?.addEventListener('submit',e=>{e.preventDefault();fn(f)})}
function cardAdd(){openSheet('카드 추가',`<form><label class="formlabel">카드 이름</label><input name="name" placeholder="예: 롯데카드" maxlength="80" required><label class="formlabel">카드 구분</label><select name="owner"><option value="mine">내 카드</option><option value="wife">와이프 카드</option></select>${numberInput('목표 실적 (원)','target')}${numberInput('월 최대 혜택 (원)','limit')}<label class="formlabel">혜택 유형</label><select name="benefitMode"><option value="discount">청구 달성형</option><option value="balance">잔액 차감형</option></select><div class="actions"><button class="primary" type="submit">카드 저장</button></div></form>`);bindForm(f=>{const name=v(f,'name');if(!name)return;db.cards.push({id:id(),name,owner:v(f,'owner')||'mine',target:numeric(f,'target'),benefitLimit:numeric(f,'limit'),benefitMode:v(f,'benefitMode')||'discount'});save();closeSheet()})}
// Rename in place: preserve the card UUID referenced by expenses, monthly records, and benefits.
function cardRename(cid){
  const card=db.cards.find(c=>c.id===cid);
  if(!card)return;
  openSheet('카드 이름 수정',`<form><label class="formlabel">카드 이름</label><input name="name" maxlength="80" required value="${esc(card.name)}"><p class="note">이름만 바뀌고 결제 내역, 월별 기록, 혜택 정보는 그대로 유지돼요.</p><div class="actions"><button class="primary" type="submit">이름 저장</button><button class="secondary" type="button" id="cancel-rename">취소</button></div></form>`);
  $('#cancel-rename').onclick=closeSheet;
  bindForm(f=>{const name=v(f,'name');if(!name){alert('카드 이름을 입력해 줘.');return;}card.name=name;save();cardManage(cid);});
}
// Only moves the item in the existing array. All card IDs and related data remain unchanged.
function cardManage(focusID){
  const list=db.cards.map((c,i)=>`<div class="manage-item${c.id===focusID?' is-focused':''}">
      <div class="manage-header"><div class="manage-icon" style="background:${colors[i%colors.length]}">${icons[i%icons.length]}</div><div class="manage-title"><b>${esc(c.name)}</b><small>목표 실적 ${won(c.target)}</small></div></div>
      <div class="manage-buttons"><button class="secondary" data-manage-edit="${esc(c.id)}">✎ 이름 수정</button><button class="secondary" data-manage-owner="${esc(c.id)}">카드 구분</button><button class="secondary" data-manage-move="${esc(c.id)}" data-direction="-1" ${i===0?'disabled':''}>↑ 위로</button><button class="secondary" data-manage-move="${esc(c.id)}" data-direction="1" ${i===db.cards.length-1?'disabled':''}>↓ 아래로</button><button class="danger" data-manage-delete="${esc(c.id)}">삭제</button></div>
    </div>`).join('');
  openSheet('카드 관리',`<p class="note">여기에서만 카드 이름과 순서를 변경할 수 있어요. 카드의 실적 및 결제 기록은 그대로 유지됩니다.</p>${list||'<p class="empty">등록된 카드가 없어요.</p>'}`);
  body.querySelectorAll('[data-manage-edit]').forEach(el=>el.onclick=()=>cardRename(el.dataset.manageEdit));
  body.querySelectorAll('[data-manage-owner]').forEach(el=>el.onclick=()=>changeOwner(el.dataset.manageOwner));
  body.querySelectorAll('[data-manage-move]').forEach(el=>el.onclick=()=>{const cid=el.dataset.manageMove;moveCard(cid,Number(el.dataset.direction));cardManage(cid)});
  body.querySelectorAll('[data-manage-delete]').forEach(el=>el.onclick=()=>{
    if(!confirm('이 카드를 삭제할까요? 과거 월별 기록은 남겨둡니다.'))return;
    db.cards=db.cards.filter(c=>c.id!==el.dataset.manageDelete);save();cardManage();
  });
}
function changeOwner(cid){const c=db.cards.find(x=>x.id===cid);if(!c)return;
 openSheet('카드 구분 변경',`<form><label class="formlabel">카드 구분</label><select name="owner"><option value="mine" ${c.owner==='mine'?'selected':''}>내 카드</option><option value="wife" ${c.owner==='wife'?'selected':''}>와이프 카드</option></select><div class="actions"><button class="primary">저장</button></div></form>`);
 bindForm(f=>{c.owner=v(f,'owner');save();cardManage(cid)});
}
function moveCard(cid,delta){
  const i=db.cards.findIndex(c=>c.id===cid);
  const j=i+delta;
  if(i<0||j<0||j>=db.cards.length)return;
  [db.cards[i],db.cards[j]]=[db.cards[j],db.cards[i]];
  save();
}
function cardDetail(cid,m=month()){
 const c=db.cards.find(x=>x.id===cid);if(!c){closeSheet();return}
 const st=stats(cid,m),ts=tierStatus(c,st.eligible);
 const checkboxItems=st.recurringItems.map(e=>`<label class="checkrow"><input type="checkbox" data-in-base="${esc(e.rule.id)}" ${e.included?'checked':''}> <span>${esc(e.rule.title)} ${won(e.amount)} — 카드사 기준 실적에 이미 포함됨</span></label>`).join('');
 openSheet(c.name,` <div class="panel"><div class="row"><b>${monthLabel(m)} 실적 · 혜택</b><input class="monthpick" type="month" id="detail-month" value="${esc(m)}"></div>
 <p class="note">카드사 앱에서 확인한 <b>인정 실적 누계</b>를 기준 실적으로 입력해요. 이미 누계에 포함된 정기 항목에는 체크해야 중복 합산되지 않아요.</p>
 <form id="manual-form">${amountControl('카드사 기준 인정 실적','eligible',st.base,10000)}
 ${checkboxItems?`<div class="includes-list"><b>중복 방지 체크</b>${checkboxItems}</div>`:''}
 <div class="actions"><button class="primary" type="submit">실적 저장</button></div><p class="note" id="manual-save-status" role="status">입력한 실적과 중복 방지 설정을 함께 저장해요.</p></form>
 <div class="manual-summary"><div class="row"><span>카드사 기준 실적</span><strong>${won(st.base)}</strong></div><div class="row"><span>추가할 정기 실적</span><strong>${won(st.recurringAmount)}</strong></div><div class="row"><span>예상 인정 실적</span><strong class="highlight">${won(st.eligible)}</strong></div><div class="row"><span>선택 목표까지</span><strong>${won(ts.remaining)}</strong></div></div></div>
 ${benefitPanel(c,m,st,ts)}
 <div class="panel benefit-mode-inline-panel"><h3>혜택 유형</h3><p class="note">카드의 혜택 유형을 선택하면 바로 저장돼요.</p><div class="benefit-mode-options" role="radiogroup" aria-label="혜택 유형"><label class="benefit-mode-option"><input type="radio" name="detailBenefitMode" value="balance" ${benefitMode(c)==='balance'?'checked':''}><span class="mode-icon" aria-hidden="true">▤</span><span class="mode-copy"><strong>잔액 차감형</strong><small>2개월 뒤 지급 · 사용 실적 차감</small></span></label><label class="benefit-mode-option"><input type="radio" name="detailBenefitMode" value="discount" ${benefitMode(c)==='discount'?'checked':''}><span class="mode-icon mode-icon-discount" aria-hidden="true">%</span><span class="mode-copy"><strong>청구 달성형</strong><small>목표 달성 시 혜택 자동 기록</small></span></label></div><p id="mode-save-message" class="note" role="status">기존 실적 및 혜택 사용 이력은 유지돼요.</p></div>
 <div class="panel"><div class="row"><h3>실적 구간 · 목표 설정</h3><button class="secondary" id="edit-tiers">구간 수정</button></div>
 <p class="note">실적·혜택 구간은 한 번 설정하고, 원하는 목표 구간을 눌러 변경할 수 있어요.</p>${tierLines(c,st.eligible)}</div>
 <div class="panel"><div class="row"><h3>정기 실적 관리</h3><button class="secondary" id="open-regular">설정·입력</button></div><p class="note">보험료는 지정일부터 예상 실적으로 자동 반영하고, 관리비·가스요금은 입력할 때 반영해요.</p></div>`);
 bindAmountControls();
 body.querySelectorAll('[name="detailBenefitMode"]').forEach(input=>input.addEventListener('change',()=>{
  if(!input.checked)return;const scroll=body.scrollTop;
  saveBenefitMode(cid,input.value);
  cardDetail(cid,m);body.scrollTop=scroll;
  const notice=$('#mode-save-message');if(notice)notice.textContent='✓ 혜택 유형 저장 완료 · 가족 공유에 반영 중';
 }));
 $('#detail-month').addEventListener('change',e=>cardDetail(cid,e.target.value));
 $('#manual-form').addEventListener('submit',e=>{
  e.preventDefault();const f=e.currentTarget;
  const a=readAmount(f,'eligible');
  if(!Number.isSafeInteger(a)||a<0){alert('올바른 실적 금액을 입력해 줘.');return}
  manualRecords[manualKey(cid,m)]={...manualRecords[manualKey(cid,m)],eligible:a,updatedAt:new Date().toISOString()};
  for(const box of body.querySelectorAll('[data-in-base]')){
   const rule=recurringRules.find(r=>r.id===box.dataset.inBase);if(!rule)continue;
   const previous=recurringEntries.find(e=>e.ruleID===rule.id&&e.month===m);
   const defaultAmount=rule.type==='fixed'?rule.amount:0;
   if(previous){previous.includedInBase=box.checked;previous.updatedAt=new Date().toISOString()}
   else recurringEntries.push({id:rule.id+'|'+m,ruleID:rule.id,month:m,status:'entered',amount:defaultAmount,includedInBase:box.checked,updatedAt:new Date().toISOString()});
  }
  writeManual();writeRecurring();render();const scroll=body.scrollTop;cardDetail(cid,m);body.scrollTop=scroll;
  const notice=$('#manual-save-status');if(notice){notice.textContent='✓ 실적 저장 완료 · 공유 동기화 중';notice.classList.add('save-ok')}
 });
 body.querySelectorAll('[data-select-goal]').forEach(btn=>btn.onclick=()=>setGoal(cid,Number(btn.dataset.selectGoal),m));
 $('#edit-tiers').onclick=()=>tierEdit(cid,m);
 $('#open-regular').onclick=()=>regularOpen(cid,m);
 if(benefitMode(c)==='balance'){
  $('#benefit-usage-form')?.addEventListener('submit',e=>{
   e.preventDefault();const entered=readAmount(e.currentTarget,'benefitUsed');
   if(entered===null){alert('사용 실적에 올바른 금액을 입력해 줘.');return}
   const prior=benefitUsageMonth(cid,m),balance=balanceLedger(c);
   if(entered>prior+balance.remaining){alert('자동 계산된 잔여 혜택보다 사용 실적이 많아요. 과거 실적 및 혜택 내역을 확인해 줘.');return}
   benefitUsageRecords[benefitKey(cid,m)]={amount:entered,updatedAt:new Date().toISOString()};
   saveBenefitUsage();const scroll=body.scrollTop;cardDetail(cid,m);body.scrollTop=scroll;
   const status=$('#benefit-usage-status');if(status)status.textContent='✓ 사용 실적 저장 완료 · 공유 동기화 중';
  });
 }
}
function regularOpen(cid,m=month()){
 const card=db.cards.find(c=>c.id===cid);if(!card)return;
 const rules=recurringRules.filter(r=>r.cardID===cid);
 const rows=rules.map(r=>{
  const entered=recurringEntries.find(e=>e.ruleID===r.id&&e.month===m);
  const dayOfMonth=Math.min(r.day,new Date(Number(m.slice(0,4)),Number(m.slice(5,7)),0).getDate());
  const due=m+'-'+String(dayOfMonth).padStart(2,'0');
  const dueNow=due<=day();
  return `<div class="manage-item"><div class="row"><b>${esc(r.title)}</b><span class="chip">매월 ${r.day}일 · ${r.type==='fixed'?'고정':'변동'}</span></div>
    <p class="note">${r.type==='fixed'?`기본 ${won(r.amount)}`:'매월 금액 입력 필요'} · ${dueNow?'결제일 도래':'결제일 전'}</p>
    <p class="note">이번 달: ${entered?.status==='skipped'?'건너뜀':entered?.status==='entered'?won(entered.amount):r.type==='fixed'&&dueNow?'자동 예상 반영':'미입력'}${entered?.includedInBase?' · 카드사 기준에 포함됨':''}</p>
    <div class="actions"><button class="secondary" data-enter-rule="${esc(r.id)}">이번 달 입력·수정</button><button class="secondary" data-edit-rule="${esc(r.id)}">규칙 수정</button><button class="danger" data-delete-rule="${esc(r.id)}">삭제</button></div></div>`;
 }).join('');
 openSheet('정기 실적 · '+card.name,`<p class="note">${monthLabel(m)} · 고정 금액은 결제일이 되면 자동으로 예상 실적에 포함돼요. 변동 금액은 직접 입력해야 해요. 실제 청구와 다르면 수정·건너뛰기를 선택하세요.</p>
 <p id="regular-sync-status" class="sync-status">${esc($('#sync-status')?.textContent||'공유 상태 확인 중')}</p><div class="row"><input class="monthpick" type="month" id="regular-month" value="${esc(m)}"><button class="primary small" id="add-regular">+ 정기 항목 추가</button></div>${rows||'<div class="empty">정기 항목이 없어요.</div>'}
 <button class="secondary" id="regular-back">카드 상세로 돌아가기</button>`);
 $('#regular-month').onchange=e=>regularOpen(cid,e.target.value);
 $('#add-regular').onclick=()=>regularEdit(cid,null,m);
 $('#regular-back').onclick=()=>cardDetail(cid,m);
 body.querySelectorAll('[data-enter-rule]').forEach(el=>el.onclick=()=>regularEntryEdit(cid,el.dataset.enterRule,m));
 body.querySelectorAll('[data-edit-rule]').forEach(el=>el.onclick=()=>regularEdit(cid,el.dataset.editRule,m));
 body.querySelectorAll('[data-delete-rule]').forEach(el=>el.onclick=()=>{
  if(!confirm('이 정기 항목과 월별 입력 내역을 삭제할까요?'))return;
  recurringRules=recurringRules.filter(r=>r.id!==el.dataset.deleteRule);
  recurringEntries=recurringEntries.filter(e=>e.ruleID!==el.dataset.deleteRule);writeRecurring();render();regularOpen(cid,m);
 });
}
function regularEdit(cid,rid=null,m=month()){
 const r=recurringRules.find(x=>x.id===rid);
 openSheet(r?'정기 실적 규칙 수정':'정기 실적 추가',`<form>
 <label class="formlabel">항목 이름</label><input name="title" maxlength="70" value="${esc(r?.title||'')}" placeholder="보험료 / 가스요금 / 아파트 관리비" required>
 <label class="formlabel">금액 유형</label><div class="type-options" role="group" aria-label="금액 유형 선택"><label class="type-option"><input type="radio" name="type" value="fixed" ${r?.type!=='variable'?'checked':''}><span><strong>고정 금액</strong><small>결제일 이후 자동 예상 반영</small></span></label><label class="type-option"><input type="radio" name="type" value="variable" ${r?.type==='variable'?'checked':''}><span><strong>변동 금액</strong><small>결제일 이후 금액 입력 안내</small></span></label></div>
 <label class="formlabel" for="regular-day">매월 결제일</label><div class="day-select-wrap"><select class="day-select" id="regular-day" name="day" required>${Array.from({length:31},(_,i)=>`<option value="${i+1}" ${Number(r?.day??15)===i+1?'selected':''}>${i+1}일</option>`).join('')}</select><span class="day-select-arrow" aria-hidden="true"></span></div><p class="note">선택한 날짜가 없는 달에는 해당 월의 마지막 날에 반영돼요.</p><div id="fixed-amount">${numberInput('매월 고정 인정 금액 (원)','amount',r?.amount??0)}</div>
 <label class="formlabel">적용 시작 월</label><div class="month-select-wrap"><input name="startMonth" type="month" value="${esc(r?.startMonth||m)}" required aria-label="적용 시작 월"><span aria-hidden="true">▦</span></div><p class="note">시작 월을 누르면 아이폰의 월 선택기가 열려요.</p>
 <div class="actions"><button class="primary" type="submit">규칙 저장</button><button type="button" class="secondary" id="cancel-regular">취소</button></div></form>`);
 const amt=$('#fixed-amount');function updateAmount(){amt.hidden=body.querySelector('input[name=type]:checked')?.value!=='fixed'}body.querySelectorAll('input[name=type]').forEach(x=>x.addEventListener('change',updateAmount));updateAmount();
 $('#cancel-regular').onclick=()=>regularOpen(cid,m);
 bindForm(f=>{
  const d=numeric(f,'day'),t=v(f,'type'),a=numeric(f,'amount'),start=v(f,'startMonth');
  if(d<1||d>31||!/^\d{4}-\d{2}$/.test(start)){alert('날짜는 1~31일, 시작 월은 YYYY-MM 형식으로 입력해 줘.');return}
  const data={id:r?.id||id(),cardID:cid,title:v(f,'title'),type:t,day:d,amount:t==='fixed'?a:0,startMonth:start,active:true,updatedAt:new Date().toISOString()};
  if(r)recurringRules=recurringRules.map(item=>item.id===r.id?data:item);else recurringRules.push(data);
  writeRecurring();render();regularOpen(cid,m);
 });
}
function regularEntryEdit(cid,ruleID,m){
 const r=recurringRules.find(x=>x.id===ruleID);if(!r)return;
 const entry=recurringEntries.find(e=>e.ruleID===ruleID&&e.month===m);
 const initial=entry?.amount??(r.type==='fixed'?r.amount:0);
 openSheet('이번 달 정기 실적 입력',`<form><p class="note">${esc(r.title)} · ${monthLabel(m)}. 카드사 기준 누계에 이미 들어간 금액이라면 아래 체크를 켜 줘.</p>
 ${numberInput('이번 달 인정 금액 (원)','amount',initial)}
 <label class="checkrow"><input name="included" type="checkbox" ${entry?.includedInBase?'checked':''}> 카드사 기준 실적에 이미 포함됨 (중복 가산 안 함)</label>
 <div class="actions"><button class="primary" type="submit">입력 완료</button><button class="secondary" type="button" id="skip-regular">이번 달 반영하지 않기</button><button class="secondary" type="button" id="back-regular">취소</button></div></form>`);
 const upsert=(status,amount,included)=>{
  const item={id:ruleID+'|'+m,ruleID,month:m,status,amount,includedInBase:included,updatedAt:new Date().toISOString()};
  const i=recurringEntries.findIndex(e=>e.id===item.id);if(i>=0)recurringEntries[i]=item;else recurringEntries.push(item);
  writeRecurring();render();regularOpen(cid,m);
 };
 $('#skip-regular').onclick=()=>upsert('skipped',0,false);
 $('#back-regular').onclick=()=>regularOpen(cid,m);
 bindForm(f=>upsert('entered',numeric(f,'amount'),!!new FormData(f).get('included')));
}
function history(){
 const months=[...new Set([...db.records.map(x=>x.month),...db.expenses.map(expenseMonth),...db.usages.map(usageMonth),...Object.keys(manualRecords).map(k=>k.slice(-7)),...recurringEntries.map(e=>e.month),...Object.keys(benefitStates).map(k=>k.slice(-7)),...(recurringRules.length?[month()]:[])])].filter(m=>/^\d{4}-\d{2}$/.test(m)).sort().reverse();
 const historicalIds=[...new Set([...db.cards.map(x=>x.id),...db.records.map(x=>x.cardID),...db.expenses.map(x=>x.cardID)])];
 const blocks=months.map(m=>{
  const list=historicalIds.filter(cid=>manualRecords[manualKey(cid,m)]||legacy(cid,m)||monthExpenses(cid,m).length||recurrenceFor(cid,m).items.length).map(cid=>{
   const c=db.cards.find(x=>x.id===cid),st=stats(cid,m);
   return `<div class="panel"><b>${esc(c?.name||'삭제된 카드')}</b><div class="item row"><span>인정 실적</span><b class="highlight">${won(st.eligible)}</b></div><div class="item row"><span>혜택 관리</span><b>${c?(benefitMode(c)==='balance'?'잔여 혜택 '+won(balanceLedger(c).remaining):(automaticDiscount(c,m,tierStatus(c,st.eligible))>0?'자동 기록 '+won(automaticDiscount(c,m,tierStatus(c,st.eligible))):'목표 미달성')):'-'}</b></div></div>`;
  }).join('');return list?`<div class="groupheader">${monthLabel(m)}</div>${list}`:'';
 }).join('');
 openSheet('월별 기록',blocks||'<div class="empty">아직 저장된 기록이 없어요.</div>');
}
const APPLE_EPOCH_MS=978307200000;
const toSwiftDate=d=>(new Date(String(d).length===7?d+'-01':d+'T12:00:00').getTime()-APPLE_EPOCH_MS)/1000;
const localDateString=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const fromSwiftDate=v=>{if(typeof v==='number')return localDateString(new Date(APPLE_EPOCH_MS+v*1000));if(typeof v==='string'){const date=new Date(v);if(!Number.isNaN(date.getTime()))return localDateString(date)}throw new Error('날짜 형식을 읽을 수 없어요')};
function exportBackup(){const out={version:1,tierSettings,manualRecords,recurringRules,recurringEntries,benefitStates,benefitUsageRecords,benefitModeRecords,createdAt:(Date.now()-APPLE_EPOCH_MS)/1000,cards:db.cards,records:db.records,expenses:db.expenses.map(x=>({...x,date:toSwiftDate(x.date)})),benefits:db.benefits,usages:db.usages.map(x=>({...x,date:toSwiftDate(x.date)}))};const blob=new Blob([JSON.stringify(out,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='CardManager_Backup_'+new Date().toISOString().slice(0,10)+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)}
function validateBackup(x){if(!x||x.version!==1||!['cards','records','expenses','benefits','usages'].every(k=>Array.isArray(x[k])))throw new Error('지원되지 않는 백업 파일이야. 기존 카드관리 앱의 JSON 파일인지 확인해 줘.');if(x.tierSettings!==undefined&&(typeof x.tierSettings!=='object'||x.tierSettings===null||Array.isArray(x.tierSettings)))throw Error('목표 구간 설정 형식이 잘못됐어');if(x.manualRecords!==undefined&&(typeof x.manualRecords!=='object'||x.manualRecords===null||Array.isArray(x.manualRecords)))throw Error('직접 입력 기록 형식이 잘못됐어');if(x.manualRecords){for(const rec of Object.values(x.manualRecords)){if(!rec||!Number.isSafeInteger(rec.eligible)||rec.eligible<0||(rec.benefitRemaining!==undefined&&(!Number.isSafeInteger(rec.benefitRemaining)||rec.benefitRemaining<0)))throw Error('수동 실적/혜택 기록 형식이 잘못됐어')}}if(x.benefitStates!==undefined&&(typeof x.benefitStates!=='object'||x.benefitStates===null||Array.isArray(x.benefitStates)))throw Error('혜택 관리 기록 형식이 잘못됐어');if(x.benefitUsageRecords!==undefined&&(typeof x.benefitUsageRecords!=='object'||x.benefitUsageRecords===null||Array.isArray(x.benefitUsageRecords)))throw Error('사용 실적 형식이 잘못됐어');if(x.benefitModeRecords!==undefined&&(typeof x.benefitModeRecords!=='object'||x.benefitModeRecords===null||Array.isArray(x.benefitModeRecords)))throw Error('혜택 유형 기록 형식이 잘못됐어');if(x.recurringRules!==undefined&&!Array.isArray(x.recurringRules))throw Error('정기 규칙 형식이 잘못됐어');if(x.recurringEntries!==undefined&&!Array.isArray(x.recurringEntries))throw Error('정기 실적 기록 형식이 잘못됐어');for(const c of x.cards){if(typeof c.id!=='string'||typeof c.name!=='string'||!Number.isFinite(c.target)||!Number.isFinite(c.benefitLimit))throw Error('카드 정보 형식이 잘못됐어')}for(const e of x.expenses){if(typeof e.id!=='string'||typeof e.cardID!=='string'||typeof e.merchant!=='string'||!Number.isFinite(e.amount))throw Error('결제 기록 형식이 잘못됐어')}for(const r of x.records){if(typeof r.cardID!=='string'||typeof r.month!=='string'||!Number.isFinite(r.spending)||!Number.isFinite(r.benefitUsed))throw Error('월별 기록 형식이 잘못됐어')}for(const b of x.benefits){if(typeof b.id!=='string'||typeof b.cardID!=='string'||typeof b.title!=='string'||!Number.isFinite(b.monthlyLimit))throw Error('혜택 정보 형식이 잘못됐어')}for(const u of x.usages){if(typeof u.id!=='string'||typeof u.benefitID!=='string'||!Number.isFinite(u.amount))throw Error('혜택 사용 이력 형식이 잘못됐어')}}
function importBackup(file){if(!file)return;const reader=new FileReader();reader.onload=()=>{try{const x=JSON.parse(reader.result);validateBackup(x);const next={cards:x.cards,records:x.records,expenses:x.expenses.map(e=>({...e,date:fromSwiftDate(e.date)})),benefits:x.benefits,usages:x.usages.map(u=>({...u,date:fromSwiftDate(u.date)}))};if(confirm(`백업 파일에 카드 ${next.cards.length}개, 결제 내역 ${next.expenses.length}건이 있어요.\n\n현재 웹앱의 모든 기록을 백업 파일의 내용으로 교체할까요?`)){db=next;tierSettings=x.tierSettings||{};manualRecords=x.manualRecords||{};recurringRules=x.recurringRules||[];recurringEntries=x.recurringEntries||[];benefitStates=x.benefitStates||{};benefitUsageRecords=x.benefitUsageRecords||{};benefitModeRecords=x.benefitModeRecords||{};suppressCloud=true;saveTiers();writeManual();writeRecurring();saveBenefitStates();localStorage.setItem(BENEFIT_USAGE_STORAGE,JSON.stringify(benefitUsageRecords));localStorage.setItem(BENEFIT_MODE_STORAGE,JSON.stringify(benefitModeRecords));save();suppressCloud=false;if(cloud.householdId&&confirm("현재 가족 공유 데이터도 이 백업으로 교체할까요? 두 사람의 기존 기록이 교체됩니다.")){replaceCloudFromLocal().catch(err=>alert("공유 데이터 교체 실패: "+err.message))}closeSheet();alert('복원했어. 현재 카드와 기록을 확인해 줘.')}}catch(e){alert('백업 복원에 실패했어.\n'+e.message)}};reader.onerror=()=>alert('파일을 읽지 못했어.');reader.readAsText(file)}
function backup(){openSheet('백업 및 복원',`<div class="panel"><h3>iCloud Drive 파일 백업</h3><p class="note">직접 입력한 실적·남은 혜택과 실적 구간, 기존 결제·혜택·월별 기록까지 하나의 JSON 파일로 저장해요. 앱 파일은 GitHub에 있지만 개인 기록은 이 기기에만 저장돼요.</p><div class="actions"><button class="primary" id="export">⬆ 백업 파일 만들기</button></div><p class="note">iPhone Safari에서 다운로드한 파일은 파일 앱의 '다운로드'에서 찾을 수 있어요. 필요하면 파일 앱에서 iCloud Drive로 이동해 줘.</p></div><div class="panel"><h3>백업에서 복원</h3><label class="formlabel">기존 Swift 앱 또는 웹앱에서 만든 JSON 백업 선택</label><input type="file" id="import" accept=".json,application/json"><p class="warn note">복원 시 웹앱의 현재 데이터가 모두 교체돼요. 현재 데이터도 먼저 백업해 줘.</p></div><div class="panel"><h3>주의사항</h3><p class="note">이 웹앱의 데이터는 아이폰의 웹 저장 공간에 보관돼요. Safari 데이터 삭제나 앱 제거 시 사라질 수 있으므로 정기적으로 JSON 백업을 만들어 iCloud Drive에 보관해 줘. 같은 주소여도 부부의 아이폰은 각자의 데이터를 사용해요.</p></div>`);$('#export').onclick=exportBackup;$('#import').onchange=e=>importBackup(e.target.files[0])}
$('#add-card').onclick=cardAdd;
$('#history-open').onclick=history;
$('#backup-open').onclick=backup;
$('#shared-open').onclick=cloudOpen;
document.querySelectorAll('[data-owner-filter]').forEach(button=>button.addEventListener('click',()=>{ownerFilter=button.dataset.ownerFilter;document.querySelectorAll('[data-owner-filter]').forEach(b=>{const selected=b===button;b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected))});render()}));
modal.addEventListener('click',e=>{if(e.target.closest('[data-close]'))closeSheet()});
const cardsElement=$('#cards');
let pressTimer=null, pressedID=null, pressStart=null, suppressClick=false;
function clearPress(){if(pressTimer!==null){clearTimeout(pressTimer);pressTimer=null;}pressedID=null;pressStart=null;}
cardsElement.addEventListener('pointerdown',e=>{
  const card=e.target.closest('[data-card-id]');
  if(!card||e.button!==0)return;
  clearPress();pressedID=card.dataset.cardId;
  pressStart={x:e.clientX,y:e.clientY};
  pressTimer=setTimeout(()=>{
    if(!pressedID)return;
    const selected=pressedID;
    clearPress();suppressClick=true;
    cardManage(selected);
  },650);
});
cardsElement.addEventListener('pointermove',e=>{
  if(pressStart&&Math.hypot(e.clientX-pressStart.x,e.clientY-pressStart.y)>12)clearPress();
});
['pointerup','pointercancel','pointerleave'].forEach(type=>cardsElement.addEventListener(type,clearPress));
cardsElement.addEventListener('contextmenu',e=>{
  const card=e.target.closest('[data-card-id]');
  if(!card)return;
  e.preventDefault();clearPress();suppressClick=true;
  if(modal.hidden)cardManage(card.dataset.cardId);
});
cardsElement.addEventListener('click',e=>{
  const card=e.target.closest('[data-card-id]');
  if(!card)return;
  if(suppressClick){suppressClick=false;return;}
  cardDetail(card.dataset.cardId);
});
cardsElement.addEventListener('keydown',e=>{
  if(e.target.matches('[data-card-id]')&&(e.key==='Enter'||e.key===' ')){
    e.preventDefault();cardDetail(e.target.dataset.cardId);
  }
});

render();if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker-family-v27.js', {updateViaCache:'none'}).catch(()=>{}));


// MARK: family shared storage via Supabase. Each card and monthly record is a separate row.
// Public publishable key is not secret; RLS grants access ONLY to household members.
const CLOUD_CONFIG='cmanager_family_cloud_config_v1';
const CLOUD_SESSION='cmanager_family_cloud_session_v1';
const CLOUD_QUEUE='cmanager_family_queue_v1';
const CLOUD_SNAPSHOT='cmanager_family_snapshot_v1';
function jsonRead(k,fallback){try{return JSON.parse(localStorage.getItem(k)||'null')??fallback}catch{return fallback}}
let cloud={config:jsonRead(CLOUD_CONFIG,null),session:jsonRead(CLOUD_SESSION,null),householdId:null,busy:false,timer:null};
let pendingOps=jsonRead(CLOUD_QUEUE,[]),lastSnapshot=jsonRead(CLOUD_SNAPSHOT,{}),suppressCloud=false;
let localEditRevision=0;
function cloudStatus(message,isError=false){for(const selector of ['#sync-status','#regular-sync-status']){const el=$(selector);if(el){el.textContent=message;el.className='sync-status'+(isError?' sync-error':'')}}}
function cloudURL(path){return cloud.config.url.replace(/\/+$/,'')+path}
function goodConfig(c){try{const u=new URL(c.url);return u.protocol==='https:'&&/^[a-z0-9-]+\.supabase\.co$/.test(u.hostname)&&u.pathname==='/'&&c.key.startsWith('sb_publishable_')}catch{return false}}
async function cloudRequest(path,options={},auth=false,retry=true){
 if(!cloud.config)throw Error('Supabase 연결 정보가 필요합니다.');
 let headers={'apikey':cloud.config.key,'Content-Type':'application/json',...(options.headers||{})};
 if(auth){if(!cloud.session?.access_token)throw Error('로그인이 필요합니다.');headers.Authorization='Bearer '+cloud.session.access_token}
 const response=await fetch(cloudURL(path),{...options,headers});
 if(response.status===401&&auth&&retry&&cloud.session?.refresh_token){await cloudRefresh();return cloudRequest(path,options,auth,false)}
 let raw=await response.text(),obj;try{obj=raw?JSON.parse(raw):null}catch{obj=raw}
 if(!response.ok)throw Error(response.status+': '+(obj?.message||obj?.error_description||obj?.error||String(raw)));
 return obj;
}
async function cloudRefresh(){
 const r=await cloudRequest('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:cloud.session.refresh_token})});
 if(!r.access_token)throw Error('세션이 만료됐습니다. 다시 로그인하세요.');
 cloud.session={...r,expires_at:Math.floor(Date.now()/1000)+(r.expires_in||3600)};
 localStorage.setItem(CLOUD_SESSION,JSON.stringify(cloud.session));
}
async function cloudEnsure(){if(!cloud.session)return false;if(cloud.session.expires_at&&Date.now()/1000>cloud.session.expires_at-90)await cloudRefresh();return true}
async function cloudLogin(email,password){
 const result=await cloudRequest('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password})});
 if(!result?.user?.id)throw Error('로그인 응답에 사용자 정보가 없습니다.');
 cloud.session={...result,expires_at:Math.floor(Date.now()/1000)+(result.expires_in||3600)};
 localStorage.setItem(CLOUD_SESSION,JSON.stringify(cloud.session));
 const memberships=await cloudRequest('/rest/v1/household_members?select=household_id&user_id=eq.'+encodeURIComponent(result.user.id),{},true);
 if(!Array.isArray(memberships)||memberships.length!==1)throw Error('가족 공유 공간을 1개만 연결해야 합니다.');
 cloud.householdId=memberships[0].household_id;
 cloudStatus('공유 로그인 성공 · '+result.user.email);
 await cloudPull(true);
}
function cloudLogout(){cloud.session=null;cloud.householdId=null;localStorage.removeItem(CLOUD_SESSION);cloudStatus('로그아웃됨 · 이 기기에 남아 있는 기록은 오프라인 참고용입니다.');}
// Stored row objects omit Supabase-generated metadata and are kept separate for independent edits.
function localRows(){
 const rows={};const put=(t,id,value)=>rows[t+'|'+id]={item_type:t,item_id:id,data:JSON.parse(JSON.stringify(value))};
 db.cards.forEach((c,index)=>put('card',c.id,{...c,order:index}));
 for(const [cid,setting] of Object.entries(tierSettings))put('tier',cid,setting);
 for(const [k,rec] of Object.entries(manualRecords))put('manual',k,rec);
 for(const [k,rec] of Object.entries(benefitStates))put('benefit_state',k,rec);
 for(const [k,rec] of Object.entries(benefitUsageRecords))put('benefit_usage',k,rec);
 for(const [cid,rec] of Object.entries(benefitModeRecords))put('benefit_mode',cid,rec);
 recurringRules.forEach(r=>put('recurring_rule',r.id,r));
 recurringEntries.forEach(e=>put('recurring_entry',e.id,e));
 if(db.records.length||db.expenses.length||db.benefits.length||db.usages.length)put('legacy','archive',{records:db.records,expenses:db.expenses,benefits:db.benefits,usages:db.usages});
 return rows;
}
function applyCloudRows(rows){
 const parsed={cards:[],records:[],expenses:[],benefits:[],usages:[]},tiers={},manual={},rules=[],entries=[],states={},usages={},modes={};
 for(const row of rows){let d=row.data;if(!d||typeof d!=='object')continue;
  switch(row.item_type){
   case 'card':if(typeof d.id==='string')parsed.cards.push(d);break;
   case 'tier':tiers[row.item_id]=d;break;
   case 'manual':manual[row.item_id]=d;break;
   case 'benefit_state':states[row.item_id]=d;break;
   case 'benefit_usage':usages[row.item_id]=d;break;
   case 'benefit_mode':modes[row.item_id]=d;break;
   case 'recurring_rule':if(d.id)rules.push(d);break;
   case 'recurring_entry':if(d.id)entries.push(d);break;
   case 'legacy':if(row.item_id==='archive')for(const k of ['records','expenses','benefits','usages'])if(Array.isArray(d[k]))parsed[k]=d[k];break;
  }
 }
 parsed.cards.sort((a,b)=>(a.order??9999)-(b.order??9999));
 // A card row can be older than a dedicated mode choice; use the newest mode record.
 for(const card of parsed.cards){const remote=modes[card.id];const local=benefitModeRecords[card.id];if(local&&(!remote||String(local.updatedAt||'')>String(remote.updatedAt||'')))modes[card.id]=local;
  if(modes[card.id]?.mode)card.benefitMode=modes[card.id].mode;}
 db=parsed;tierSettings=tiers;manualRecords=manual;recurringRules=rules;recurringEntries=entries;benefitStates=states;benefitUsageRecords=usages;benefitModeRecords=modes;
 suppressCloud=true;
 localStorage.setItem(STORAGE,JSON.stringify(db));localStorage.setItem(TIER_STORAGE,JSON.stringify(tierSettings));localStorage.setItem(MANUAL_STORAGE,JSON.stringify(manualRecords));
 localStorage.setItem(RULE_STORAGE,JSON.stringify(recurringRules));localStorage.setItem(ENTRY_STORAGE,JSON.stringify(recurringEntries));localStorage.setItem(BENEFIT_STATE_STORAGE,JSON.stringify(benefitStates));
 localStorage.setItem(BENEFIT_USAGE_STORAGE,JSON.stringify(benefitUsageRecords));localStorage.setItem(BENEFIT_MODE_STORAGE,JSON.stringify(benefitModeRecords));
 suppressCloud=false;render();
}
function queueCloudSync(){
 if(suppressCloud||!cloud.householdId)return;
 // Stage changes synchronously. A cloud pull must never erase a newly edited day
 // before a delayed debounce handler has noticed it.
 localEditRevision++;
 const now=localRows();
 for(const [key,row] of Object.entries(now))if(JSON.stringify(row)!==JSON.stringify(lastSnapshot[key])){
   pendingOps=pendingOps.filter(op=>op.key!==key);
   pendingOps.push({key,kind:'upsert',row});
 }
 for(const key of Object.keys(lastSnapshot))if(!now[key]){
   pendingOps=pendingOps.filter(op=>op.key!==key);
   pendingOps.push({key,kind:'delete',row:lastSnapshot[key]});
 }
 localStorage.setItem(CLOUD_QUEUE,JSON.stringify(pendingOps));
 cloudStatus(navigator.onLine?'변경 내용 공유 저장 중…':'인터넷 연결 없음 · 변경 내용은 이 기기에 저장됨');
 clearTimeout(cloud.timer);
 cloud.timer=setTimeout(()=>cloudFlush().catch(e=>cloudStatus('동기화 대기: '+e.message,true)),250);
}
async function cloudFlush(){
 if(cloud.busy||!cloud.householdId||!navigator.onLine)return;
 cloud.busy=true;
 try{
  await cloudEnsure();
  while(pendingOps.length){
   const op=pendingOps[0],r=op.row;
   if(op.kind==='delete'){
    await cloudRequest(`/rest/v1/shared_card_data?household_id=eq.${cloud.householdId}&item_type=eq.${encodeURIComponent(r.item_type)}&item_id=eq.${encodeURIComponent(r.item_id)}`,{method:'DELETE'},true);
    delete lastSnapshot[op.key];
   }else{
    await cloudRequest('/rest/v1/shared_card_data?on_conflict=household_id%2Citem_type%2Citem_id',{
     method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
     body:JSON.stringify({household_id:cloud.householdId,item_type:r.item_type,item_id:r.item_id,data:r.data,updated_at:new Date().toISOString(),updated_by:cloud.session.user.id})
    },true);
    lastSnapshot[op.key]=JSON.parse(JSON.stringify(r));
   }
   // An edit may have replaced this queue entry during the async request.
   // Remove only the completed operation, never a newer edit.
   const opIndex=pendingOps.indexOf(op);
   if(opIndex>=0)pendingOps.splice(opIndex,1);
   localStorage.setItem(CLOUD_QUEUE,JSON.stringify(pendingOps));localStorage.setItem(CLOUD_SNAPSHOT,JSON.stringify(lastSnapshot));
  }
  cloudStatus('공유 저장 완료 · '+new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}));
 }finally{
   cloud.busy=false;
   if(pendingOps.length&&navigator.onLine){
     clearTimeout(cloud.timer);
     cloud.timer=setTimeout(()=>cloudFlush().catch(e=>cloudStatus('동기화 대기: '+e.message,true)),300);
   }
 }
}
async function cloudPull(silent=false){
 if(!cloud.householdId)return;
 // A pending/in-flight upload must settle before downloading and replacing the UI.
 if(cloud.busy)return;
 if(pendingOps.length){
   await cloudFlush();
   if(cloud.busy||pendingOps.length)throw Error('공유 저장 중이에요. 잠시 후 새로고침하세요.');
 }
 const revisionBefore=localEditRevision;
 const data=await cloudRequest('/rest/v1/shared_card_data?select=item_type,item_id,data&household_id=eq.'+cloud.householdId+'&limit=10000',{},true);
 if(!Array.isArray(data))throw Error('공유 데이터를 읽지 못했습니다.');
 // A user may edit while fetch is in flight. Never overwrite that edit.
 if(revisionBefore!==localEditRevision||cloud.busy||pendingOps.length){
   cloudStatus('수정한 내용을 먼저 공유 저장하는 중…');
   return;
 }
 lastSnapshot=Object.fromEntries(data.map(row=>[row.item_type+'|'+row.item_id,row]));
 localStorage.setItem(CLOUD_SNAPSHOT,JSON.stringify(lastSnapshot));
 applyCloudRows(data);
 if(!silent)cloudStatus('공유 데이터 최신 상태로 갱신됨');
 maybeShowReminder();
}
async function replaceCloudFromLocal(){
 if(!cloud.householdId)throw Error('로그인해야 공동 데이터를 바꿀 수 있습니다.');
 await cloudEnsure();
 const old=await cloudRequest('/rest/v1/shared_card_data?select=item_type,item_id&household_id=eq.'+cloud.householdId,{},true);
 const rows=localRows();
 for(const item of old){if(!rows[item.item_type+'|'+item.item_id]){
  await cloudRequest('/rest/v1/shared_card_data?household_id=eq.'+cloud.householdId+'&item_type=eq.'+encodeURIComponent(item.item_type)+'&item_id=eq.'+encodeURIComponent(item.item_id),{method:'DELETE'},true);
 }}
 lastSnapshot={};pendingOps=[];localStorage.setItem(CLOUD_QUEUE,'[]');
 queueCloudSync();
 await new Promise(resolve=>setTimeout(resolve,550));await cloudFlush();
 cloudStatus('공유 데이터 교체 요청 완료');
}
function cloudOpen(){
 openSheet('부부 공유 설정',`<div class="panel"><h3>공유 상태</h3><p id="cloud-sheet-status" class="note"></p><div class="actions"><button id="cloud-refresh" class="secondary">최신 데이터 불러오기</button><button id="cloud-logout" class="secondary">로그아웃</button></div></div>
 <div class="panel"><h3>① Supabase 연결</h3><p class="note">Project URL은 https://프로젝트ID.supabase.co 형식만 입력해요. 관리자 비밀 키는 사용하지 마세요.</p><label class="formlabel">Project URL</label><input id="cloud-url" type="url" autocomplete="off" value="${esc(cloud.config?.url||'')}" placeholder="https://xxxx.supabase.co"><label class="formlabel">Publishable key</label><input id="cloud-key" autocapitalize="off" autocomplete="off" value="${esc(cloud.config?.key||'')}" placeholder="sb_publishable_..."><div class="actions"><button class="primary" id="cloud-save-config">연결 정보 저장</button></div><p id="config-message" class="note"></p></div>
 <div class="panel"><h3>② 앱 계정 로그인</h3><label class="formlabel">이메일</label><input id="cloud-email" type="email" autocomplete="username" placeholder="이메일"><label class="formlabel">비밀번호</label><input id="cloud-password" type="password" autocomplete="current-password" placeholder="비밀번호"><div class="actions"><button class="primary" id="cloud-login">로그인하고 가족 공유 시작</button></div><p id="login-message" class="note"></p></div>
 <div class="panel"><h3>데이터 주의사항</h3><p class="note">공유 로그인 후 서버 데이터가 이 테스트 앱의 로컬 데이터보다 우선합니다. 기존 cmanager 앱은 별도로 유지되며, JSON 백업은 언제든 만들 수 있습니다. 오프라인 변경 후 두 사람이 같은 항목을 동시에 수정하면 마지막 저장 내용이 우선할 수 있습니다.</p></div>`);
 $('#cloud-sheet-status').textContent=cloud.householdId?'가족 공유 연결됨 · '+(cloud.session?.user?.email||''):'가족 공유 로그인 전';
 $('#cloud-save-config').onclick=()=>{const next={url:$('#cloud-url').value.trim().replace(/\/+$/,''),key:$('#cloud-key').value.trim()};
  if(!goodConfig(next)){$('#config-message').textContent='URL은 https://프로젝트ID.supabase.co, 키는 sb_publishable_... 형식이어야 합니다.';return}
  cloud.config=next;localStorage.setItem(CLOUD_CONFIG,JSON.stringify(next));$('#config-message').textContent='이 기기에 연결 정보를 저장했어요.';
 };
 $('#cloud-login').onclick=async()=>{const btn=$('#cloud-login');btn.disabled=true;$('#login-message').textContent='로그인 중...';
 try{await cloudLogin($('#cloud-email').value.trim(),$('#cloud-password').value);$('#login-message').textContent='가족 공유 로그인 성공!';$('#cloud-sheet-status').textContent='가족 공유 연결됨 · '+cloud.session.user.email;}
 catch(e){$('#login-message').textContent='로그인 오류: '+e.message;}finally{btn.disabled=false}
 };
 $('#cloud-refresh').onclick=async()=>{try{await cloudPull();$('#cloud-sheet-status').textContent='공유 데이터 새로고침 완료'}catch(e){$('#cloud-sheet-status').textContent='오류: '+e.message}};
 $('#cloud-logout').onclick=()=>{cloudLogout();closeSheet()};
}
function maybeShowReminder(){
 const due=dueItems();if(!due.length||!modal.hidden)return;
 const key='cmanager_family_reminder_'+day();if(localStorage.getItem(key))return;
 localStorage.setItem(key,'1');
 // In-app reminder only: no background push permission is implied.
 if(modal.hidden)setTimeout(()=>{if(modal.hidden&&dueItems().length)regularOpen(due[0].card.id)},500);
}
async function cloudInit(){
 if(!cloud.config||!cloud.session)return;
 try{
  await cloudEnsure();const user=cloud.session.user;
  if(!user?.id)throw Error('로그인 정보가 없어요');
  const list=await cloudRequest('/rest/v1/household_members?select=household_id&user_id=eq.'+encodeURIComponent(user.id),{},true);
  if(list?.length!==1)throw Error('가족 관리 공간을 찾지 못했습니다');
  cloud.householdId=list[0].household_id;
  // Clear pending operations from another household; this app is scoped to one family space.
  cloudStatus('가족 공유 연결됨 · 최신 기록 확인 중');
  await cloudPull(true);cloudStatus('가족 공유 연결됨');
 }catch(e){cloudStatus('공유 연결 확인 필요: '+e.message,true)}
}
window.addEventListener('online',()=>{cloudFlush().then(()=>cloudPull()).catch(e=>cloudStatus(e.message,true))});
window.addEventListener('focus',()=>{if(cloud.householdId&&!cloud.busy&&modal.hidden)cloudPull(true).catch(()=>{})});
setInterval(()=>{if(cloud.householdId&&navigator.onLine&&!cloud.busy&&modal.hidden)cloudPull(true).catch(()=>{})},30000);
cloudInit();setTimeout(()=>maybeShowReminder(),1100);
