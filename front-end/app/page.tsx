import { redirect } from 'next/navigation';
import { getMe } from '../lib/session';

export default async function Home() {
  const me = await getMe();
  redirect(me ? '/groups' : '/signin');
}
