import * as T from 'three';
import { Agent } from '@/lib/office-types';
import { deskDisplayMode } from '@/lib/office-interactions.mjs';

export function createDeskScreen() {
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=320;
  const ctx=canvas.getContext('2d')!;
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
  const mesh=new T.Mesh(new T.PlaneGeometry(.95,.6),new T.MeshBasicMaterial({map:texture}));
  let previous='';
  return {mesh,draw(agent:Agent|undefined,life:{zone:string;moving:boolean}|undefined,time:number,reduced:boolean){
    const mode=deskDisplayMode(agent,life),frame=reduced?0:Math.floor(time*4);
    const key=`${mode}:${agent?.category}:${agent?.status}:${mode==='off'?0:frame}`;
    if(key===previous)return;previous=key;
    ctx.fillStyle=mode==='off'?'#101a1b':'#172d35';ctx.fillRect(0,0,512,320);
    if(mode==='saver') {
      const t=reduced?0:time*.55;
      ctx.fillStyle='#7fc9b1';ctx.beginPath();ctx.arc(256+Math.sin(t)*165,155+Math.cos(t*.8)*82,28,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#d2e6dc';ctx.font='20px monospace';ctx.textAlign='center';ctx.fillText('ON A BREAK',256,285);ctx.textAlign='left';
    } else if(mode==='work' && agent) {
      const caution=agent.status==='blocked'||agent.status==='error';
      ctx.fillStyle=caution?'#dcb47c':'#8ccab3';ctx.fillRect(0,0,512,38);
      ctx.fillStyle='#183332';ctx.font='bold 20px monospace';
      ctx.fillText(caution?(agent.status==='error'?'NEEDS HELP':'AWAITING INPUT'):(agent.category??'WORKSPACE').toUpperCase(),20,26);
      ctx.fillStyle='#28434c';ctx.fillRect(0,39,85,281);
      for(let j=0;j<6;j++){ctx.fillStyle=j===frame%6?'#77b9a1':'#48636c';ctx.fillRect(14,65+j*33,54,10);}
      if(agent.category==='testing') {
        for(let i=0;i<5;i++){ctx.strokeStyle='#9ec7bc';ctx.strokeRect(112,66+i*43,16,16);ctx.fillStyle='#91b3bd';ctx.fillRect(145,69+i*43,220-i*19,9);}
      } else if(['research','planning','design'].includes(agent.category??'')) {
        for(let i=0;i<4;i++){ctx.fillStyle=['#647e9b','#648d81','#a59b7a','#927d92'][i];ctx.fillRect(108+(i%2)*190,65+Math.floor(i/2)*113,170,91);ctx.fillStyle='#cbded8';ctx.fillRect(121+(i%2)*190,78+Math.floor(i/2)*113,100,8);}
      } else {
        for(let i=0;i<10;i++){ctx.fillStyle=['#99c7af','#c7aa7d','#8aaec9'][i%3];ctx.fillRect(108+(i%3)*14,61+i*23,80+(i*47)%225,9);}
        if(frame%4<2){ctx.fillStyle='#e5e8c1';ctx.fillRect(134,286,11,17);}
      }
      if(caution){ctx.fillStyle='#e8b96e';ctx.fillRect(405,263,80,31);}
    }
    texture.needsUpdate=true;
  }};
}
