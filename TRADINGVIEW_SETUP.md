# הוראות חיבור TradingView לבוט

## שלב 1 — הוסף Alert ב-TradingView

פתח את גרף BTC/USDT.P ב-TradingView עם האינדיקטור HPDR פעיל.

לחץ על פעמון ה-Alert (⏰) ← "Create Alert"

## שלב 2 — הגדרות ה-Alert

**Condition:** HPDR Strategy — Original Method
**בחר:** "Order fills only" או "alert() function calls only"

## שלב 3 — הודעת ה-Webhook

בשדה **"Message"** הכנס את הטקסט הבא:

### לסיגנל LONG:
```json
{
  "action": "long",
  "symbol": "{{ticker}}",
  "sl_pct": 2.5
}
```

### לסיגנל SHORT:
```json
{
  "action": "short", 
  "symbol": "{{ticker}}",
  "sl_pct": 2.5
}
```

## שלב 4 — כתובת Webhook

בשדה **"Webhook URL"** הכנס:
```
https://YOUR-PROJECT.vercel.app/api/webhook
```

(החלף YOUR-PROJECT בשם הפרויקט שלך ב-Vercel)

## שלב 5 — חזור על זה עבור ETH

פתח גרף ETH/USDT.P וצור Alert זהה.

## חשוב!

- צריך תוכנית TradingView שתומכת ב-Webhooks (Essential ומעלה)
- כל מטבע צריך Alert נפרד
- TradingView שולח את {{ticker}} אוטומטית — לא צריך לשנות
