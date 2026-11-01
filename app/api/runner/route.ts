import { requireRunner,runnerMessage } from '@/lib/server-runner';
import { readBoundedJson,errorResponse } from '@/lib/server-office';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{await requireRunner(request);return Response.json(await runnerMessage(await readBoundedJson(request,60000)),{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}
