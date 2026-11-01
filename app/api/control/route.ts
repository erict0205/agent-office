import { requireOwner,ownerJson } from '@/lib/server-owner';
import { controlView,ownerCommand } from '@/lib/server-control';
import { errorResponse } from '@/lib/server-office';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{await requireOwner();return Response.json(await controlView(new URL(request.url).searchParams.get('agent'),new URL(request.url).searchParams.get('task')),{headers:{'Cache-Control':'no-store','Vary':'Cookie'}});}catch(e){return errorResponse(e);}}
export async function POST(request:Request){try{await requireOwner(request);return Response.json(await ownerCommand(await ownerJson(request)),{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}
