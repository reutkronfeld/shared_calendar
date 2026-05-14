# הנחיות לפרונט-אנד

## שפה וכיוון
- האפליקציה בעברית. `<html lang="he" dir="rtl">` בלייאאוט.
- כל מחרוזות ה-UI הגלויות למשתמש בעברית.
- ערכים שצריכים להישאר LTR (אימייל, קודי קבוצה, placeholder באנגלית) מסומנים במפורש עם `dir="ltr"`.

## כללי קוד
- **ולידציה: Zod** — כל סכמת קלט/פלט (טפסים, ניתוח תגובות API) דרך `zod`. אין לסמוך על `any` או cast ידני.
- **טפסים: react-hook-form** עם `@hookform/resolvers/zod` לחיבור הסכמות. אין `useState` ידני לכל שדה.
- **גודל קובץ: עד 500 שורות**. אם קובץ מתקרב לגבול — לפצל לרכיבים, hooks, או utils.
- מועדף server components; להוסיף `'use client'` רק כשבאמת צריך אינטראקטיביות.

## ספריית רכיבים: shadcn/ui
- כל אלמנט UI חייב להגיע מ-`@/components/ui/*` (Button, Card, Input, Label, Select, Switch, Dialog, Alert, Badge, Separator, DropdownMenu וכו'). **לא** לכתוב כפתורי `<button>` או אינפוטים `<input>` עם Tailwind ידני.
- צבעים — להשתמש בטוקנים: `bg-background`, `text-foreground`, `bg-card`, `text-muted-foreground`, `border`, `bg-primary`, `text-destructive`. **לא** `bg-zinc-*`, `bg-white`, `dark:bg-black` ישירים.
- ל-`Button` להעדיף את ה-`variant` המובנה (`default`, `outline`, `ghost`, `secondary`, `destructive`, `link`) במקום מחלקות `bg-…` ידניות.
- אייקונים מ-`lucide-react`.
- להוסיף רכיב חדש: `npx shadcn@latest add <name>`. לערוך את הגרסה ב-`components/ui/<name>.tsx` באופן ידני אם צריך התאמה.
- Dark mode: דרך `next-themes` (כבר מותקן). שינוי class על `<html>`, ה-CSS variables ב-globals.css מטפלים בשאר. אין `dark:bg-…` ידני אלא אם באמת חיוני.
- RTL: shadcn מאותחל עם `--rtl` (`logical properties`: `ms-`, `me-`, `ps-`, `pe-`). אין `ml-`/`mr-` ידני.

## מבנה
- `app/` — Next.js App Router (routes + page-level components)
- `lib/` — מודולי משותפים (api client, session, utils)
- `components/` — רכיבי UI לשימוש חוזר; `components/ui/` שייך ל-shadcn (לא לערוך ללא צורך)
- `schemas/` — Zod schemas משותפות

## ספריות
- Next.js 16 (App Router, Turbopack)
- Tailwind v4
- shadcn/ui (Radix base, Nova preset, RTL)
- `zod` לוולידציה
- `react-hook-form` + `@hookform/resolvers/zod` לטפסים
- `next-themes` ל-light/dark mode
- `lucide-react` לאייקונים
