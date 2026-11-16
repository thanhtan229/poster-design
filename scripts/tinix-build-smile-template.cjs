const fs=require('fs'),path=require('path'),crypto=require('crypto'),DB=require('../service/node_modules/better-sqlite3'),sharp=require('../service/node_modules/sharp')
;(async()=>{
 const root='service/static/collage/smile-darling-v1';fs.mkdirSync(root,{recursive:true})
 const db=new DB('service/data/poster.db'),source=db.prepare('select * from designs where id=41').get(),seed=JSON.parse(source.data)[0]
 const photoSeed=seed.layers.find(w=>w.slot&&!w.cutoutEdit),textSeed=seed.layers.find(w=>w.type==='w-text'),layers=[]
 const uid=()=>crypto.randomUUID(),svg=(w,h,body)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`
 async function asset(name,w,h,body){await sharp(Buffer.from(svg(w,h,body))).png().toFile(`${root}/${name}.png`);return `/static/collage/smile-darling-v1/${name}.png`}
 function image(name,url,x,y,w,h,extra={}){const v={...structuredClone(photoSeed),uuid:uid(),name,imgUrl:url,left:x,top:y,width:w,height:h,rotate:0,degree:0,slot:false,templateRole:'fixed',printRole:'raised',printGroup:undefined,fit:'fill',zoom:1,transform:'scale(1)',...extra};delete v.origin;layers.push(v);return v}
 function text(name,value,x,y,w,size,group,color='#302d26'){layers.push({...structuredClone(textSeed),uuid:uid(),name,text:value,left:x,top:y,width:w,height:size*2.8,fontSize:size,lineHeight:1.2,color,printRole:'raised',printGroup:group,templateRole:'text',fontWeight:'bold'})}
 let hearts='';for(let i=0;i<100;i++){const x=(i*397+23)%2400,y=(i*251+31)%2400,s=12+(i%4)*5;hearts+=`<path d="M0 5 C-20 -12 -28 10 0 27 C28 10 20 -12 0 5Z" fill="#eee9d7" transform="translate(${x} ${y}) scale(${s/20}) rotate(${i%3*18-18})"/>`}
 const bg=await asset('hearts-background',2400,2400,`<rect width="2400" height="2400" fill="#34352d"/>${hearts}`)
 image('Nền tim · cố định',bg,0,0,2400,2400,{printRole:'base',lock:true})
 const white=await asset('paper',100,100,'<rect width="100" height="100" fill="#fffdf1"/>')
 const photos=fs.readdirSync('service/static/photos').filter(f=>f.endsWith('.jpg'))
 const find=prefix=>'/static/photos/'+photos.find(f=>f.startsWith(prefix))
 function frame(name,url,x,y,w,h,cropY=50){const group=uid();image('Giấy '+name,white,x,y,w,h,{printGroup:group});image(name,url,x+20,y+20,w-40,h-40,{fit:'cover',slot:true,templateRole:'photo',printGroup:group,cropX:50,cropY});return group}
 frame('Ảnh lớn trái',find('1274248'),80,105,1080,805,34)
 frame('Ảnh lớn phải',find('78a399'),1250,245,1060,785,28)
 const strip=uid();image('Giấy dải ba ảnh',white,160,1200,805,1070,{printGroup:strip})
 ;['199982','a0e4c','ec2b06'].forEach((p,i)=>image(`Ảnh dải ${i+1}`,find(p),180,1220+i*345,765,325,{fit:'cover',slot:true,templateRole:'photo',printGroup:strip,cropX:50,cropY:i===2?45:28}))
 frame('Ảnh dọc phải',find('78a399'),1480,1300,810,1000,45)
 // The central scalloped photo is a replaceable photo, not a subject extraction slot.
 const scallop=svg(800,800,Array.from({length:10},(_,i)=>{const a=i*Math.PI/5;return `<circle cx="${400+240*Math.cos(a)}" cy="${400+240*Math.sin(a)}" r="160" fill="white"/>`}).join('')+'<circle cx="400" cy="400" r="320" fill="white"/>')
 image('Ảnh hoa ở giữa',find('199982'),820,750,800,800,{fit:'cover',slot:true,templateRole:'photo',mask:'data:image/svg+xml,'+encodeURIComponent(scallop),cropY:35})
 const ribbon=await asset('ribbon',1000,170,'<path d="M10 10H990L910 85 990 160H10L90 85Z" fill="#fffdf1"/>')
 function label(name,value,x,y,w,h,size,bg=ribbon){const group=uid();image('Giấy '+name,bg,x,y,w,h,{printGroup:group});text(name,value,x+35,y+20,w-70,size,group)}
 label('Smile darling','SMILE, DARLING',210,735,760,145,55)
 label('Lời yêu thương','how sweet it is to be loved by you',1270,100,1030,140,38)
 const yellow=await asset('yellow-label',800,180,'<path d="M35 30Q0 90 35 150L730 165Q800 90 745 15Z" fill="#e8d48b" stroke="#fffdf1" stroke-width="16"/>')
 label('Say cheese','SAY CHEESE',90,1010,740,175,62,yellow)
 label('Lời nhắn','We were just kids\nwhen we fell in love',1570,1140,720,180,38)
 const arrow=await asset('heart-arrow',800,240,'<g fill="none" stroke="#fffdf1" stroke-width="35" stroke-linecap="round" stroke-linejoin="round"><path d="M70 80L730 190M70 80L145 35M70 80L120 150M650 100L630 170 580 220M720 110L690 180 640 230"/><path d="M380 105C290-30 255 85 390 205C560 95 480 0 380 105Z"/></g><g fill="none" stroke="#34352d" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"><path d="M70 80L730 190M70 80L145 35M70 80L120 150M650 100L630 170 580 220M720 110L690 180 640 230"/><path d="M380 105C290-30 255 85 390 205C560 95 480 0 380 105Z"/></g>')
 image('Mũi tên trái tim',arrow,1580,920,730,225)
 let keys='';for(let r=0;r<4;r++)for(let c=0;c<10;c++)keys+=`<rect x="${75+c*29}" y="${245+r*27}" width="21" height="18" rx="5" fill="#fff8dd"/>`
 const typewriter=await asset('typewriter',450,440,`<path d="M85 35H355V200H400L425 400Q220 445 25 400L50 200H85Z" fill="#b7c9bc" stroke="#fffdf1" stroke-width="18"/><path d="M95 30H345V180H95Z" fill="#fff8dd"/><path d="M150 170H300L340 200H110Z" fill="#424a49"/><rect x="55" y="230" width="340" height="145" rx="15" fill="#596367"/>${keys}`)
 const tg=uid();image('Máy chữ',typewriter,1000,1560,440,440,{printGroup:tg});text('Hello','hello',1090,1610,250,34,tg)
 const plane=await asset('plane',480,480,'<path d="M220 210L25 145 55 100 280 125 360 25Q420-10 425 50L350 220 445 340 415 390 290 300 235 430 180 440 205 290 70 330 40 300Z" fill="#c7805d" stroke="#fffdf1" stroke-width="20" stroke-linejoin="round"/>')
 image('Máy bay',plane,1070,1940,400,400)
 const pink=await asset('pink-label',700,160,'<rect x="5" y="5" width="690" height="150" fill="#e6bcb9"/>')
 label('Nhãn Smile','♥  SMILE',165,2190,530,145,55,pink)
 const heart=await asset('pink-heart',300,330,'<path d="M150 80C35-60-55 110 150 310C370 130 250-60 150 80Z" fill="#dca6a4" stroke="#fffdf1" stroke-width="14"/>')
 image('Tim hồng',heart,2110,2090,245,270)
 const global={...seed.global,width:2400,height:2400,dpi:300,backgroundColor:'#34352d',collage:{template:'smile-darling-v1',version:1,customer:'Bản dựng tham khảo',printWorkflow:'separate-sheets'}}
 const layout={global,layers};fs.writeFileSync(`${root}/layout.json`,JSON.stringify(layout,null,2))
 const now=new Date().toISOString(),data=JSON.stringify(layout)
 const templateId=Number(db.prepare('insert into collage_templates(name,category,version,data,updated_at) values(?,?,?,?,?)').run('Smile, Darling · Tim & Kỷ niệm','Ảnh thật · Scrapbook',1,data,now).lastInsertRowid)
 db.prepare('insert into collage_template_versions values(?,?,?,?)').run(templateId,1,data,now)
 const designId=Number(db.prepare('insert into designs(user_id,template_id,title,data,cover,width,height) values(?,?,?,?,?,?,?)').run(source.user_id,0,'Smile, Darling — Bản dựng tham khảo',JSON.stringify([layout]),'',2400,2400).lastInsertRowid)
 db.close();console.log(JSON.stringify({templateId,designId,layers:layers.length,photos:layers.filter(w=>w.slot).length}))
})().catch(e=>{console.error(e);process.exitCode=1})
