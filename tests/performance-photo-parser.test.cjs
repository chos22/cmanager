const test=require('node:test');
const assert=require('node:assert/strict');
const {parse}=require('../performance-photo-parser.js');

test('Lotte: current performance, not remaining amount or reward month',()=>{
 const result=parse('카드매니저\n쿠팡 롯데카드\n196,684원 채우면\n12월에 혜택 받아요\n합산기간 10.1 ~ 10.31\n103,316원\n0원\n30만원\n50만원\n70만원');
 assert.equal(result.amount,103316);
 assert.deepEqual(result.period,{year:null,month:10});
 assert.ok(!result.candidates.some(c=>c.amount===196684));
});
test('Woori: current performance, not remaining credit limit',()=>{
 const result=parse('LG전자 우리카드\n신용 본인 9685\n현재 실적\n136,823원\n0\n30만\n70만\n120만\n30만원까지 잔여실적 채우고 혜택받아요!\n내 한도\n잔여 한도\n4,835,477원 / 500만원\n일시불/할부\n500만원');
 assert.equal(result.amount,136823);
 assert.equal(result.period,null);
 assert.ok(!result.candidates.some(c=>c.amount===4835477));
});
test('rental: repeated benefit-specific performance is deduplicated, never summed',()=>{
 const result=parse('실적 충족 조회\n10월 이용금액\n총 345,700 원\n[본인3533]NEW 렌탈 플러스 카드\n제공혜택별 실적충족내역\n렌탈 요금 청구할인(30만원) 345,700 원\n충족\n온라인 쇼핑 청구할인(30만원) 345,700 원\n충족\n스타벅스 청구할인(30만원) 345,700 원');
 assert.equal(result.amount,345700);
 assert.equal(result.candidates.length,1);
 assert.deepEqual(result.period,{year:null,month:10});
});
test('ambiguity, unreadable amounts and decimal values must not invent a number',()=>{
 assert.equal(parse('103,316원\n136,823원').amount,null);
 assert.equal(parse('현재 실적\n읽기 어려운 사진').amount,null);
 assert.equal(parse('현재 실적\n10.5원').amount,null);
 assert.equal(parse('현재 실적\n30만원').amount,null);
 assert.equal(parse('현재 실적\n0원').amount,0);
});
test('comma spacing and explicit year are supported; conflicting periods remain unconfirmed',()=>{
 const result=parse('합산기간 2026.10.1 ~ 10.31\n현재 실적\n103, 316 원');
 assert.equal(result.amount,103316);
 assert.deepEqual(result.period,{year:2026,month:10});
 assert.equal(parse('10월 이용금액\n100원\n11월 이용금액\n200원').period,null);
});

test('common OCR currency misread is tolerated, malformed number groups are not',()=>{
 assert.equal(parse('연재 실적\n136,823운\n잔여 한도\n4,835,477원').amount,136823);
 assert.equal(parse('현재 실적\n136 823 원').amount,136823);
 assert.equal(parse('현재 실적\n136,82원').amount,null);
});

test('achieved-performance bubble is not confused with discounts or next reward month',()=>{
 const result=parse('이번 10월의 실적을 달성했어요\n다음 11월 혜택을 듬뿍 누리세요!\n합산기간 2026.10.1 ~ 10.31\n852,877원\n0원\n40만원\n80만원\n1~24개월 이내 18,000원 할인 20,000원 할인\n25개월 이후 8,000원 할인 10,000원 할인');
 assert.equal(result.amount,852877);
 assert.deepEqual(result.period,{year:2026,month:10});
 assert.deepEqual(result.candidates.map(c=>c.amount),[852877]);
});

test('a separate enlarged bubble is not attributed to a preceding reward total',()=>{
 const result=parse('이번달 총 혜택 금액\n18,000원\n확대 영역\n852,877원');
 assert.deepEqual(result.candidates.map(c=>c.amount),[852877]);
});
