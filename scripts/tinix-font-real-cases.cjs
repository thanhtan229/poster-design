// Freeze real user references. Coordinates/text are annotations, not original-font labels.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),sharp=require('../service/node_modules/sharp');
const out=path.resolve(process.env.TINIX_REAL_CASES_OUT||'.runtime/font-real');
const temp=process.env.TEMP||'C:/Users/Admin/AppData/Local/Temp';
const sources=[
 ['be-yourself','codex-clipboard-bf865a46-4fc9-4913-8382-d44e1d09b523.png',[
  ['day','THURSDAY',[.51,.052,.18,.023]],['month','SEPTEMBER',[.82,.052,.16,.023]],['year','2023',[.89,.076,.08,.02]],
  ['be','BE',[.30,.16,.14,.06]],['title','YOURSELF.',[.30,.228,.58,.06]],
  ['quote','"TO BE YOURSELF IN A WORLD\nTHAT IS CONSTANTLY TRYING TO\nMAKE YOU SOMETHING ELSE IS THE\nGREATEST ACCOMPLISHMENT."',[.51,.72,.46,.086]],
  ['author','- RALPH WALDO EMERSON',[.51,.83,.43,.02]],['credit','EDITED BY NAOKI ERUNA_',[.065,.96,.27,.017]]]],
 ['tomorrow','codex-clipboard-ae9c131f-2ea2-4fc1-b2e2-ee454d6e75fb.png',[
  ['title','TOMORROW IS A NEW DAY',[.12,.715,.65,.036]],
  ['line1','And new days',[.615,.752,.26,.025]],['line2','Bring new ways',[.615,.775,.27,.023]],['line3','To be happy.',[.615,.798,.27,.026]]]],
 ['new','codex-clipboard-eb77648e-46d6-4b55-9dc2-c1882675eda2.png',[
  ['title','NEW',[.33,.48,.28,.055]],['photo','Photo: Name Surname',[.265,.715,.21,.011]],['model','Model: Name Surname',[.265,.726,.21,.011]],
  ['makeup','Makeup: Name Surname',[.265,.736,.23,.012]],['style','Style: Name Surname',[.547,.715,.22,.011]],['backstage','Backstage: Name Surname',[.547,.726,.24,.011]],['location','Location: City Country',[.547,.737,.23,.011]]]],
 ['unveiling','codex-clipboard-e8ce9532-aa6b-4da9-9148-75d90583a004.png',[
  ['line1','Unveiling',[.625,.253,.12,.032]],['line2','the',[.625,.287,.06,.03]],['line3','unseen.',[.625,.322,.10,.03]]]],
];
async function main(){
 if(fs.existsSync(path.join(out,'cases.json')))throw Error('Real manifest already frozen; reuse it.');fs.mkdirSync(out,{recursive:true});
 const cases=[];for(const [source,file,regions] of sources){
  const input=path.join(temp,file);if(!fs.existsSync(input))throw Error('Missing reference '+input);
  const bytes=fs.readFileSync(input),image=path.join(out,source+'.png');fs.writeFileSync(image,bytes);
  const meta=await sharp(bytes).metadata(),hash=crypto.createHash('sha256').update(bytes).digest('hex');
  for(const [name,text,b] of regions){const bbox={x:b[0],y:b[1],w:b[2],h:b[3]};const crop=path.join(out,source+'-'+name+'-crop.png');
   await sharp(bytes).extract({left:Math.floor(b[0]*meta.width),top:Math.floor(b[1]*meta.height),width:Math.floor(b[2]*meta.width),height:Math.floor(b[3]*meta.height)}).png().toFile(crop);
   cases.push({name:source+'-'+name,source,image,imageHash:hash,crop,text,bbox,groundTruth:{kind:'unknown',note:'Reference supplied by user; original font not verified.'},condition:source==='new'?'text-over-photo':source==='unveiling'?'light-on-dark':name==='credit'?'small-text':'poster-text'});
  }
 }
 fs.writeFileSync(path.join(out,'cases.json'),JSON.stringify(cases,null,2));
 fs.writeFileSync(path.join(out,'annotations.json'),JSON.stringify({version:1,source:'User supplied poster references',note:'Text/bounds transcribed manually. Unknown original fonts require human similarity review; no exact accuracy claim.',cases:cases.map(c=>({name:c.name,text:c.text,bbox:c.bbox,imageHash:c.imageHash,groundTruth:c.groundTruth}))},null,2));
 let html='<meta charset="utf-8"><title>Vùng chữ ảnh thực tế</title><style>body{font:16px Arial}section{padding:20px;border-bottom:1px solid #ccc}img{max-width:95%;background:#ddd;min-height:30px}</style><h1>22 vùng chữ thực tế — chưa xác minh font gốc</h1>';
 for(const c of cases)html+=`<section><h2>${c.name}</h2><pre>${c.text.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</pre><img src="${path.basename(c.crop)}"></section>`;
 fs.writeFileSync(path.join(out,'crops.html'),html);console.log('Frozen',cases.length,'real poster text regions; no exact-font labels.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
