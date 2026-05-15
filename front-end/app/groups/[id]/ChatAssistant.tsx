'use client';

import { Sparkles, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  groupId: string;
}

export function ChatAssistant({ groupId }: Props) {
  const streamlitUrl = `http://localhost:8501?groupId=${groupId}`;

  return (
    <Card className="flex flex-col items-center justify-center border-dashed py-12 text-center">
      <CardHeader>
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="size-6" />
        </div>
        <CardTitle className="text-xl">עוזר תזמון חכם</CardTitle>
        <CardDescription className="max-w-xs text-balance">
          העוזר החכם שלנו יכול לנתח את הלו״ז של כולם, להציע זמנים ולדבר עם חברים על הזזת פגישות גמישות.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild size="lg" className="gap-2">
          <a href={streamlitUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="size-4" />
            פתח את העוזר בממשק מלא
          </a>
        </Button>
        <p className="mt-4 text-xs text-muted-foreground">
          הממשק ייפתח בלשונית חדשה (Port 8501)
        </p>
      </CardContent>
    </Card>
  );
}
