const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const output=fs.mkdtempSync(path.join(os.tmpdir(),'cmanager-photo-test-'));
const base=process.env.CMANAGER_TEST_URL||'http://127.0.0.1:8010';
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:600,height:1000}});
 const imagePage=await context.newPage();
 const samples=[
  {name:'lotte',text:'쿠팡 롯데카드\n196,684원 채우면\n12월에 혜택 받아요\n합산기간 10.1 ~ 10.31\n103,316원\n0원　　30만원　　50만원　　70만원',expected:103316},
  {name:'woori',text:'LG전자 우리카드\n현재 실적\n136,823원\n내 한도\n잔여 한도\n4,835,477원 / 500만원',expected:136823},
  {name:'mobile-bubble',expected:852877,html:`<div style="width:441px;height:904px;background:#eceef5;position:relative;font-family:'Noto Sans CJK KR',sans-serif"><div style="position:absolute;left:36px;top:338px;width:372px;height:338px;background:#007b83;color:white"><div style="position:absolute;left:22px;top:25px;font-size:13px">이번 10월의 실적을 달성했어요<br>다음 11월 혜택을 듬뿍 누리세요!</div><div style="position:absolute;left:22px;top:90px;font-size:12px">합산기간 2026.10.1 ~ 10.31</div><div style="position:absolute;right:28px;top:128px;background:white;color:#111;border-radius:20px;padding:5px 12px;font:12px Arial,sans-serif">852,877원</div><div style="position:absolute;left:22px;right:22px;top:170px;height:6px;background:white"></div><div style="position:absolute;left:22px;top:185px;font-size:12px">0원　　　40만원　　　80만원<br>1~24개월 이내　18,000원 할인　20,000원 할인<br>25개월 이후　8,000원 할인　10,000원 할인</div></div></div>`},
  {name:'rental',text:'실적 충족 조회\n10월 이용금액\n총 345,700 원\nNEW 렌탈 플러스 카드\n제공혜택별 실적충족내역\n렌탈 요금 청구할인(30만원) 345,700 원\n충족\n온라인 쇼핑 청구할인(30만원) 345,700 원\n충족\n스타벅스 청구할인(30만원) 345,700 원',expected:345700}
 ];
 for(const sample of samples){if(sample.html){await imagePage.setContent('<style>body{margin:0}</style>'+sample.html);await imagePage.locator('body>div').screenshot({path:path.join(output,'photo-'+sample.name+'.png')});continue}await imagePage.setContent('<html lang="ko"><style>body{margin:0;background:white}#image{width:560px;padding:24px;box-sizing:border-box;font:26px/2.2 "Noto Sans CJK KR",sans-serif;white-space:pre-line;color:#111}</style><div id="image"></div></html>');await imagePage.locator('#image').evaluate((e,text)=>e.textContent=text,sample.text);await imagePage.locator('#image').screenshot({path:path.join(output,'photo-'+sample.name+'.png')});}
 await imagePage.close();
 const page=await context.newPage();const errors=[],external=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith(base))external.push(r.url())});
 await page.clock.setFixedTime(new Date('2026-10-18T03:00:00Z'));
 await page.addInitScript(()=>{if(localStorage.getItem('seeded'))return;localStorage.setItem('seeded','1');const put=(k,v)=>localStorage.setItem('cmanager_family_'+k+'_v1',JSON.stringify(v));put('db',{cards:[{id:'a',name:'사진 테스트 카드',owner:'mine',target:700000,benefitLimit:40000,benefitMode:'balance'},{id:'b',name:'다른 카드',target:300000,benefitLimit:10000,benefitMode:'discount'}],records:[],expenses:[],benefits:[],usages:[]});put('manual',{'a|2026-10':{eligible:111111,benefitRemaining:1234},'b|2026-10':{eligible:222222},'a|2026-08':{eligible:700000}});put('benefit_usage',{'a|2026-10':{amount:13000}})});
 await page.goto(base);
 for(const sample of samples){
  await page.evaluate(()=>cardDetail('a','2026-10'));

  const before=await page.evaluate(()=>JSON.stringify(localRows()));
  await page.evaluate(()=>{if(!window.testParseInstalled){window.testParseInstalled=true;const parse=PerformancePhotoParser.parse;PerformancePhotoParser.parse=text=>{window.testOcrText=text;return parse(text)}}});
  if(sample.name==='mobile-bubble')await page.evaluate(()=>{
   const create=window.Tesseract.createWorker;
   window.Tesseract.createWorker=async(...args)=>{
    const worker=await create(...args),recognize=worker.recognize;let count=0;
    worker.recognize=async(...input)=>{const result=await recognize(...input);if(++count>1)window.testBubbleText=result.data.text;return result};
    return worker;
   };
  });
  await page.locator('[data-photo-file]').setInputFiles(path.join(output,'photo-'+sample.name+'.png'));
  await page.locator('[data-photo-result]').waitFor({state:'visible',timeout:90000});
  const candidate=page.locator('[data-photo-candidates] button').filter({hasText:sample.expected.toLocaleString('ko-KR')+'원'});
  assert.equal(await candidate.count(),1);
  if(sample.name==='mobile-bubble')assert.ok(await page.evaluate(()=>PerformancePhotoParser.parseBubbleAmount(window.testBubbleText||'')===852877),'Enlarged bubble must independently recognize the amount');
  assert.equal(await page.evaluate(()=>JSON.stringify(localRows())),before);
  await candidate.click();
  assert.equal(await page.evaluate(()=>manualRecords['a|2026-10'].eligible),sample.expected);
  assert.equal(await page.evaluate(()=>manualRecords['a|2026-10'].benefitRemaining),1234);
  assert.equal(await page.evaluate(()=>manualRecords['b|2026-10'].eligible),222222);
  assert.equal(await page.evaluate(()=>benefitUsageRecords['a|2026-10'].amount),13000);
 }
 assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 await page.reload();assert.equal(await page.evaluate(()=>manualRecords['a|2026-10'].eligible),345700);
 console.log('PASS real OCR for 4 generated Korean screenshots including small white amount bubble; candidate selection saves immediately; replacement not addition; other records preserved; reload; no external requests or browser errors.');
 await context.close();
 }finally{await browser.close();fs.rmSync(output,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exit(1)});
