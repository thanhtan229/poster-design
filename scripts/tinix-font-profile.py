"""Read real font tables. Called by tinix-normalize-fonts.mjs; never edits the database."""
import json,sys,hashlib,urllib.request,urllib.parse,datetime
from pathlib import Path
from fontTools.ttLib import TTFont
root=Path(__file__).resolve().parents[1];static=root/'service/static'
rows=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'));out=[]
required=set(map(ord,'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÀÁÃÈÉÌÍÒÓÕÙÚÝàáãèéìíòóõùúýĂăÂâÊêÔôƠơƯưĐđ'))|set(range(0x1ea0,0x1efa))
def ranges(codes):
 result=[]
 for code in sorted(codes):
  if result and code==result[-1][1]+1:result[-1][1]=code
  else:result.append([code,code])
 return result
for index,row in enumerate(rows):
 p={'version':1,'status':'partial','source_url':row['woff'],'browser_loaded':False,'checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat()}
 f=None
 try:
  url=row['woff'];parsed=urllib.parse.urlparse(url)
  if parsed.scheme in ('http','https'):
   key=hashlib.sha256(url.encode()).hexdigest();ext=Path(parsed.path).suffix or '.font';dest=static/'fonts/verified'/ (key+ext);dest.parent.mkdir(parents=True,exist_ok=True)
   if not dest.exists():
    with urllib.request.urlopen(url,timeout=25) as response:dest.write_bytes(response.read())
   p['local_url']='/static/'+dest.relative_to(static).as_posix()
  else:
   if not parsed.path.startswith('/static/'):raise ValueError('Not a managed font URL')
   dest=(static/urllib.parse.unquote(parsed.path[len('/static/'):])).resolve()
   if not dest.is_relative_to(static.resolve()):raise ValueError('Font path outside static directory')
  raw=dest.read_bytes();p.update(hash=hashlib.sha256(raw).hexdigest(),bytes=len(raw),mtime_ms=dest.stat().st_mtime*1000)
  f=TTFont(str(dest),lazy=True);cmap=f.getBestCmap() or {};codes={code for code,name in cmap.items() if name!='.notdef'};p['coverage']=ranges(codes);p['supports_vietnamese']=not bool(required-codes)
  head=f['head'];p['units_per_em']=head.unitsPerEm;p['italic']=bool(head.macStyle&2)
  names=f['name'];p['family']=names.getDebugName(16) or names.getDebugName(1);p['subfamily']=names.getDebugName(17) or names.getDebugName(2)
  os2=f['OS/2'];p['weight']=os2.usWeightClass;p['width']=os2.usWidthClass
  p['italic']=p['italic'] or bool(os2.fsSelection&1)
  p['cap_height']=getattr(os2,'sCapHeight',None);p['x_height']=getattr(os2,'sxHeight',None)
  p['axes']=[{'tag':a.axisTag,'min':a.minValue,'max':a.maxValue,'default':a.defaultValue} for a in f['fvar'].axes] if 'fvar' in f else []
  if not 1<=p['weight']<=1000 or not 1<=p['width']<=9:raise ValueError('Invalid weight or width')
  if not codes:raise ValueError('Missing Unicode character map')
  p['parsed']=True
 except Exception as e:p['error']=str(e)[:300]
 finally:
  if f:f.close()
 out.append({'id':row['id'],'profile':p})
 if (index+1)%250==0:print('Parsed',index+1,flush=True)
Path(sys.argv[2]).write_text(json.dumps(out,ensure_ascii=False),encoding='utf-8')
