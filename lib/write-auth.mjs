export async function validWriteToken(token, fingerprint) {
  if(typeof fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(fingerprint)||typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))return false;
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
  const actual=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  let difference=0;
  for(let i=0;i<64;i++)difference|=actual.charCodeAt(i)^fingerprint.charCodeAt(i);
  return difference===0;
}
