/* Screenshots and OCR text stay in memory. Only the existing confirmed manual form saves. */
(function(){
 'use strict';
 let enginePromise;
 function loadEngine(){
  if(window.Tesseract)return Promise.resolve(window.Tesseract);
  if(!enginePromise)enginePromise=new Promise((resolve,reject)=>{
   const script=document.createElement('script');
   script.src=new URL('./vendor/ocr/tesseract.min.js',document.baseURI).href;
   script.onload=()=>window.Tesseract?resolve(window.Tesseract):reject(Error('engine'));
   script.onerror=()=>{script.remove();reject(Error('engine'))};
   document.head.append(script);
  }).catch(error=>{enginePromise=null;throw error});
  return enginePromise;
 }
 function mount(root,{cardName,month,onApply}){
  const q=selector=>root.querySelector(selector),file=q('[data-photo-file]'),status=q('[data-photo-status]');
  const result=q('[data-photo-result]'),amount=q('[data-photo-amount]'),check=q('[data-photo-confirm]');
  let generation=0,worker=null,url=null,disposed=false;
  const setStatus=text=>{status.textContent=text};
  function stop(){
   if(worker){worker.terminate().catch(()=>{});worker=null}
   if(url){URL.revokeObjectURL(url);url=null}
  }
  function dispose(){disposed=true;generation++;stop();observer.disconnect()}
  const observer=new MutationObserver(()=>{if(!root.isConnected)dispose()});
  observer.observe(document.body,{childList:true,subtree:true});
  q('[data-photo-card]').textContent=cardName;
  q('[data-photo-month]').textContent=month;
  root.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.matches('input'))event.preventDefault()});
  amount.addEventListener('input',()=>{check.checked=false;q('[data-photo-apply]').disabled=true});
  check.addEventListener('change',()=>{q('[data-photo-apply]').disabled=!check.checked});
  q('[data-photo-apply]').addEventListener('click',()=>{
   const raw=amount.value.replace(/,/g,'').trim(),value=Number(raw);
   if(!check.checked)return;
   if(!/^\d+$/.test(raw)||!Number.isSafeInteger(value)){
    setStatus('실적 금액을 0 이상의 정수로 입력해 주세요.');amount.focus();return;
   }
   onApply(value);
   setStatus('입력란에 옮겼습니다. 정기 실적 중복 여부를 확인하고 ‘실적 저장’을 눌러 주세요.');
  });
  file.addEventListener('change',async()=>{
   const selected=file.files[0],job=++generation;
   stop();result.hidden=true;check.checked=false;q('[data-photo-apply]').disabled=true;
   q('[data-photo-preview]').hidden=true;q('[data-photo-preview]').removeAttribute('src');
   if(!selected)return;
   if(!/^image\/(?:png|jpeg|webp|heic|heif)$/.test(selected.type)||selected.size>20*1024*1024){
    setStatus('20MB 이하의 스크린샷(PNG·JPEG·WebP)을 선택해 주세요.');file.value='';return;
   }
   const isCurrent=()=>!disposed&&job===generation&&root.isConnected;
   let ownWorker;
   try{
    url=URL.createObjectURL(selected);
    const image=new Image();image.src=url;await image.decode();
    if(!isCurrent())return;
    if(image.naturalWidth*image.naturalHeight>24000000)throw Error('size');
    const preview=q('[data-photo-preview]');preview.src=url;preview.hidden=false;
    const scale=Math.min(2,1800/image.naturalWidth,3000/image.naturalHeight);
    const canvas=document.createElement('canvas');canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
    setStatus('사진에서 글자를 읽는 중입니다. 처음에는 인식 도구를 불러오느라 시간이 걸릴 수 있어요.');
    const Tesseract=await loadEngine();if(!isCurrent())return;
    const base=new URL('./vendor/ocr/',document.baseURI).href;
    ownWorker=await Tesseract.createWorker('kor+eng',1,{
     workerPath:base+'worker.min.js',corePath:base+'tesseract-core-lstm.wasm.js',langPath:base,
     workerBlobURL:false,cacheMethod:'none',gzip:true,
     logger:event=>{if(isCurrent()&&event.status==='recognizing text')setStatus('사진의 글자를 읽고 있어요… '+Math.round(event.progress*100)+'%')},
     errorHandler:()=>{},
    });
    if(!isCurrent()){await ownWorker.terminate();return}worker=ownWorker;
    await ownWorker.setParameters({tessedit_pageseg_mode:'11'});
    const {data}=await ownWorker.recognize(canvas);
    if(!isCurrent())return;
    const parsed=window.PerformancePhotoParser.parse(data.text);
    amount.value=parsed.amount===null?'':parsed.amount.toLocaleString('ko-KR');
    const candidates=q('[data-photo-candidates]');candidates.replaceChildren();
    for(const candidate of parsed.candidates){
     const button=document.createElement('button');button.type='button';button.className='secondary small';
     button.textContent=candidate.amount.toLocaleString('ko-KR')+'원';
     button.addEventListener('click',()=>{amount.value=String(candidate.amount);check.checked=false;q('[data-photo-apply]').disabled=true});
     candidates.append(button);
    }
    const [year,mm]=month.split('-').map(Number),period=parsed.period;
    const mismatch=period&&(period.month!==mm||(period.year&&period.year!==year));
    q('[data-photo-period]').textContent=mismatch
     ?'사진에서 읽은 기간이 선택한 월과 다릅니다. 사진과 기준 월을 다시 확인해 주세요.'
     :period?'사진에서 읽은 실적 월: '+(period.year?period.year+'년 ':'연도 미표시 · ')+period.month+'월. 연도와 월을 확인해 주세요.'
     :'사진에서 실적 연도·월을 확정하지 못했습니다. 선택한 기준 월과 일치하는지 확인해 주세요.';
    q('[data-photo-review]').hidden=!!mismatch;
    result.hidden=false;
    setStatus(mismatch?'위쪽 기준 월을 변경한 뒤 사진을 다시 선택해 주세요.':parsed.amount===null
     ?'실적 금액을 확정하지 못했습니다. 사진을 보고 후보를 선택하거나 금액을 입력해 주세요.'
     :'금액을 읽었습니다. 남은 금액·한도가 아닌 인정 실적인지 사진과 비교해 주세요.');
   }catch(error){
    if(isCurrent())setStatus('사진을 읽지 못했습니다. 인터넷 연결을 확인하고 실적 부분이 선명한 PNG·JPEG 사진으로 다시 시도하거나 직접 입력해 주세요.');
   }finally{
    if(ownWorker){await ownWorker.terminate().catch(()=>{});if(worker===ownWorker)worker=null}
    file.value='';
   }
  });
 }
 function markup(){return `<details class="photo-import" data-photo-root><summary>사진에서 실적 가져오기</summary>
  <p class="note">사진은 이 기기에서 읽고 서버로 보내거나 저장하지 않아요. 처음에는 인식 도구를 내려받기 위해 인터넷이 필요해요.</p>
  <label class="formlabel">카드사 실적 화면 선택<input data-photo-file type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif"></label>
  <img data-photo-preview class="photo-preview" alt="선택한 카드사 실적 화면" hidden>
  <p class="note" data-photo-status role="status" aria-live="polite">실적 금액과 기준 월이 보이는 스크린샷을 선택해 주세요.</p>
  <div data-photo-result hidden><p class="note" data-photo-period></p><div data-photo-review>
   <p>반영할 카드: <b data-photo-card></b><br>반영할 기준 월: <b data-photo-month></b></p>
   <p class="note">사진의 카드와 다르면 닫고 해당 카드를 선택해 주세요. 금액은 기존 실적에 더하지 않고 최신 누계로 바꿉니다.</p>
   <div class="photo-candidates" data-photo-candidates aria-label="사진에서 읽은 금액 후보"></div>
   <label class="formlabel">확인한 인정 실적 (원)<input data-photo-amount type="text" inputmode="numeric" autocomplete="off" aria-label="사진에서 확인한 인정 실적"></label>
   <label class="checkrow"><input data-photo-confirm type="checkbox"><span>사진의 카드·실적 연도와 월·금액이 위 내용과 일치하는지 확인했어요.</span></label>
   <button data-photo-apply type="button" class="secondary" disabled>확인한 금액을 입력란에 넣기</button>
  </div></div></details>`}
 window.PerformancePhoto={mount,markup};
})();
