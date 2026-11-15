// Requires the running app (default http://127.0.0.1:7001). Fixtures exist only in browser memory.
const {spawnSync}=require('node:child_process')
for(const name of ['ctrl-marquee','multi-context-menu','image-frame-ui']){
 console.log(`Running ${name}`)
 const result=spawnSync(process.execPath,[`scripts/tinix-selftest/${name}.cjs`],{stdio:'inherit',timeout:600000})
 if(result.error||result.status!==0){console.error(result.error||`Failed: ${name}`);process.exit(1)}
}
console.log('PASS browser editor suites')
