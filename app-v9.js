// CManager PWA v9: manual performance and remaining discounts; preserves prior records and backup compatibility.
'use strict';
/* Personal data stays in this device's browser storage; the hosting server never receives it. */
const STORAGE='cmanager_data_v1';
const TIER_STORAGE='cmanager_tiers_v1';
const MANUAL_STORAGE='cmanager_manual_v1';
let manualRecords=readManual();
function readManual(){try{const d=JSON.parse(localStorage.getItem(MANUAL_STORAGE)||'{}');return d&&typeof d==='object'&&!Array.isArray(d)?d:{}}catch{return {}}}
function writeManual(){localStorage.setItem(MANUAL_STORAGE,JSON.stringify(manualRecords))}
const manualKey=(cid,m)=>cid+'|'+m;

let tierSettings=readTiers();
function readTiers(){try{const x=JSON.parse(localStorage.getItem(TIER_STORAGE)||'{}');return x&&typeof x==='object'&&!Array.isArray(x)?x:{}}catch{return {}}}
function saveTiers(){try{localStorage.setItem(TIER_STORAGE,JSON.stringify(tierSettings))}catch(e){alert('목표 실적 설정을 저장하지 못했어. '+e.message)}}

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
function readDB(){try{const parsed=JSON.parse(localStorage.getItem(STORAGE));if(parsed&&KEYS.every(k=>Array.isArray(parsed[k])))return parsed}catch{}return EMPTY()}
function save(){try{localStorage.setItem(STORAGE,JSON.stringify(db))}catch(e){alert('저장 공간이 부족하거나 저장이 차단되어 있어요. 백업 파일을 저장해 주세요.\n'+e.message)}render()}
const expenseMonth=e=>String(e.date||'').slice(0,7);
const legacy=(cid,m)=>db.records.find(x=>x.cardID===cid&&x.month===m);
const monthExpenses=(cid,m)=>db.expenses.filter(x=>x.cardID===cid&&expenseMonth(x)===m);
const cardBenefits=cid=>db.benefits.filter(x=>x.cardID===cid);
const usageMonth=u=>String(u.date||'').slice(0,7);
function stats(cid,m){
 const entered=manualRecords[manualKey(cid,m)];
 const ex=monthExpenses(cid,m),old=legacy(cid,m);
 const priorEligible=ex.length?sum(ex.filter(e=>!e.excluded),'amount'):(old?.spending||0);
 const bid=new Set(cardBenefits(cid).map(x=>x.id));
 const uses=db.usages.filter(x=>bid.has(x.benefitID)&&usageMonth(x)===m);
 const priorUsed=uses.length?sum(uses,'amount'):(old?.benefitUsed||0);
 const card=db.cards.find(x=>x.id===cid);
 const benefitCeiling=tierFor(card||{target:1,benefitLimit:0,id:cid}).tiers.filter(t=>t.threshold<=priorEligible).at(-1)?.benefit ?? Number(card?.benefitLimit||0);
 return {eligible:entered?Number(entered.eligible)||0:priorEligible,
   benefitRemaining:entered?Math.max(0,Number(entered.benefitRemaining)||0):Math.max(0,benefitCeiling-priorUsed),
   manual:!!entered};
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
 return `<p class="note">원하는 구간을 누르면 내 목표로 바로 저장돼요.</p><div class="tier-list">${cfg.tiers.map(t=>`<button type="button" class="tier-line tier-choice ${eligible>=t.threshold?'tier-done':''} ${t.threshold===cfg.goal?'tier-goal':''}" data-select-goal="${t.threshold}" aria-pressed="${t.threshold===cfg.goal}"><span>${eligible>=t.threshold?'✓':'○'} ${won(t.threshold)} 이상</span><b>할인 한도 ${won(t.benefit)}</b><em>${t.threshold===cfg.goal?'● 내 목표':'선택'}</em></button>`).join('')}</div>`;
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
 const cfg=tierFor(card);
 const rows=cfg.tiers.map(x=>`${x.threshold}:${x.benefit}`).join('\n');
 let chosenGoal=cfg.goal;
 openSheet('실적 구간 설정',`<form><p class="note">실적금액:혜택금액을 한 줄씩 입력한 후, 아래 구간을 탭해 목표를 선택해 줘.</p><label class="formlabel">실적 구간과 혜택 금액</label><textarea name="tiers" rows="6" required placeholder="300000:10000\n500000:20000">${esc(rows)}</textarea><p class="note">예시: 300000:10000 (실적 30만 원 · 혜택 1만 원). 입력을 바꾸면 아래 선택지가 자동으로 바뀌어.</p><label class="formlabel">목표 실적 구간 선택</label><div id="tier-options" class="tier-options" role="group" aria-label="목표 실적 구간 선택"></div><p id="tier-error" class="note warn" aria-live="polite"></p><div class="actions"><button class="primary" type="submit">구간 및 목표 저장</button><button type="button" class="secondary" id="cancel-tier">취소</button></div></form>`);
 const textarea=body.querySelector('textarea[name="tiers"]'),choices=$('#tier-options'),error=$('#tier-error');
 function redrawChoices(){
  const result=parseTierRows(textarea.value);
  if(result.error){choices.innerHTML='';error.textContent=result.error;return null;}
  const parsed=result.tiers;
  if(!parsed.some(x=>x.threshold===chosenGoal))chosenGoal=parsed[0].threshold;
  error.textContent='';
  choices.innerHTML=parsed.map(t=>`<button type="button" class="tier-option ${t.threshold===chosenGoal?'selected':''}" data-goal-option="${t.threshold}" aria-pressed="${t.threshold===chosenGoal}"><span><strong>${won(t.threshold)} 이상</strong><small>혜택 ${won(t.benefit)}</small></span><span class="tier-check">${t.threshold===chosenGoal?'✓ 선택됨':'선택하기'}</span></button>`).join('');
  choices.querySelectorAll('[data-goal-option]').forEach(btn=>btn.addEventListener('click',()=>{chosenGoal=Number(btn.dataset.goalOption);redrawChoices()}));
  return parsed;
 }
 textarea.addEventListener('input',redrawChoices);redrawChoices();
 $('#cancel-tier').onclick=()=>cardDetail(cid,m);
 bindForm(()=>{
  const parsed=redrawChoices();if(!parsed)return;
  tierSettings[cid]={tiers:parsed,goal:chosenGoal};
  saveTiers();render();cardDetail(cid,m);
 });
}
function render(){
 const m=month();
 const remaining=db.cards.reduce((total,card)=>total+tierStatus(card,stats(card.id,m).eligible).remaining,0);
 $('#current-month').textContent=monthLabel(m)+' 이용 현황';
 $('#card-count').textContent=db.cards.length+'개';
 $('#card-achieved').textContent=db.cards.filter(c=>tierStatus(c,stats(c.id,m).eligible).remaining===0).length+' / '+db.cards.length;
 $('#total-remaining').textContent=won(remaining);
 $('#cards').innerHTML=db.cards.length?db.cards.map((c,i)=>{
  const st=stats(c.id,m),ts=tierStatus(c,st.eligible),pct=Math.min(100,Math.round(st.eligible/ts.goal*100)),col=colors[i%colors.length];
  return `<article class="card card-selectable" data-card-id="${esc(c.id)}" tabindex="0" role="button" aria-label="${esc(c.name)} 실적과 할인 잔여 금액 관리. 길게 누르면 카드 관리 메뉴">
  <div class="cardtop"><div class="cardico" style="background:${col}">${icons[i%icons.length]}</div><div class="tap"><div class="cardname">${esc(c.name)}</div><div class="sub">선택 목표 ${won(ts.goal)}</div></div><span class="pill">${ts.remaining===0?'목표 달성':'진행 중'}</span></div>
  <div class="card-summary"><div class="row"><span class="label">이번 달 인정 실적</span><b style="color:${col}">${pct}%</b></div><div class="progress"><div style="width:${pct}%;background:${col}"></div></div><div class="row"><b>${won(st.eligible)}</b><span class="label">${ts.remaining===0?'내 목표 달성':won(ts.remaining)+' 남음'}</span></div></div>
  <div class="manual-benefit"><span>남은 할인 혜택</span><strong>${won(st.benefitRemaining)}</strong></div>
  <div class="tier-hint"><span>${ts.current?'현재 '+won(ts.current.threshold)+' 구간 달성':'달성한 구간 없음'}</span><span>${ts.next?'다음 '+won(ts.next.threshold)+' · '+won(ts.next.threshold-st.eligible)+' 남음':'최고 구간 달성'}</span></div>
  </article>`;
 }).join(''):'<div class="empty">💳<h3>등록된 카드가 없어요</h3><p>카드 추가 버튼으로 시작하세요.</p></div>';
}
const modal=$('#modal'),title=$('#sheet-title'),body=$('#sheet-body');
function openSheet(t,html){title.textContent=t;body.innerHTML=html;modal.hidden=false;document.body.style.overflow='hidden';body.scrollTop=0}
function closeSheet(){modal.hidden=true;document.body.style.overflow='';body.innerHTML=''}
const numeric=(form,name)=>Math.max(0,Math.round(Number(new FormData(form).get(name))||0));
const v=(form,name)=>String(new FormData(form).get(name)||'').trim();
const dateInput=(name,value=day())=>`<label class="formlabel">날짜</label><input name="${name}" type="date" value="${esc(value)}" required>`;
const numberInput=(label,name,value='')=>`<label class="formlabel">${label}</label><input name="${name}" type="number" inputmode="numeric" min="0" step="1" value="${esc(value)}" required>`;
function bindForm(fn){const f=body.querySelector('form');f?.addEventListener('submit',e=>{e.preventDefault();fn(f)})}
function cardAdd(){openSheet('카드 추가',`<form><label class="formlabel">카드 이름</label><input name="name" placeholder="예: 롯데카드" maxlength="80" required>${numberInput('목표 실적 (원)','target')}${numberInput('월 최대 혜택 (원)','limit')}<div class="actions"><button class="primary" type="submit">카드 저장</button></div></form>`);bindForm(f=>{const name=v(f,'name');if(!name)return;db.cards.push({id:id(),name,target:numeric(f,'target'),benefitLimit:numeric(f,'limit')});save();closeSheet()})}
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
      <div class="manage-buttons"><button class="secondary" data-manage-edit="${esc(c.id)}">✎ 이름 수정</button><button class="secondary" data-manage-move="${esc(c.id)}" data-direction="-1" ${i===0?'disabled':''}>↑ 위로</button><button class="secondary" data-manage-move="${esc(c.id)}" data-direction="1" ${i===db.cards.length-1?'disabled':''}>↓ 아래로</button><button class="danger" data-manage-delete="${esc(c.id)}">삭제</button></div>
    </div>`).join('');
  openSheet('카드 관리',`<p class="note">여기에서만 카드 이름과 순서를 변경할 수 있어요. 카드의 실적 및 결제 기록은 그대로 유지됩니다.</p>${list||'<p class="empty">등록된 카드가 없어요.</p>'}`);
  body.querySelectorAll('[data-manage-edit]').forEach(el=>el.onclick=()=>cardRename(el.dataset.manageEdit));
  body.querySelectorAll('[data-manage-move]').forEach(el=>el.onclick=()=>{const cid=el.dataset.manageMove;moveCard(cid,Number(el.dataset.direction));cardManage(cid)});
  body.querySelectorAll('[data-manage-delete]').forEach(el=>el.onclick=()=>{
    if(!confirm('이 카드를 삭제할까요? 과거 월별 기록은 남겨둡니다.'))return;
    db.cards=db.cards.filter(c=>c.id!==el.dataset.manageDelete);save();cardManage();
  });
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
 openSheet(c.name,`<div class="panel"><div class="row"><b>${monthLabel(m)} 실적 · 혜택</b><input class="monthpick" type="month" id="detail-month" value="${esc(m)}"></div>
 <p class="note">카드사 앱에서 확인한 금액 두 가지를 그대로 입력하면 돼요. 결제별 입력이나 실적 제외 계산은 하지 않아요.</p>
 <form id="manual-form">${numberInput('현재 인정 실적 (원)','eligible',st.eligible)}${numberInput('남은 할인 혜택 (원)','benefitRemaining',st.benefitRemaining)}
 <div class="actions"><button class="primary" type="submit">금액 저장</button></div></form>
 <div class="manual-summary"><div class="row"><span>선택 목표</span><strong>${won(ts.goal)}</strong></div><div class="row"><span>목표까지 남은 실적</span><strong class="highlight">${won(ts.remaining)}</strong></div></div>
 ${!st.manual?'<p class="note">기존 기록을 참고한 초기값이야. 카드사 앱에서 확인한 실제 금액으로 한 번 저장해 줘.</p>':''}</div>
 <div class="panel"><div class="row"><h3>실적 구간 · 목표 설정</h3><button class="secondary" id="edit-tiers">구간 수정</button></div>
 <p class="note">실적·혜택 구간은 한 번 설정하고, 원하는 목표 구간을 눌러 변경할 수 있어요.</p>${tierLines(c,st.eligible)}</div>`);
 $('#detail-month').addEventListener('change',e=>cardDetail(cid,e.target.value));
 $('#manual-form').addEventListener('submit',e=>{
  e.preventDefault();const f=e.currentTarget;
  const a=Number(new FormData(f).get('eligible')),b=Number(new FormData(f).get('benefitRemaining'));
  if(!Number.isSafeInteger(a)||a<0||!Number.isSafeInteger(b)||b<0){alert('두 금액을 0 이상의 정수로 입력해 줘.');return}
  const key=manualKey(cid,m);
  const prev=manualRecords[key];
  manualRecords[key]={eligible:a,benefitRemaining:b,updatedAt:new Date().toISOString()};
  try{writeManual();render();cardDetail(cid,m)}catch(err){if(prev===undefined)delete manualRecords[key];else manualRecords[key]=prev;alert('금액 저장 실패: '+err.message)}
 });
 body.querySelectorAll('[data-select-goal]').forEach(btn=>btn.onclick=()=>setGoal(cid,Number(btn.dataset.selectGoal),m));
 $('#edit-tiers').onclick=()=>tierEdit(cid,m);
}
function history(){
 const months=[...new Set([...db.records.map(x=>x.month),...db.expenses.map(expenseMonth),...db.usages.map(usageMonth),...Object.keys(manualRecords).map(k=>k.slice(-7))])].filter(m=>/^\d{4}-\d{2}$/.test(m)).sort().reverse();
 const historicalIds=[...new Set([...db.cards.map(x=>x.id),...db.records.map(x=>x.cardID),...db.expenses.map(x=>x.cardID)])];
 const blocks=months.map(m=>{
  const list=historicalIds.filter(cid=>manualRecords[manualKey(cid,m)]||legacy(cid,m)||monthExpenses(cid,m).length).map(cid=>{
   const c=db.cards.find(x=>x.id===cid),st=stats(cid,m);
   return `<div class="panel"><b>${esc(c?.name||'삭제된 카드')}</b><div class="item row"><span>인정 실적</span><b class="highlight">${won(st.eligible)}</b></div><div class="item row"><span>남은 할인 혜택</span><b>${won(st.benefitRemaining)}</b></div></div>`;
  }).join('');return list?`<div class="groupheader">${monthLabel(m)}</div>${list}`:'';
 }).join('');
 openSheet('월별 기록',blocks||'<div class="empty">아직 저장된 기록이 없어요.</div>');
}
const APPLE_EPOCH_MS=978307200000;
const toSwiftDate=d=>(new Date(String(d).length===7?d+'-01':d+'T12:00:00').getTime()-APPLE_EPOCH_MS)/1000;
const localDateString=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const fromSwiftDate=v=>{if(typeof v==='number')return localDateString(new Date(APPLE_EPOCH_MS+v*1000));if(typeof v==='string'){const date=new Date(v);if(!Number.isNaN(date.getTime()))return localDateString(date)}throw new Error('날짜 형식을 읽을 수 없어요')};
function exportBackup(){const out={version:1,tierSettings,manualRecords,createdAt:(Date.now()-APPLE_EPOCH_MS)/1000,cards:db.cards,records:db.records,expenses:db.expenses.map(x=>({...x,date:toSwiftDate(x.date)})),benefits:db.benefits,usages:db.usages.map(x=>({...x,date:toSwiftDate(x.date)}))};const blob=new Blob([JSON.stringify(out,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='CardManager_Backup_'+new Date().toISOString().slice(0,10)+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)}
function validateBackup(x){if(!x||x.version!==1||!['cards','records','expenses','benefits','usages'].every(k=>Array.isArray(x[k])))throw new Error('지원되지 않는 백업 파일이야. 기존 카드관리 앱의 JSON 파일인지 확인해 줘.');if(x.tierSettings!==undefined&&(typeof x.tierSettings!=='object'||x.tierSettings===null||Array.isArray(x.tierSettings)))throw Error('목표 구간 설정 형식이 잘못됐어');if(x.manualRecords!==undefined&&(typeof x.manualRecords!=='object'||x.manualRecords===null||Array.isArray(x.manualRecords)))throw Error('직접 입력 기록 형식이 잘못됐어');if(x.manualRecords){for(const rec of Object.values(x.manualRecords)){if(!rec||!Number.isSafeInteger(rec.eligible)||rec.eligible<0||!Number.isSafeInteger(rec.benefitRemaining)||rec.benefitRemaining<0)throw Error('수동 실적/혜택 기록 형식이 잘못됐어')}}for(const c of x.cards){if(typeof c.id!=='string'||typeof c.name!=='string'||!Number.isFinite(c.target)||!Number.isFinite(c.benefitLimit))throw Error('카드 정보 형식이 잘못됐어')}for(const e of x.expenses){if(typeof e.id!=='string'||typeof e.cardID!=='string'||typeof e.merchant!=='string'||!Number.isFinite(e.amount))throw Error('결제 기록 형식이 잘못됐어')}for(const r of x.records){if(typeof r.cardID!=='string'||typeof r.month!=='string'||!Number.isFinite(r.spending)||!Number.isFinite(r.benefitUsed))throw Error('월별 기록 형식이 잘못됐어')}for(const b of x.benefits){if(typeof b.id!=='string'||typeof b.cardID!=='string'||typeof b.title!=='string'||!Number.isFinite(b.monthlyLimit))throw Error('혜택 정보 형식이 잘못됐어')}for(const u of x.usages){if(typeof u.id!=='string'||typeof u.benefitID!=='string'||!Number.isFinite(u.amount))throw Error('혜택 사용 기록 형식이 잘못됐어')}}
function importBackup(file){if(!file)return;const reader=new FileReader();reader.onload=()=>{try{const x=JSON.parse(reader.result);validateBackup(x);const next={cards:x.cards,records:x.records,expenses:x.expenses.map(e=>({...e,date:fromSwiftDate(e.date)})),benefits:x.benefits,usages:x.usages.map(u=>({...u,date:fromSwiftDate(u.date)}))};if(confirm(`백업 파일에 카드 ${next.cards.length}개, 결제 내역 ${next.expenses.length}건이 있어요.\n\n현재 웹앱의 모든 기록을 백업 파일의 내용으로 교체할까요?`)){db=next;tierSettings=x.tierSettings||{};manualRecords=x.manualRecords||{};saveTiers();writeManual();save();closeSheet();alert('복원했어. 현재 카드와 기록을 확인해 줘.')}}catch(e){alert('백업 복원에 실패했어.\n'+e.message)}};reader.onerror=()=>alert('파일을 읽지 못했어.');reader.readAsText(file)}
function backup(){openSheet('백업 및 복원',`<div class="panel"><h3>iCloud Drive 파일 백업</h3><p class="note">직접 입력한 실적·남은 혜택과 실적 구간, 기존 결제·혜택·월별 기록까지 하나의 JSON 파일로 저장해요. 앱 파일은 GitHub에 있지만 개인 기록은 이 기기에만 저장돼요.</p><div class="actions"><button class="primary" id="export">⬆ 백업 파일 만들기</button></div><p class="note">iPhone Safari에서 다운로드한 파일은 파일 앱의 '다운로드'에서 찾을 수 있어요. 필요하면 파일 앱에서 iCloud Drive로 이동해 줘.</p></div><div class="panel"><h3>백업에서 복원</h3><label class="formlabel">기존 Swift 앱 또는 웹앱에서 만든 JSON 백업 선택</label><input type="file" id="import" accept=".json,application/json"><p class="warn note">복원 시 웹앱의 현재 데이터가 모두 교체돼요. 현재 데이터도 먼저 백업해 줘.</p></div><div class="panel"><h3>주의사항</h3><p class="note">이 웹앱의 데이터는 아이폰의 웹 저장 공간에 보관돼요. Safari 데이터 삭제나 앱 제거 시 사라질 수 있으므로 정기적으로 JSON 백업을 만들어 iCloud Drive에 보관해 줘. 같은 주소여도 부부의 아이폰은 각자의 데이터를 사용해요.</p></div>`);$('#export').onclick=exportBackup;$('#import').onchange=e=>importBackup(e.target.files[0])}
$('#add-card').onclick=cardAdd;
$('#history-open').onclick=history;
$('#backup-open').onclick=backup;
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

render();if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker-v9.js', {updateViaCache:'none'}).catch(()=>{}));
