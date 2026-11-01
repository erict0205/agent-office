import { officeOwner } from '@/lib/server-owner';
export const dynamic='force-dynamic';
export async function GET(){const owner=await officeOwner();return Response.json({isOwner:Boolean(owner)},{headers:{'Cache-Control':'no-store','Vary':'Cookie'}});}
