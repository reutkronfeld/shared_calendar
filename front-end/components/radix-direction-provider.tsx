'use client';

import { Direction } from 'radix-ui';
import * as React from 'react';

export function RadixDirectionProvider({ children }: { children: React.ReactNode }) {
  return <Direction.Provider dir="rtl">{children}</Direction.Provider>;
}
