'use server';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {z} from 'zod';
import {getContext} from '@/lib/session';
const Company=z.object({name:z.string().trim().min(2).max(200),eik:z.string().regex(/^\d{9,13}$/),address:z.string().trim().max(300)});
export async function createCompany(fd:FormData){const ctx=await getContext();if(!ctx.tenant||!['admin','specialist'].includes(ctx.role))throw new Error('Forbidden');
const parsed=Company.safeParse({name:fd.get('name'),eik:fd.get('eik'),address:fd.get('address')||''});if(!parsed.success)throw new Error('Invalid input');
const {error}=await ctx.supabase.from('companies').insert({tenant_id:ctx.tenant,name:parsed.data.name,eik:parsed.data.eik,address:parsed.data.address,status:'active'});if(error)throw new Error('Неуспешно записване. Проверете дали ЕИК вече съществува и дали имате достъп.');
revalidatePath('/app/companies');redirect('/app/companies');}
