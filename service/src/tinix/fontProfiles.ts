import fs from 'fs'
import path from 'path'
import {filePath} from '../configs'
import {readFontProfile,FontProfile} from '../../../shared/font-profile'
/** Invalidate derived facts if the URL or local file has changed since verification. */
export function verifiedFontProfile(row:any):FontProfile|null {
 const p=readFontProfile(row.technical,row.woff);if(!p)return null
 const url=p.local_url||row.woff
 if(!url.startsWith('/static/'))return null
 const root=path.resolve(filePath),file=path.resolve(root,decodeURIComponent(url.slice('/static/'.length)))
 if(!file.startsWith(root+path.sep))return null
 try{const stat=fs.statSync(file);if(stat.size!==p.bytes||Math.abs(stat.mtimeMs-(p.mtime_ms||0))>2)return null}catch{return null}
 return p
}
export function renderFontProfile(row:any):string {
 const p=verifiedFontProfile(row);if(!p)return '{}'
 return JSON.stringify({...p,coverage:[],hash:undefined,error:undefined})
}
