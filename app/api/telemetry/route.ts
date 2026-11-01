import { requireOfficeWriter,readBoundedJson,errorResponse } from '@/lib/server-office';
import { telemetryStatements,trimTelemetry } from '@/lib/server-telemetry';
import { db } from '@/lib/server-control';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{await requireOfficeWriter(request);const body=await readBoundedJson(request,60000);await db().batch([...telemetryStatements(body.events),trimTelemetry()]);return Response.json({ok:true});}catch(e){return errorResponse(e);}}
