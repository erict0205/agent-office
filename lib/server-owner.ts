import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { ownerIdentity } from './office-access.mjs';
import { HttpError } from './server-office';

// The bootstrap address comes only from Site ownership, never from a visitor.
// Once bound, authorization uses the Site-scoped immutable identity ID.
export async function officeOwner() {
  const user=await getChatGPTUser();
  if(!user||!env.DB)return null;
  const pinned=await env.DB.prepare("SELECT value FROM office_settings WHERE key='owner_id'").first<{value:string}>();
  if(!ownerIdentity(user,pinned?.value,env.OFFICE_OWNER_EMAIL))return null;
  if(!pinned){
    await env.DB.prepare("INSERT OR IGNORE INTO office_settings(key,value) VALUES ('owner_id',?)").bind(user.userId).run();
    const bound=await env.DB.prepare("SELECT value FROM office_settings WHERE key='owner_id'").first<{value:string}>();
    if(bound?.value!==user.userId)return null;
  }
  return user;
}
export async function requireOwner(request?:Request) {
  const user=await officeOwner();if(!user)throw new HttpError(403,'只有工作室擁有者可以查看細節或操作工作');
  if(request && (request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('X-Office-Action')!=='1'))throw new HttpError(403,'請從工作室管理畫面操作');
  return user;
}
export async function ownerJson(request:Request,limit=24000) {
  if(!request.headers.get('content-type')?.startsWith('application/json'))throw new HttpError(415,'需要 JSON');
  const reader=request.body?.getReader();if(!reader)throw new HttpError(400,'沒有資料');
  let size=0,text='';const decoder=new TextDecoder();
  for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new HttpError(413,'資料太大');}text+=decoder.decode(value,{stream:true});}
  try{return JSON.parse(text+decoder.decode());}catch{throw new HttpError(400,'JSON 格式不正確');}
}
