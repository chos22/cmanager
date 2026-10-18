/* Pure OCR text interpretation. Candidates are never saved without user review. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.PerformancePhotoParser=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const compact=text=>text.replace(/\s/g,'');
 const positive=/(?:현재|인정|누적|합산|당월|이번달)실적|실적(?:금액|누계)|이용금액/;
 const excluded=/잔여한도|이용한도|잔여실적|남은금액|부족금액|채우면|더쓰면|추가이용|목표금액|할인금액|결제예정금액|청구금액/;
 function parse(text){
  const lines=String(text||'').normalize('NFKC').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const candidates=new Map();
  lines.forEach((line,index)=>{
   const clean=compact(line),previous=compact(lines[index-1]||'');
   // Require a currency unit: times, dates, card suffixes and tier markers are not amounts.
   const regex=/(?:\d{1,3}(?:[ ,]\s*\d{3})+|\d+)\s*[원운]/g;
   for(const match of line.matchAll(regex)){
    if(excluded.test(clean)||(!positive.test(clean)&&excluded.test(previous)))continue;
    const amount=Number(match[0].replace(/[,\s원운]/g,''));
    if(!Number.isSafeInteger(amount)||amount<0)continue;
    // Avoid matching the trailing digits of decimal or 만원 amounts.
    if(match.index>0&&/[\d.,만]/.test(line[match.index-1]))continue;
    const explicit=positive.test(clean)||positive.test(previous);
    if(amount===0&&!explicit)continue; // Graph origins are not a zero-performance reading.
    const score=explicit?3:/총/.test(clean)?2:1;
    const old=candidates.get(amount);
    if(!old||score>old.score)candidates.set(amount,{amount,score,context:line});
   }
  });
  const sorted=[...candidates.values()].sort((a,b)=>b.score-a.score);
  const best=sorted.filter(x=>x.score===(sorted[0]?.score));
  // Only period/usage labels establish a month. A reward month is not a spending month.
  const periods=[];
  lines.forEach((line,i)=>{
   const clean=compact(line);
   if(/합산기간|실적기간|이용기간/.test(clean)){
    const period=clean.match(/(?:기간)[:：]?(?:(20\d{2})[.\/-])?(\d{1,2})[.\/-]\d{1,2}/);
    if(period)periods.push({year:period[1]?Number(period[1]):null,month:Number(period[2])});
   }
   if(/이용금액|현재실적|인정실적|누적실적/.test(clean)){
    const withMonth=clean.match(/(?:(20\d{2})년)?(\d{1,2})월/)
     ||compact(lines[i-1]||'').match(/^(?:(20\d{2})년)?(\d{1,2})월$/);
    if(withMonth)periods.push({year:withMonth[1]?Number(withMonth[1]):null,month:Number(withMonth[2])});
   }
  });
  const valid=periods.filter(p=>p.month>=1&&p.month<=12);
  const unique=[...new Map(valid.map(p=>[`${p.year||''}-${p.month}`,p])).values()];
  return{candidates:sorted,amount:best.length===1?best[0].amount:null,period:unique.length===1?unique[0]:null};
 }
 return{parse};
});
