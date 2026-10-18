/* Screenshots and OCR text stay in memory. Selecting a recognized amount submits the existing manual form. */
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
  const result=q('[data-photo-result]'),content=q('[data-photo-content]');
  let generation=0,worker=null,url=null,disposed=false;
  let loadedImage=null,selecting=false,dragStart=null,photoPeriod=null;
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
  function clearPhoto(){
   generation++;stop();
   content.hidden=true;result.hidden=true;file.value='';
   q('[data-photo-preview]').hidden=true;q('[data-photo-preview]').removeAttribute('src');
   q('[data-photo-candidates]').replaceChildren();
   loadedImage=null;selecting=false;dragStart=null;photoPeriod=null;
   q('[data-photo-selection]').hidden=true;q('[data-photo-region]').disabled=true;
   q('[data-photo-debug-text]').textContent='';q('[data-photo-preview]').style.touchAction='';q('[data-photo-preview]').style.maxHeight='';
  }
  q('[data-photo-open]').addEventListener('click',()=>file.click());
  q('[data-photo-cancel]').addEventListener('click',()=>{
   clearPhoto();setStatus('사진 선택을 취소했습니다. 기존 저장 기록은 바뀌지 않았어요.');
  });
  async function readPhoto(selected,regionOnly=false,inheritedPeriod=null){
   if(!selected)return;
   clearPhoto();const job=generation;content.hidden=false;
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
    const preview=q('[data-photo-preview]');preview.src=url;preview.hidden=false;loadedImage=image;
    const scale=Math.min(regionOnly?6:2,1800/image.naturalWidth,(regionOnly?900:3000)/image.naturalHeight);
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
    await ownWorker.setParameters({tessedit_pageseg_mode:regionOnly?'7':'11'});
    const {data}=await ownWorker.recognize(canvas);
    if(!isCurrent())return;
    const recognizedText=data.text,bubbleAmounts=new Set(),debug=['전체 인식 내용:',data.text];let bubbleDetected=false;
    // Small text inside a white pill can disappear in full-screen recognition.
    // Locate those regions by color, enlarge them and read them separately.
    if(!regionOnly&&window.PerformancePhotoImage){
     const probe=document.createElement('canvas'),ratio=Math.min(1,900/canvas.width);
     probe.width=Math.round(canvas.width*ratio);probe.height=Math.round(canvas.height*ratio);
     const probeCtx=probe.getContext('2d');probeCtx.drawImage(canvas,0,0,probe.width,probe.height);
     const bubbles=window.PerformancePhotoImage.findAmountBubbles(probeCtx.getImageData(0,0,probe.width,probe.height));
     bubbleDetected=bubbles.length>0;debug.push('찾은 말풍선 수: '+bubbles.length);
     for(const box of bubbles){
      if(!isCurrent())return;
      const crop=document.createElement('canvas');
      const x=Math.max(0,(box.x-3)/ratio),y=Math.max(0,(box.y-3)/ratio);
      const w=Math.min(canvas.width-x,(box.width+6)/ratio),h=Math.min(canvas.height-y,(box.height+6)/ratio);
      const zoom=Math.min(5,900/w);crop.width=Math.round(w*zoom);crop.height=Math.round(h*zoom);
      const cropCtx=crop.getContext('2d');cropCtx.fillStyle='#fff';cropCtx.fillRect(0,0,crop.width,crop.height);
      cropCtx.drawImage(canvas,x,y,w,h,0,0,crop.width,crop.height);
      // Preserve antialiased digit strokes. A hard black/white threshold can erase
      // fine strokes in the small fonts used by card apps.
      await ownWorker.setParameters({tessedit_pageseg_mode:'7'});
      const extra=await ownWorker.recognize(crop);
      if(!isCurrent())return;
      debug.push('말풍선 인식 내용:',extra.data.text);
      const value=window.PerformancePhotoParser.parseBubbleAmount(extra.data.text);
      if(value!==null)bubbleAmounts.add(value);
     }
    }
    const parsed=window.PerformancePhotoParser.parse(recognizedText);
    // An amount-only crop is also supported when the currency unit is clipped.
    if(regionOnly||canvas.width/canvas.height>=1.8){
     const value=window.PerformancePhotoParser.parseBubbleAmount(recognizedText);
     if(value!==null)bubbleAmounts.add(value);
    }
    if(bubbleAmounts.size){
     parsed.candidates=[...bubbleAmounts].map(amount=>({amount,context:'확대해서 읽은 실적 금액'}));
     parsed.amount=parsed.candidates.length===1?parsed.candidates[0].amount:null;
    }else if(bubbleDetected){
     // If the amount bubble was unreadable, do not substitute unrelated discounts.
     parsed.candidates=parsed.candidates.filter(candidate=>candidate.score>=3);
     parsed.amount=parsed.candidates.length===1?parsed.candidates[0].amount:null;
    }
    parsed.period=parsed.period||inheritedPeriod;photoPeriod=parsed.period;
    q('[data-photo-debug-text]').textContent=debug.join('\n');
    const candidates=q('[data-photo-candidates]');candidates.replaceChildren();
    for(const candidate of parsed.candidates){
     const button=document.createElement('button');button.type='button';button.className='secondary small';
     button.textContent=candidate.amount.toLocaleString('ko-KR')+'원';
     button.addEventListener('click',()=>onApply(candidate.amount));
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
     ?'인정 실적 금액을 누르면 바로 저장됩니다. 맞는 후보가 없으면 아래 실적 입력란에 직접 입력하고 저장해 주세요.'
     :'인정 실적 금액을 누르면 바로 저장되고 부부 공유에 반영됩니다.');
   }catch(error){
    if(isCurrent())setStatus('사진을 읽지 못했습니다. 인터넷 연결을 확인하고 실적 부분이 선명한 PNG·JPEG 사진으로 다시 시도하거나 직접 입력해 주세요.');
   }finally{
    if(ownWorker){await ownWorker.terminate().catch(()=>{});if(worker===ownWorker)worker=null}
    if(job===generation){file.value='';q('[data-photo-region]').disabled=!loadedImage}
   }
  }
  file.addEventListener('change',()=>readPhoto(file.files[0]));
  const preview=q('[data-photo-preview]'),selection=q('[data-photo-selection]');
  preview.draggable=false;
  q('[data-photo-region]').addEventListener('click',()=>{
   if(!loadedImage)return;
   selecting=!selecting;selection.hidden=true;dragStart=null;
   preview.style.touchAction=selecting?'none':'';preview.style.maxHeight=selecting?'700px':'';
   if(selecting)preview.scrollIntoView({block:'start',behavior:'auto'});
   setStatus(selecting?'사진 속 실적 숫자 부분만 손가락으로 드래그해 네모로 지정해 주세요.':'영역 지정을 취소했습니다.');
  });
  const point=event=>{
   const box=preview.getBoundingClientRect();
   return{x:Math.max(0,Math.min(1,(event.clientX-box.left)/box.width)),y:Math.max(0,Math.min(1,(event.clientY-box.top)/box.height))};
  };
  const rectangle=end=>({x:Math.min(dragStart.x,end.x),y:Math.min(dragStart.y,end.y),w:Math.abs(dragStart.x-end.x),h:Math.abs(dragStart.y-end.y)});
  function paint(rect){
   selection.hidden=false;selection.style.left=rect.x*100+'%';selection.style.top=rect.y*100+'%';
   selection.style.width=rect.w*100+'%';selection.style.height=rect.h*100+'%';
  }
  preview.addEventListener('pointerdown',event=>{
   if(!selecting)return;event.preventDefault();dragStart=point(event);preview.setPointerCapture(event.pointerId);paint(rectangle(dragStart));
  });
  preview.addEventListener('pointermove',event=>{if(selecting&&dragStart){event.preventDefault();paint(rectangle(point(event)))}});
  preview.addEventListener('pointercancel',()=>{dragStart=null;selection.hidden=true});
  preview.addEventListener('pointerup',async event=>{
   if(!selecting||!dragStart||!loadedImage)return;
   const rect=rectangle(point(event)),image=loadedImage,period=photoPeriod;
   dragStart=null;selection.hidden=true;
   if(rect.w*image.naturalWidth<20||rect.h*image.naturalHeight<8){setStatus('영역이 너무 작아요. 숫자 전체를 포함해서 다시 지정해 주세요.');return}
   selecting=false;preview.style.touchAction='';
   const crop=document.createElement('canvas');crop.width=Math.round(rect.w*image.naturalWidth);crop.height=Math.round(rect.h*image.naturalHeight);
   crop.getContext('2d').drawImage(image,rect.x*image.naturalWidth,rect.y*image.naturalHeight,rect.w*image.naturalWidth,rect.h*image.naturalHeight,0,0,crop.width,crop.height);
   const job=generation;
   const blob=await new Promise(resolve=>crop.toBlob(resolve,'image/png'));
   if(blob&&!disposed&&job===generation&&root.isConnected)readPhoto(blob,true,period);
  });

 }
 function markup(){return `<div class="photo-import" data-photo-root>
  <button class="secondary" data-photo-open type="button">사진에서 실적 가져오기</button>
  <input data-photo-file type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif" hidden>
  <p class="note" data-photo-status role="status" aria-live="polite">사진은 기기 안에서 읽으며 서버에 저장하지 않아요. 처음에는 인터넷이 필요해요. · 영역 선택·인식 확인</p>
  <div data-photo-content hidden>
   <div class="actions"><button data-photo-cancel type="button" class="secondary">사진 선택 취소</button></div>
   <div class="photo-preview-wrap"><img data-photo-preview class="photo-preview" alt="선택한 카드사 실적 화면" hidden><div data-photo-selection class="photo-selection" hidden></div></div>
   <button data-photo-region type="button" class="secondary" disabled>실적 숫자 부분만 다시 읽기</button>
   <details class="photo-debug"><summary>인식한 글자 확인</summary><p class="note">이 내용은 기기에만 표시되며 서버로 전송되지 않아요. 공유할 때는 개인정보를 가려 주세요.</p><pre data-photo-debug-text></pre></details>
   <div data-photo-result hidden><p class="note" data-photo-period></p><div data-photo-review>
    <p>반영할 카드: <b data-photo-card></b><br>반영할 기준 월: <b data-photo-month></b></p>
    <p class="note">카드·기준 월을 확인하세요. 금액을 누르면 바로 저장됩니다. 남은 금액이나 한도는 선택하지 마세요.</p>
    <div class="photo-candidates" data-photo-candidates aria-label="사진에서 읽은 금액 후보"></div>
   </div></div>
  </div></div>`}
 window.PerformancePhoto={mount,markup};
})();
