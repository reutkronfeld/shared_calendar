import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export const metadata: Metadata = { title: 'הצטרפות לקבוצה' };

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { JoinForm } from './JoinForm';

interface PageProps {
  searchParams: Promise<{ code?: string }>;
}

export default async function JoinGroupPage({ searchParams }: PageProps) {
  const { code } = await searchParams;
  const initialCode = typeof code === 'string' ? code.trim().slice(0, 60) : '';

  return (
    <section className="mx-auto w-full max-w-md flex-1 px-4 py-10">
      <Button asChild variant="link" size="sm" className="mb-4 ps-0">
        <Link href="/groups">
          <ArrowRight className="size-4" />
          חזרה
        </Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>הצטרפות לקבוצה</CardTitle>
          <CardDescription>
            {initialCode
              ? 'בדקו את הקוד ולחצו להצטרפות.'
              : 'הדביקו את קוד הקבוצה שקיבלתם מהמארגן.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <JoinForm initialCode={initialCode} />
        </CardContent>
      </Card>
    </section>
  );
}
