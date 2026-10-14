import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
export async function GET(req:NextRequest){
 const url=new URL(req.url);const code=url.searchParams.get('code');
 if(code){const client=await createClient();if(client){const {error}=await client.auth.exchangeCodeForSession(code);if(!error)return NextResponse.redirect(new URL('/app',url.origin));}}
 return NextResponse.redirect(new URL('/login?error=denied',url.origin));
}
