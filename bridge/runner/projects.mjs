import { realpath,readFile,mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { atomicJson } from '../collector/config.mjs';
const exec=promisify(execFile);
export const projectFile=()=>join(homedir(),'.agent-office','projects.json');
export async function readProjects(file=projectFile()) {
  const projects=JSON.parse(await readFile(file,'utf8'));
  if(!Array.isArray(projects)||projects.length>20)throw new Error('專案清單不正確');
  for(const p of projects){if(!/^[a-z0-9_-]{1,40}$/.test(p.id)||typeof p.name!=='string'||p.name.length>80||typeof p.path!=='string'||typeof p.worktreeRoot!=='string')throw new Error('專案設定不正確');}
  return projects;
}
export async function registerProject({id,name,path,worktreeRoot,file=projectFile()}) {
  if(!/^[a-z0-9_-]{1,40}$/.test(id)||!name||name.length>80)throw new Error('請提供專案識別與名稱');
  const root=await realpath(path),git=await exec('git',['rev-parse','--show-toplevel'],{cwd:root});
  if(await realpath(git.stdout.trim())!==root)throw new Error('請選擇 Git 專案根目錄');
  await mkdir(worktreeRoot,{recursive:true});const target=await realpath(worktreeRoot);
  let projects=[];try{projects=await readProjects(file);}catch(e){if(e.code!=='ENOENT')throw e;}
  projects=projects.filter(p=>p.id!==id);projects.push({id,name,path:root,worktreeRoot:target});await atomicJson(file,projects);return projects;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const {values}=parseArgs({options:{id:{type:'string'},name:{type:'string'},path:{type:'string'},'worktrees':{type:'string'},file:{type:'string'}}});
  if(!values.path||!values.id)throw new Error('需要 --id 和 --path');
  await registerProject({id:values.id,name:values.name??values.id,path:values.path,worktreeRoot:values.worktrees??join(homedir(),'.agent-office','worktrees',values.id),file:values.file});console.log('本機可派工專案已登記；路徑不會公開。');
}
