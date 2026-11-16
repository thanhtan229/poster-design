const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
// Live runs cost provider credits. Report generation only reads frozen local artifacts.
const arg = key => {const i=process.argv.indexOf(key);return i<0?undefined:process.argv[i+1]};
function metrics(rows) {
  const ok=rows.filter(r=>r.success), automatic=ok.filter(r=>r.canAutoApply===true);
  const count=key=>ok.filter(r=>r[key]).length;
  return {cases:rows.length,successful:ok.length,failed:rows.length-ok.length,top1:count('top1'),top3:count('top3'),shortlisted:count('shortlist'),rendered:count('rendered'),metadataTop1:count('metadataTop1'),localTop1:count('localTop1'),localTop3:count('localTop3'),autoApplied:automatic.length,autoCorrect:automatic.filter(r=>r.top1).length,needsReview:count('needsReview'),medianElapsedMs:ok.length?ok.map(r=>r.elapsedMs).sort((a,b)=>a-b)[Math.floor(ok.length/2)]:null};
}
async function main() {
  const reportOnly=process.argv.includes('--report-only');
  if(!reportOnly&&!process.argv.includes('--live'))throw Error('Use --live to authorize paid calls, or --report-only.');
  if(!arg('--manifest'))throw Error('Provide --manifest <json>');
  const cases=JSON.parse(fs.readFileSync(arg('--manifest'),'utf8'));
  const out=path.resolve(process.env.TINIX_QUALITY_OUT||'.runtime/font-quality'),base=process.env.TINIX_APP_URL||'http://127.0.0.1:7001';
  fs.mkdirSync(out,{recursive:true});const file=path.join(out,'results.json');
  let rows=(reportOnly||process.argv.includes('--resume'))&&fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[];
  const fingerprint=item=>crypto.createHash('sha256').update(fs.readFileSync(item.image)).digest('hex');
  const same=(a,b)=>a.fontId===b.fontId&&a.text===b.text&&JSON.stringify(a.bbox)===JSON.stringify(b.bbox)&&(!a.imageHash||a.imageHash===fingerprint(b));
  for(const item of cases) {
    if(reportOnly)break;
    const previous=rows.find(r=>r.name===item.name);
    if(previous){if(!same(previous,item))throw Error('Manifest/image changed: '+item.name);if(previous.success)continue;rows=rows.filter(r=>r!==previous)}
    const started=Date.now();
    try {
      const reference='data:image/'+(/jpe?g$/i.test(item.image)?'jpeg':'png')+';base64,'+fs.readFileSync(item.image).toString('base64');
      const response=await fetch(base+'/api/tinix/ai/match-font',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reference,text:item.text,referenceText:item.text,bbox:item.bbox}),signal:AbortSignal.timeout(300000)}).then(r=>r.json());
      if(response.code!==200)throw Error(response.msg||response.message||'Match failed');
      const m=response.result,ids=[...new Set(m.candidates.map(c=>c.fontClass.id))];
      const row={...item,imageHash:fingerprint(item),elapsedMs:Date.now()-started,success:true,metadataTop1:m.shortlistIds?.[0]===item.fontId,top1:ids[0]===item.fontId,top3:ids.slice(0,3).includes(item.fontId),shortlist:m.shortlistIds?.includes(item.fontId),rendered:m.renderedIds?.includes(item.fontId),confidence:m.confidence,predicted:m.candidates.map(c=>({id:c.fontClass.id,family:c.fontClass.value,weight:c.weight,italic:c.italic,letterSpacing:c.letterSpacing})),jobIds:m.jobIds,reason:m.reason};
      rows.push(row);fs.writeFileSync(path.join(out,item.name+'-match.json'),JSON.stringify(m));
      console.log(item.name,item.fontFamily,'->',row.predicted.map(p=>p.family).join(', '),'top1',row.top1,'top3',row.top3);
    }catch(e){rows.push({...item,imageHash:fingerprint(item),success:false,error:e.message,elapsedMs:Date.now()-started});console.log('FAIL',item.name,e.message)}
    fs.writeFileSync(file,JSON.stringify(rows,null,2));
  }
  for(const row of rows){const fixture=cases.find(c=>c.name===row.name);if(!fixture||!same(row,fixture))throw Error('Stored result differs from manifest: '+row.name);if(!row.success)continue;
    const m=JSON.parse(fs.readFileSync(path.join(out,row.name+'-match.json'),'utf8'));
    Object.assign(row,{algorithm:m.algorithm||'metadata-v1',scanCount:m.scanCount,localTop1:m.localTopIds?.[0]===row.fontId,localTop3:m.localTopIds?.slice(0,3).includes(row.fontId),canAutoApply:m.canAutoApply,needsReview:m.needsReview,disagreement:m.disagreement});
  }
  fs.writeFileSync(file,JSON.stringify(rows,null,2));
  const summary={...metrics(rows),expectedCases:cases.length,bySplit:Object.fromEntries([...new Set(cases.map(c=>c.split||'regression'))].map(split=>[split,metrics(rows.filter(r=>(r.split||'regression')===split))])),byCondition:Object.fromEntries([...new Set(cases.map(c=>c.condition||'clean'))].map(condition=>[condition,metrics(rows.filter(r=>(r.condition||'clean')===condition))])),note:'Exact family IDs on synthetic references with frozen development/holdout split. Not real-photo ground truth or calibrated confidence.'};
  const md=['# Đánh giá chọn font theo ảnh chữ','',`Hoàn tất ${summary.cases}/${summary.expectedCases} ca; thành công ${summary.successful}, lỗi ${summary.failed}.`,`Top 1: ${summary.top1}/${summary.cases}; Top 3: ${summary.top3}/${summary.cases}; font gốc trong bảng so sánh: ${summary.rendered}/${summary.cases}.`,`Cho tự áp dụng: ${summary.autoApplied}; đúng trong số đó: ${summary.autoCorrect}. Cần duyệt: ${summary.needsReview}. Bản cũ chưa có cờ duyệt nên không so sánh trực tiếp tỷ lệ này.`,`Trung vị ${Math.round(summary.medianElapsedMs/1000)} giây/ca. Thời gian gồm render font và lượt AI thực tế.`,'','Ảnh tổng hợp có font gốc xác định; nền/giãn chữ/nén mô phỏng tình huống khó, chưa đại diện mọi ảnh thực tế. Độ tin cậy AI và điểm kết hợp không phải xác suất đúng font. Sai ID dù gần giống vẫn tính sai. Bộ holdout được cố định trước triển khai; không chỉnh tham số dựa trên kết quả holdout.','','|Nhóm|Ca|Top 1|Top 3|Trong bảng|','|---|---:|---:|---:|---:|',...Object.entries(summary.bySplit).map(([name,s])=>`|${name}|${s.cases}|${s.top1}|${s.top3}|${s.rendered}|`),'','|Ca|Font gốc|Lựa chọn đầu|Top 3|Cần duyệt|','|---|---|---|---|---|',...rows.map(r=>`|${r.name}|${r.fontFamily}|${r.predicted?.[0]?.family||r.error}|${r.top3?'Có':'Không'}|${r.needsReview===undefined?'Chưa có cờ':r.needsReview?'Có':'Không'}|`)];
  md.push('','## Theo điều kiện ảnh','','|Điều kiện|Ca|Top 1|Top 3|','|---|---:|---:|---:|',...Object.entries(summary.byCondition).map(([name,s])=>`|${name}|${s.cases}|${s.top1}|${s.top3}|`));
  if(arg('--baseline')){
    const before=JSON.parse(fs.readFileSync(path.join(arg('--baseline'),'results.json'),'utf8'));
    const pairs=rows.filter(r=>before.some(b=>b.name===r.name&&same(b,r)));
    if(!pairs.length)throw Error('Baseline has no identical cases');
    const old=metrics(before.filter(b=>pairs.some(r=>r.name===b.name))),now=metrics(pairs);
    summary.comparison={matchedCases:pairs.length,before:old,after:now};
    md.push('','## So sánh cùng ảnh/vùng chữ','',`Chỉ so sánh ${pairs.length} ca trùng tên, font, nội dung và vùng cắt.`, '', '|Chỉ số|Trước|Sau|','|---|---:|---:|',...['top1','top3','shortlisted','rendered'].map(k=>`|${k}|${old[k]}/${old.cases}|${now[k]}/${now.cases}|`));
  }
  fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,2));fs.writeFileSync(path.join(out,'REPORT.md'),md.join('\n'));
  let review='<meta charset="utf-8"><title>Đánh giá font</title><style>body{font:16px Arial;margin:24px}section{border-bottom:1px solid #aaa;padding:20px}img{max-width:100%;max-height:140px;display:block}.detail{max-height:none;max-width:1000px}</style><h1>So sánh ảnh mẫu và font được chọn</h1>';
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  for(const r of rows.filter(r=>r.success)){const m=JSON.parse(fs.readFileSync(path.join(out,r.name+'-match.json'),'utf8'));review+=`<section><h2>${escape(r.name)}: ${escape(r.fontFamily)}</h2><img src="${m.referenceCrop}">`;for(const c of m.candidates)review+=`<h3>${escape(c.fontClass.value)} · ${c.weight}</h3><img src="${c.preview}">`;if(m.detailPreview)review+=`<details><summary>Chi tiết ký tự</summary><img class="detail" src="${m.detailPreview}"></details>`;review+='</section>'}
  fs.writeFileSync(path.join(out,'review.html'),review);console.log(summary);if(summary.failed||summary.cases!==summary.expectedCases)process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1});
