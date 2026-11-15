// Separate development/holdout fixtures. Never overwrite the original ten references.
const fs = require('node:fs'), path = require('node:path');
const puppeteer = require('../service/node_modules/puppeteer');
const sharp = require('../service/node_modules/sharp');
const base = process.env.TINIX_APP_URL || 'http://127.0.0.1:7001';
const out = '.runtime/font-quality-expanded';
const specs = [
  ['Inter', 600, 'BE YOUR OWN STORY', 'dark', 0, 'development'],
  ['Prata', 400, 'Một ngày thật đẹp', 'gradient', 0, 'development'],
  ['Dancing Script', 600, 'Love and laughter', 'jpeg', 0, 'development'],
  ['Lato', 400, 'THE WORLD\nIS YOURS', 'plain', 0, 'development'],
  ['Raleway', 500, 'SEPTEMBER DAYS', 'plain', 2, 'development'],
  ['@italic', 400, 'A beautiful moment', 'plain', 0, 'development'],
  ['Nunito', 600, 'CREATE YOUR FUTURE', 'dark', 0, 'holdout'],
  ['Pacifico', 400, 'Ngày nắng đẹp', 'jpeg', 0, 'holdout'],
  ['Archivo', 500, 'MEMORIES\nLAST FOREVER', 'gradient', 0, 'holdout'],
  ['Lora', 400, 'Small beautiful things', 'plain', 1.5, 'holdout'],
  ['Josefin Sans', 500, 'BÌNH YÊN', 'jpeg', 0, 'holdout'],
  ['Cormorant Garamond', 500, 'NEW BEGINNINGS', 'gradient', 0, 'holdout'],
];
async function main() {
  if (fs.existsSync(path.join(out, 'cases.json'))) throw Error('Expanded fixtures already exist; reuse the frozen manifest.');
  const fonts = (await fetch(base + '/design/fonts').then(r => r.json())).result.list;
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage(); await page.goto(base, { waitUntil: 'domcontentloaded' });
    const cases = []; fs.mkdirSync(out, { recursive: true });
    for (let i = 0; i < specs.length; i++) {
      const [name, weight, text, condition, tracking, split] = specs[i];
      const f = name === '@italic' ? fonts.find(f => { const p = JSON.parse(f.technical || '{}'); return p.status === 'verified' && p.italic && !/symbol|ding|vni/i.test(f.value); }) : fonts.find(f => f.value === name);
      if (!f) throw Error('Missing fixture font ' + name);
      const result = await page.evaluate(async ({ f, weight, text, condition, tracking }) => {
        const p = JSON.parse(f.technical), axis = p.axes?.find(a => a.tag === 'wght');
        for (const old of [...document.fonts]) if (old.family === 'fixture') document.fonts.delete(old);
        const face = new FontFace('fixture', `url(${JSON.stringify(p.local_url || f.woff)})`, { weight: axis ? `${axis.min} ${axis.max}` : String(p.weight), style: p.italic ? 'italic' : 'normal' });
        await face.load(); document.fonts.add(face);
        const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 420;
        const ctx = canvas.getContext('2d');
        if (condition === 'gradient') { const g = ctx.createLinearGradient(0,0,1200,420);g.addColorStop(0,'#ece4da');g.addColorStop(1,'#b7c9ce');ctx.fillStyle=g; }
        else ctx.fillStyle = condition === 'dark' ? '#242932' : '#fafafa';
        ctx.fillRect(0,0,1200,420);
        let size = 92; const lines = text.split('\n'), style = `${p.italic ? 'italic' : 'normal'} ${axis ? weight : p.weight}`;
        ctx.font = `${style} ${size}px fixture`;
        const maxWidth = Math.max(...lines.map(l => ctx.measureText(l).width + tracking * Math.max(0,l.length-1)));
        size *= Math.min(1, 1060 / maxWidth);ctx.font = `${style} ${size}px fixture`;
        ctx.textBaseline = 'top';ctx.fillStyle = condition === 'dark' ? '#f8f8f8' : '#141414';ctx.letterSpacing = tracking + 'px';
        lines.forEach((line,n) => ctx.fillText(line,60,65+n*size*1.3));
        return { image:canvas.toDataURL(), weight:axis ? weight : p.weight, italic:!!p.italic, bbox:{x:40/1200,y:45/420,w:1120/1200,h:Math.min(355,lines.length*size*1.4+35)/420} };
      }, { f, weight, text, condition, tracking });
      const image = `${out}/extended-${i+1}.${condition==='jpeg'?'jpg':'png'}`;
      let bytes = Buffer.from(result.image.split(',')[1], 'base64');
      if (condition === 'jpeg') bytes = await sharp(bytes).resize(720).jpeg({quality:38}).toBuffer();
      fs.writeFileSync(image,bytes);
      cases.push({name:'extended-'+(i+1),fontId:f.id,fontFamily:f.value,weight:result.weight,italic:result.italic,text,image,bbox:result.bbox,condition,tracking,split});
    }
    fs.writeFileSync(out+'/cases.json',JSON.stringify(cases,null,2));
    fs.writeFileSync(out+'/all-cases.json',JSON.stringify([...JSON.parse(fs.readFileSync('.runtime/font-quality/cases.json')).map(c=>({...c,split:'regression',condition:'clean'})),...cases],null,2));
    console.log('Frozen 12 stress fixtures: 6 development, 6 holdout; combined with original 10. Synthetic backgrounds/compression, not real-photo ground truth.');
  } finally { await browser.close(); }
}
main().catch(e=>{console.error(e);process.exitCode=1});
