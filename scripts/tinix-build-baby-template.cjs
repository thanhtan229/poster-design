const fs=require('fs'),path=require('path'),crypto=require('crypto'),DB=require('../service/node_modules/better-sqlite3'),sharp=require('../service/node_modules/sharp')
;(async()=>{
 const root='service/static/collage/baby-luna-v1';fs.mkdirSync(root,{recursive:true})
 const db=new DB('service/data/poster.db'),source=db.prepare('select * from designs where id=41').get(),seed=JSON.parse(source.data)[0]
 const photoSeed=seed.layers.find(w=>w.slot&&!w.cutoutEdit),textSeed=seed.layers.find(w=>w.type==='w-text'),layers=[]
 const uid=()=>crypto.randomUUID(),svg=(w,h,body)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`
 async function asset(name,w,h,body){await sharp(Buffer.from(svg(w,h,body))).png().toFile(`${root}/${name}.png`);return `/static/collage/baby-luna-v1/${name}.png`}
 function image(name,url,x,y,w,h,extra={}){const v={...structuredClone(photoSeed),uuid:uid(),name,imgUrl:url,left:x,top:y,width:w,height:h,rotate:0,degree:0,slot:false,templateRole:'fixed',printRole:'raised',printGroup:undefined,fit:'fill',zoom:1,transform:'scale(1)',...extra};delete v.origin;layers.push(v);return v}
 function text(name,value,x,y,w,size,group,color='#302d26'){layers.push({...structuredClone(textSeed),uuid:uid(),name,text:value,left:x,top:y,width:w,height:size*2.8,fontSize:size,lineHeight:1.2,color,printRole:'raised',printGroup:group,templateRole:'text',fontWeight:'bold'})}
 let pattern='';for(let i=0;i<90;i++){const x=(i*397+33)%2400,y=(i*251+31)%2400;pattern+=`<g transform="translate(${x} ${y})"><ellipse rx="22" ry="32" fill="#e9c764"/><path d="M-12 -29l12 -20 12 20" fill="none" stroke="#6c8d70" stroke-width="5"/></g>`}
 const bg=await asset('background',2400,2400,`<rect width="2400" height="2400" fill="#b4d4ca"/>${pattern}<path fill="#ede2bd" d="M0 0H820V2400H0Z"/><g fill="none" stroke="#b2a078" stroke-width="4" opacity=".6">${Array.from({length:30},(_,i)=>`<path d="M${i*42} 0q-40 100 0 200t0 200t0 200t0 200t0 200t0 200t0 200t0 200t0 200t0 200t0 200t0 200"/>`).join('')}</g>`)
 image('Nền dứa và giấy · cố định',bg,0,0,2400,2400,{printRole:'base',lock:true})
 const paper=await asset('paper',100,100,'<rect width="100" height="100" fill="#fffaf0"/>')
 const photos=fs.readdirSync('service/static/photos').filter(f=>f.endsWith('.jpg')),find=p=>'/static/photos/'+photos.find(f=>f.startsWith(p))
 function frame(name,url,x,y,w,h){const group=uid();image('Khung '+name,paper,x,y,w,h,{printGroup:group});image(name,url,x+20,y+20,w-40,h-40,{fit:'cover',slot:true,templateRole:'photo',printGroup:group,cropX:50,cropY:35})}
 frame('Ảnh chính trên',find('2801f8'),790,100,740,740)
 frame('Ảnh nhỏ trái',find('b0aa0e'),310,620,430,420)
 frame('Ảnh tờ báo',find('2c3291'),1570,210,660,770)
 frame('Ảnh dưới trái',find('199982'),130,1110,780,990)
 frame('Ảnh chính giữa',find('a0e4c'),850,820,760,970)
 frame('Ảnh dưới phải',find('e21324'),1600,1150,620,800)
 const label=await asset('label',900,180,'<path d="M0 5H900V175H0Z" fill="#f5eee0"/>')
 function tag(name,value,x,y,w,h,size,color){const group=uid();image('Nền '+name,label,x,y,w,h,{printGroup:group});text(name,value,x+10,y+10,w-20,size,group,color)}
 tag('Tuổi bé','1 · 10',70,170,680,220,150,'#d26c8b')
 tag('Thông điệp','LIFE IS FULL OF HAPPINESS',70,410,760,130,55,'#c77978')
 tag('Lời nhắn','I think of you and smile',650,790,520,260,62,'#c97b85')
 tag('Nhãn ảnh','JUST SMILE',1190,1740,400,120,50,'#343532')
 tag('Ngày vui','HAPPY DAYS',100,2110,700,120,50,'#ce7b72')
 tag('Tên bé','LUNA',780,1910,1000,220,160,'#d35e85')
 const camera=await asset('camera',450,300,'<rect x="15" y="55" width="420" height="220" rx="35" fill="#e4a9b0" stroke="#fff5e7" stroke-width="16"/><path d="M80 55l35-35h100l28 35" fill="#e4a9b0" stroke="#fff5e7" stroke-width="12"/><circle cx="225" cy="165" r="72" fill="none" stroke="#c67180" stroke-width="15"/><circle cx="225" cy="165" r="45" fill="none" stroke="#c67180" stroke-width="8"/>')
 image('Sticker máy ảnh',camera,1790,1900,440,300)
 const flower=await asset('flower',240,240,'<g fill="#dc6f94"><ellipse cx="120" cy="58" rx="35" ry="58"/><ellipse cx="120" cy="182" rx="35" ry="58"/><ellipse cx="58" cy="120" rx="58" ry="35"/><ellipse cx="182" cy="120" rx="58" ry="35"/></g><circle cx="120" cy="120" r="34" fill="#edcb66"/>')
 image('Hoa hồng',flower,2100,150,200,200)
 const heart=await asset('heart',300,300,'<path d="M150 80C35-45-55 110 150 285C350 110 265-45 150 80Z" fill="#d96d91" stroke="#f9dfd8" stroke-width="18"/>')
 image('Trái tim',heart,420,1890,260,260)
 const global={...seed.global,width:2400,height:2400,dpi:300,backgroundColor:'#b4d4ca',collage:{template:'baby-luna-v1',version:1,customer:'Bản dựng tham khảo',printWorkflow:'separate-sheets'}}
 const layout={global,layers};fs.writeFileSync(`${root}/layout.json`,JSON.stringify(layout,null,2))
 const now=new Date().toISOString(),data=JSON.stringify(layout)
 const templateId=Number(db.prepare('insert into collage_templates(name,category,version,data,updated_at) values(?,?,?,?,?)').run('Bé yêu · Happy Days','Ảnh thật · Scrapbook',1,data,now).lastInsertRowid)
 db.prepare('insert into collage_template_versions values(?,?,?,?)').run(templateId,1,data,now)
 const designId=Number(db.prepare('insert into designs(user_id,template_id,title,data,cover,width,height) values(?,?,?,?,?,?,?)').run(source.user_id,0,'Bé yêu — Bản dựng tham khảo',JSON.stringify([layout]),'',2400,2400).lastInsertRowid)
 db.close();console.log(JSON.stringify({templateId,designId,layers:layers.length,photos:layers.filter(w=>w.slot).length}))
})().catch(e=>{console.error(e);process.exitCode=1})
