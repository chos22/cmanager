'use strict';
/* Personal data stays in this device's browser storage; the hosting server never receives it. */
const STORAGE='cmanager_data_v1';
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
function stats(cid,m){const ex=monthExpenses(cid,m),old=legacy(cid,m),be=cardBenefits(cid),bid=new Set(be.map(x=>x.id)),us=db.usages.filter(x=>bid.has(x.benefitID)&&usageMonth(x)===m),total=ex.length?sum(ex,'amount'):(old?.spending||0),eligible=ex.length?sum(ex.filter(e=>!e.excluded),'amount'):(old?.spending||0),used=us.length?sum(us,'amount'):(old?.benefitUsed||0);return{total,eligible,excluded:ex.length?sum(ex.filter(e=>e.excluded),'amount'):0,used}}
function sum(items,k){return items.reduce((s,x)=>s+(Number(x[k])||0),0)}
function render(){
  const m=month();
  $('#current-month').textContent=monthLabel(m)+' 이용 현황';
  $('#card-count').textContent=db.cards.length+'개';
  $('#card-achieved').textContent=db.cards.filter(c=>stats(c.id,m).eligible>=c.target).length+' / '+db.cards.length;
  $('#total-benefits').textContent=won(db.cards.reduce((s,c)=>s+Math.max(0,c.benefitLimit-stats(c.id,m).used),0));
  const area=$('#cards');
  area.innerHTML=db.cards.length?db.cards.map((c,i)=>{
    const st=stats(c.id,m),pct=c.target?Math.min(100,Math.round(st.eligible/c.target*100)):0,col=colors[i%colors.length];
    return `<article class="card card-selectable" data-card-id="${esc(c.id)}" tabindex="0" role="button" aria-label="${esc(c.name)} 결제 및 혜택 관리. 길게 누르면 카드 관리 메뉴">
      <div class="cardtop"><div class="cardico" style="background:${col}">${icons[i%icons.length]}</div><div class="tap"><div class="cardname">${esc(c.name)}</div><div class="sub">목표 실적 ${won(c.target)}</div></div><span class="pill">${pct>=100?'달성 완료':'진행 중'}</span></div>
      <div class="card-summary"><div class="row"><span class="label">이번 달 실적 인정 금액</span><b style="color:${col}">${pct}%</b></div><div class="progress"><div style="width:${pct}%;background:${col}"></div></div><div class="row"><b>${won(st.eligible)}</b><span class="label">${pct>=100?'목표 달성':won(Math.max(0,c.target-st.eligible))+' 남음'}</span></div></div>
      <div class="benefits"><div class="benefitbox">사용 혜택<b>${won(st.used)}</b></div><div class="benefitbox" style="color:${col}">남은 혜택<b>${won(Math.max(0,c.benefitLimit-st.used))}</b></div></div>
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
function cardDetail(cid,m=month()){const c=db.cards.find(x=>x.id===cid);if(!c){closeSheet();return}const st=stats(cid,m),ex=monthExpenses(cid,m).sort((a,b)=>b.date.localeCompare(a.date)),be=cardBenefits(cid),old=legacy(cid,m);
const expenseList=ex.map(e=>`<div class="item"><div class="row"><div class="itemtitle">${esc(e.merchant)}</div><b>${won(e.amount)}</b></div><div class="row"><span class="note">${esc(e.date)} · ${e.excluded?`<span class="warn">실적 제외: ${esc(e.exclusionReason||'기타')}</span>`:'실적 포함'}</span><button class="danger" data-del-expense="${esc(e.id)}">삭제</button></div></div>`).join('')||'<p class="note">아직 결제 내역이 없어요.</p>';
const benefitsList=be.map(b=>{const used=sum(db.usages.filter(x=>x.benefitID===b.id&&usageMonth(x)===m),'amount');return `<div class="item"><div class="row"><b>${esc(b.title)} <span class="note">${esc(b.kind)}</span></b><button class="danger" data-del-benefit="${esc(b.id)}">삭제</button></div><div class="row"><span class="note">사용 ${won(used)} · 잔여 ${won(Math.max(0,b.monthlyLimit-used))}</span><button class="secondary" data-add-usage="${esc(b.id)}">사용 기록</button></div></div>`}).join('')||'<p class="note">등록된 카드 혜택이 없어요.</p>';
openSheet(c.name,`<div class="panel"><div class="row"><b>${monthLabel(m)} 이용 현황</b><input class="monthpick" type="month" id="detail-month" value="${esc(m)}"></div><div class="item row"><span>총 결제액</span><b>${won(st.total)}</b></div><div class="item row"><span>실적 제외</span><b class="warn">${won(st.excluded)}</b></div><div class="item row"><span>실적 인정</span><b class="highlight">${won(st.eligible)}</b></div><div class="item row"><span>목표까지</span><b>${won(Math.max(0,c.target-st.eligible))}</b></div><div class="item row"><span>사용 혜택</span><b>${won(st.used)}</b></div><div class="item row"><span>남은 전체 혜택</span><b class="highlight">${won(Math.max(0,c.benefitLimit-st.used))}</b></div></div><div class="panel"><div class="row"><h3>결제 내역</h3><button class="secondary" id="create-expense">＋ 추가</button></div>${expenseList}</div><div class="panel"><div class="row"><h3>카드 혜택</h3><button class="secondary" id="create-benefit">＋ 추가</button></div>${benefitsList}</div>${ex.length===0?`<div class="panel"><h3>기존 수동 기록</h3><p class="note">결제 내역을 입력하면 해당 월의 결제·실적은 새 내역 기준으로 계산해요.</p><button class="secondary" id="edit-legacy">수동 금액 수정</button><p class="note">현재 수동 입력 ${won(old?.spending||0)} · 혜택 ${won(old?.benefitUsed||0)}</p></div>`:''}`);
$('#detail-month').addEventListener('change',e=>cardDetail(cid,e.target.value));$('#create-expense').onclick=()=>expenseForm(cid,m);$('#create-benefit').onclick=()=>benefitForm(cid,m);if($('#edit-legacy'))$('#edit-legacy').onclick=()=>legacyForm(cid,m);
body.querySelectorAll('[data-del-expense]').forEach(x=>x.onclick=()=>{if(confirm('이 결제 내역을 삭제할까요?')){db.expenses=db.expenses.filter(e=>e.id!==x.dataset.delExpense);save();cardDetail(cid,m)}});
body.querySelectorAll('[data-del-benefit]').forEach(x=>x.onclick=()=>{if(confirm('이 혜택을 삭제할까요? 사용 기록은 과거 내역 보존을 위해 남겨둡니다.')){db.benefits=db.benefits.filter(e=>e.id!==x.dataset.delBenefit);save();cardDetail(cid,m)}});
body.querySelectorAll('[data-add-usage]').forEach(x=>x.onclick=()=>usageForm(x.dataset.addUsage,cid,m));}
function expenseForm(cid,m){openSheet('결제 내역 추가',`<form>${dateInput('date',m===month()?day():m+'-01')}<label class="formlabel">사용처</label><input name="merchant" maxlength="100" required placeholder="예: 편의점">${numberInput('결제 금액 (원)','amount')}<label class="formlabel"><input type="checkbox" name="excluded" id="excluded"> 실적 제외 결제</label><label class="formlabel">실적 제외 사유 (선택)</label><input name="reason" placeholder="예: 상품권, 관리비"><p class="note">실적 제외를 선택하면 총 결제액에는 포함되고 실적 인정액에서만 빠져요.</p><div class="actions"><button class="primary">결제 저장</button><button type="button" class="secondary" id="back">돌아가기</button></div></form>`);$('#back').onclick=()=>cardDetail(cid,m);bindForm(f=>{db.expenses.push({id:id(),cardID:cid,date:v(f,'date'),merchant:v(f,'merchant'),amount:numeric(f,'amount'),excluded:!!new FormData(f).get('excluded'),exclusionReason:v(f,'reason')});save();cardDetail(cid,m)})}
function benefitForm(cid,m){openSheet('카드 혜택 추가',`<form><label class="formlabel">혜택 이름</label><input name="title" required maxlength="80" placeholder="예: 커피 할인"><label class="formlabel">혜택 종류</label><select name="kind"><option>할인</option><option>적립</option><option>기타</option></select>${numberInput('월별 혜택 한도 (원)','limit')}<div class="actions"><button class="primary">혜택 저장</button><button type="button" class="secondary" id="back">돌아가기</button></div></form>`);$('#back').onclick=()=>cardDetail(cid,m);bindForm(f=>{db.benefits.push({id:id(),cardID:cid,title:v(f,'title'),kind:v(f,'kind'),monthlyLimit:numeric(f,'limit')});save();cardDetail(cid,m)})}
function usageForm(bid,cid,m){const b=db.benefits.find(x=>x.id===bid);if(!b)return cardDetail(cid,m);openSheet('혜택 사용 기록',`<form><p>${esc(b.title)} · 월 한도 ${won(b.monthlyLimit)}</p>${dateInput('date',m===month()?day():m+'-01')}${numberInput('사용한 혜택 금액 (원)','amount')}<div class="actions"><button class="primary">사용 기록 저장</button><button type="button" class="secondary" id="back">돌아가기</button></div></form>`);$('#back').onclick=()=>cardDetail(cid,m);bindForm(f=>{db.usages.push({id:id(),benefitID:bid,date:v(f,'date'),amount:numeric(f,'amount')});save();cardDetail(cid,m)})}
function legacyForm(cid,m){const rec=legacy(cid,m);openSheet('기존 수동 금액 수정',`<form><p class="note">${monthLabel(m)} · 결제 내역이 없을 때만 결제 금액의 기준이 돼요.</p>${numberInput('수동 이용 금액','spending',rec?.spending||0)}${numberInput('수동 사용 혜택','benefitUsed',rec?.benefitUsed||0)}<div class="actions"><button class="primary">저장</button><button type="button" class="secondary" id="back">돌아가기</button></div></form>`);$('#back').onclick=()=>cardDetail(cid,m);bindForm(f=>{db.records=db.records.filter(r=>!(r.cardID===cid&&r.month===m));db.records.push({cardID:cid,month:m,spending:numeric(f,'spending'),benefitUsed:numeric(f,'benefitUsed')});save();cardDetail(cid,m)})}
function history(){const months=[...new Set([...db.records.map(x=>x.month),...db.expenses.map(expenseMonth),...db.usages.map(usageMonth)])].filter(Boolean).sort().reverse();const ids=[...new Set([...db.cards.map(x=>x.id),...db.records.map(x=>x.cardID),...db.expenses.map(x=>x.cardID),...db.benefits.map(x=>x.cardID)])];const blocks=months.map(m=>{const list=ids.filter(cid=>db.records.some(x=>x.cardID===cid&&x.month===m)||monthExpenses(cid,m).length||db.usages.some(u=>usageMonth(u)===m&&db.benefits.some(b=>b.cardID===cid&&b.id===u.benefitID))).map(cid=>{const c=db.cards.find(x=>x.id===cid),st=stats(cid,m);return `<div class="panel"><b>${esc(c?.name||'삭제된 카드')}</b><div class="item row"><span>총 결제액</span><b>${won(st.total)}</b></div><div class="item row"><span>실적 인정</span><b class="highlight">${won(st.eligible)}</b></div><div class="item row"><span>사용 혜택</span><b>${won(st.used)}</b></div></div>`}).join('');return `<div class="groupheader">${monthLabel(m)}</div>${list}`}).join('');openSheet('월별 기록',blocks||'<div class="empty">아직 저장된 기록이 없어요.</div>')}
const APPLE_EPOCH_MS=978307200000;
const toSwiftDate=d=>(new Date(String(d).length===7?d+'-01':d+'T12:00:00').getTime()-APPLE_EPOCH_MS)/1000;
const localDateString=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const fromSwiftDate=v=>{if(typeof v==='number')return localDateString(new Date(APPLE_EPOCH_MS+v*1000));if(typeof v==='string'){const date=new Date(v);if(!Number.isNaN(date.getTime()))return localDateString(date)}throw new Error('날짜 형식을 읽을 수 없어요')};
function exportBackup(){const out={version:1,createdAt:(Date.now()-APPLE_EPOCH_MS)/1000,cards:db.cards,records:db.records,expenses:db.expenses.map(x=>({...x,date:toSwiftDate(x.date)})),benefits:db.benefits,usages:db.usages.map(x=>({...x,date:toSwiftDate(x.date)}))};const blob=new Blob([JSON.stringify(out,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='CardManager_Backup_'+new Date().toISOString().slice(0,10)+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)}
function validateBackup(x){if(!x||x.version!==1||!['cards','records','expenses','benefits','usages'].every(k=>Array.isArray(x[k])))throw new Error('지원되지 않는 백업 파일이야. 기존 카드관리 앱의 JSON 파일인지 확인해 줘.');for(const c of x.cards){if(typeof c.id!=='string'||typeof c.name!=='string'||!Number.isFinite(c.target)||!Number.isFinite(c.benefitLimit))throw Error('카드 정보 형식이 잘못됐어')}for(const e of x.expenses){if(typeof e.id!=='string'||typeof e.cardID!=='string'||typeof e.merchant!=='string'||!Number.isFinite(e.amount))throw Error('결제 기록 형식이 잘못됐어')}for(const r of x.records){if(typeof r.cardID!=='string'||typeof r.month!=='string'||!Number.isFinite(r.spending)||!Number.isFinite(r.benefitUsed))throw Error('월별 기록 형식이 잘못됐어')}for(const b of x.benefits){if(typeof b.id!=='string'||typeof b.cardID!=='string'||typeof b.title!=='string'||!Number.isFinite(b.monthlyLimit))throw Error('혜택 정보 형식이 잘못됐어')}for(const u of x.usages){if(typeof u.id!=='string'||typeof u.benefitID!=='string'||!Number.isFinite(u.amount))throw Error('혜택 사용 기록 형식이 잘못됐어')}}
function importBackup(file){if(!file)return;const reader=new FileReader();reader.onload=()=>{try{const x=JSON.parse(reader.result);validateBackup(x);const next={cards:x.cards,records:x.records,expenses:x.expenses.map(e=>({...e,date:fromSwiftDate(e.date)})),benefits:x.benefits,usages:x.usages.map(u=>({...u,date:fromSwiftDate(u.date)}))};if(confirm(`백업 파일에 카드 ${next.cards.length}개, 결제 내역 ${next.expenses.length}건이 있어요.\n\n현재 웹앱의 모든 기록을 백업 파일의 내용으로 교체할까요?`)){db=next;save();closeSheet();alert('복원했어. 현재 카드와 기록을 확인해 줘.')}}catch(e){alert('백업 복원에 실패했어.\n'+e.message)}};reader.onerror=()=>alert('파일을 읽지 못했어.');reader.readAsText(file)}
function backup(){openSheet('백업 및 복원',`<div class="panel"><h3>iCloud Drive 파일 백업</h3><p class="note">카드, 월별 기록, 결제 내역, 혜택과 사용 기록을 하나의 JSON 파일로 저장해요. 앱 파일은 GitHub에 있지만 개인 기록은 이 기기에만 저장돼요.</p><div class="actions"><button class="primary" id="export">⬆ 백업 파일 만들기</button></div><p class="note">iPhone Safari에서 다운로드한 파일은 파일 앱의 '다운로드'에서 찾을 수 있어요. 필요하면 파일 앱에서 iCloud Drive로 이동해 줘.</p></div><div class="panel"><h3>백업에서 복원</h3><label class="formlabel">기존 Swift 앱 또는 웹앱에서 만든 JSON 백업 선택</label><input type="file" id="import" accept=".json,application/json"><p class="warn note">복원 시 웹앱의 현재 데이터가 모두 교체돼요. 현재 데이터도 먼저 백업해 줘.</p></div><div class="panel"><h3>주의사항</h3><p class="note">이 웹앱의 데이터는 아이폰의 웹 저장 공간에 보관돼요. Safari 데이터 삭제나 앱 제거 시 사라질 수 있으므로 정기적으로 JSON 백업을 만들어 iCloud Drive에 보관해 줘. 같은 주소여도 부부의 아이폰은 각자의 데이터를 사용해요.</p></div>`);$('#export').onclick=exportBackup;$('#import').onchange=e=>importBackup(e.target.files[0])}
$('#add-card').onclick=cardAdd;
$('#manage-cards').onclick=()=>cardManage();
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

render();if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{}));
