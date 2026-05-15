# HPDR Bot 🤖

בוט מסחר אוטומטי לחוזים עתידיים על Gate.io
מבוסס על אסטרטגיית HPDR עם TradingView Webhooks

## ארכיטקטורה

```
TradingView (Pine Script HPDR)
        ↓ Webhook Alert
Vercel (Next.js API)
        ↓
  ┌─────┴─────┐
Supabase    Gate.io
(שמירה)    (ביצוע)
```

## שלבי התקנה

### 1. שכפל את הפרויקט ל-GitHub
העלה את כל הקבצים לריפוזיטורי ב-GitHub

### 2. הגדר משתני סביבה ב-Vercel
לך ל: Vercel → Settings → Environment Variables

הוסף את המשתנים הבאים:
```
GATE_API_KEY        = המפתח שלך מ-Gate.io
GATE_SECRET         = הסיקרט שלך מ-Gate.io  
SUPABASE_URL        = https://XXXX.supabase.co
SUPABASE_SECRET_KEY = המפתח הסודי מ-Supabase
```

### 3. הרץ את ה-SQL ב-Supabase
לך ל: Supabase → SQL Editor
הדבק ות הרץ את תוכן הקובץ: `supabase/schema.sql`

### 4. חבר TradingView
עיין בקובץ: `TRADINGVIEW_SETUP.md`

## מבנה הפרויקט

```
hpdr-bot/
├── api/
│   └── webhook.js          # מקבל סיגנלים מ-TradingView
├── app/
│   └── page.js             # דשבורד
├── supabase/
│   └── schema.sql          # מסד נתונים
├── .env.example            # תבנית משתני סביבה
├── TRADINGVIEW_SETUP.md    # הוראות TradingView
└── README.md
```

## אסטרטגיית הכניסה (מהאינדיקטור)

- **Long**: מחיר נוגע ב-L97.5% וסוגר מעליה עם נר חזק
- **Short**: מחיר נוגע ב-U97.5% וסוגר מתחתיה עם נר חזק

## ניהול יציאות

| שלב | כמות | יעד |
|-----|------|-----|
| TP1 | 50% | Median |
| TP2 | 25% | 61.8% |
| TP3 | 25% | 88.3% |
| SL  | 100% | -2.5% |

## אבטחה

⚠️ לעולם אל תעלה את קובץ `.env.local` ל-GitHub
⚠️ לעולם אל תשתף את ה-API Keys
⚠️ הבוט מחובר ל-Sub-Account BOT0 בלבד — הכסף הראשי מוגן
