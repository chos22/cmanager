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
  }
  q('[data-photo-open]').addEventListener('click',()=>file.click());
  q('[data-photo-cancel]').addEventListener('click',()=>{
   clearPhoto();setStatus('사진 선택을 취소했습니다. 기존 저장 기록은 바뀌지 않았어요.');
  });
  file.addEventListener('change',async()=>{
   const selected=file.files[0];
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
    let recognizedText=data.text;
    // Small text inside a white pill can disappear in full-screen recognition.
    // Locate those regions by color, enlarge them and read them separately.
    if(window.PerformancePhotoImage){
     const probe=document.createElement('canvas'),ratio=Math.min(1,640/canvas.width);
     probe.width=Math.round(canvas.width*ratio);probe.height=Math.round(canvas.height*ratio);
     const probeCtx=probe.getContext('2d');probeCtx.drawImage(canvas,0,0,probe.width,probe.height);
     const bubbles=window.PerformancePhotoImage.findAmountBubbles(probeCtx.getImageData(0,0,probe.width,probe.height));
     for(const box of bubbles){
      if(!isCurrent())return;
      const crop=document.createElement('canvas');
      const x=Math.max(0,(box.x-3)/ratio),y=Math.max(0,(box.y-3)/ratio);
      const w=Math.min(canvas.width-x,(box.width+6)/ratio),h=Math.min(canvas.height-y,(box.height+6)/ratio);
      const zoom=Math.min(4,700/w);crop.width=Math.round(w*zoom);crop.height=Math.round(h*zoom);
      const cropCtx=crop.getContext('2d');cropCtx.fillStyle='#fff';cropCtx.fillRect(0,0,crop.width,crop.height);
      cropCtx.drawImage(canvas,x,y,w,h,0,0,crop.width,crop.height);
      const pixels=cropCtx.getImageData(0,0,crop.width,crop.height);
      for(let i=0;i<pixels.data.length;i+=4){const gray=(pixels.data[i]+pixels.data[i+1]+pixels.data[i+2])/3;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=gray>180?255:0}
      cropCtx.putImageData(pixels,0,0);
      await ownWorker.setParameters({tessedit_pageseg_mode:'7'});
      const extra=await ownWorker.recognize(crop);
      if(!isCurrent())return;
      recognizedText+='\n확대 영역\n'+extra.data.text;
     }
    }
    const parsed=window.PerformancePhotoParser.parse(recognizedText);
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
    if(job===generation)file.value='';
   }
  });
 }
 function markup(){return `<div class="photo-import" data-photo-root>
  <button class="secondary" data-photo-open type="button">사진에서 실적 가져오기</button>
  <input data-photo-file type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif" hidden>
  <p class="note" data-photo-status role="status" aria-live="polite">사진은 기기 안에서 읽으며 서버에 저장하지 않아요. 처음에는 인터넷이 필요해요.</p>
  <div data-photo-content hidden>
   <div class="actions"><button data-photo-cancel type="button" class="secondary">사진 선택 취소</button></div>
   <img data-photo-preview class="photo-preview" alt="선택한 카드사 실적 화면" hidden>
   <div data-photo-result hidden><p class="note" data-photo-period></p><div data-photo-review>
    <p>반영할 카드: <b data-photo-card></b><br>반영할 기준 월: <b data-photo-month></b></p>
    <p class="note">카드·기준 월을 확인하세요. 금액을 누르면 바로 저장됩니다. 남은 금액이나 한도는 선택하지 마세요.</p>
    <div class="photo-candidates" data-photo-candidates aria-label="사진에서 읽은 금액 후보"></div>
   </div></div>
  </div></div>`}
 window.PerformancePhoto={mount,markup};
})();
