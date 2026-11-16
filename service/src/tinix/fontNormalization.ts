import {spawn} from 'child_process'
import path from 'path'
const state={running:false,exitCode:null as number|null,log:''}
export function normalizationStatus(){return {...state}}
export function startNormalization(){
 if(state.running)return normalizationStatus()
 state.running=true;state.exitCode=null;state.log=''
 const child=spawn(process.execPath,[path.resolve(process.cwd(),'../scripts/tinix-normalize-fonts.mjs')],{cwd:path.resolve(process.cwd(),'..'),windowsHide:true})
 const log=(data:any)=>{state.log=(state.log+String(data)).slice(-5000)}
 child.stdout.on('data',log);child.stderr.on('data',log)
 child.on('error',e=>{log(e.message);state.running=false;state.exitCode=-1})
 child.on('close',code=>{state.running=false;state.exitCode=code===null?-1:code})
 return normalizationStatus()
}
