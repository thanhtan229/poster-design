const fs=require('fs'),crypto=require('crypto'),DB=require('../service/node_modules/better-sqlite3'),sharp=require('../service/node_modules/sharp')
;(async()=>{
 const db=new DB('service/data/poster.db'),old=db.prepare('select * from collage_templates where id=40').get(),l=JSON.parse(old.data)
 if(old.version!==1)throw new Error('Chỉ tinh chỉnh từ bản gốc v1; không ghi đè chỉnh sửa sau đó')
 const root='service/static/collage/smile-darling-v2';fs.mkdirSync(root,{recursive:true})
 const paper=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".7" numOctaves="3" seed="8"/><feColorMatrix type="saturate" values="0"/></filter><rect width="300" height="300" fill="#f4ebd5"/><rect width="300" height="300" filter="url(#n)" opacity=".055"/></svg>')
 await sharp(paper).png().toFile(root+'/paper.png')
 const font=(file,value)=>({value,url:'/static/fonts/'+file,alias:value})
 for(const w of l.layers){
  if(w.type==='w-text'){
   const script=['Lời yêu thương','Lời nhắn'].includes(w.name),hand=['Hello'].includes(w.name)
   const f=script?font('Satisfy-Regular.ttf','smile-satisfy'):hand?font('PatrickHand-Regular.ttf','smile-patrick'):font('AmaticSC-Regular.ttf','smile-amatic')
   w.fontClass=f;w.fontFamily=f.value;w.fontWeight='normal';w.fontSize=script?52:hand?40:w.name==='Say cheese'?88:78;w.height=w.fontSize*2.5
   if(w.name==='Lời nhắn'){w.fontSize=48;w.top+=10}
   if(w.name==='Lời yêu thương'){w.top+=8;w.fontSize=49}
  }
  if(w.imgUrl?.endsWith('/paper.png'))w.imgUrl='/static/collage/smile-darling-v2/paper.png'
  if(w.type==='w-image'&&w.printRole==='raised')w.effects={...w.effects,shadow:8}
 }
 // Rotate whole print units around their original top-left, preserving photo/frame registration.
 const tilts={'Ảnh lớn trái':-3,'Ảnh lớn phải':2,'Ảnh dải 1':-2,'Ảnh dọc phải':4,'Smile darling':-2,'Say cheese':-3,'Nhãn Smile':-2,'Lời yêu thương':1,'Lời nhắn':3}
 for(const [name,angle] of Object.entries(tilts)){
  const target=l.layers.find(w=>w.name===name);if(!target?.printGroup)continue
  const members=l.layers.filter(w=>w.printGroup===target.printGroup),x=Math.min(...members.map(w=>w.left)),y=Math.min(...members.map(w=>w.top)),right=Math.max(...members.map(w=>w.left+w.width)),bottom=Math.max(...members.map(w=>w.top+w.height)),uuid=crypto.randomUUID()
  const group={type:'w-group',name:'Cụm '+name,uuid,left:x,top:y,width:right-x,height:bottom-y,parent:'-1',isContainer:true,opacity:1,rotate:angle+'deg',printGroup:target.printGroup,printRole:'raised',templateRole:'fixed',record:{width:right-x,height:bottom-y,minWidth:0,minHeight:0,dir:'none'}}
  const index=Math.min(...members.map(w=>l.layers.indexOf(w)));for(const w of members)w.parent=uuid;l.layers.splice(index,0,group)
 }
 l.global.collage.version=2
 const data=JSON.stringify(l),now=new Date().toISOString();let designId
 db.transaction(()=>{db.prepare('update collage_templates set version=2,data=?,updated_at=? where id=40').run(data,now);db.prepare('insert into collage_template_versions values(?,?,?,?)').run(40,2,data,now);const src=db.prepare('select * from designs where id=145').get();designId=Number(db.prepare('insert into designs(user_id,template_id,title,data,cover,width,height) values(?,?,?,?,?,?,?)').run(src.user_id,0,'Smile, Darling — Giấy ấm & chữ viết tay v2',JSON.stringify([l]),'',2400,2400).lastInsertRowid)})();db.close();fs.writeFileSync(root+'/layout.json',JSON.stringify(l,null,2));console.log(JSON.stringify({templateId:40,version:2,designId}))
})().catch(e=>{console.error(e);process.exitCode=1})
