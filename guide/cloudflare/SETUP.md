# הקמת מדידת הצפיות ב-Cloudflare (כ-10 דקות, הכול בדשבורד)

האתר עצמו (`square-haze-19f9`) נשאר כמו שהוא. מוסיפים לצידו Worker קטן בשם `kesher-stats` שקולט את הצפיות ומציג דשבורד.

1. **מסד נתונים.** Cloudflare ← Storage & Databases ← **D1** ← Create database ← שם: `kesher-stats`.
2. **ה-Worker.** Workers & Pages ← **Create** ← Worker ← "Hello World" ← שם `kesher-stats` ← Deploy.
   אחר כך **Edit code**, מוחקים את הקוד שיש ומדביקים את כל התוכן של `worker.js`, ולוחצים **Deploy**.
3. **חיבור המסד.** בדף ה-Worker: Settings ← Bindings ← Add ← **D1 database**. Variable name: `DB`. בוחרים `kesher-stats`. Save.
4. **הגדרות.** Settings ← Variables and Secrets ← Add:
   - סוג **Secret**, שם `ADMIN_PASSWORD`: הסיסמה שלך לדשבורד.
   - סוג **Secret**, שם `SALT`: טקסט אקראי ארוך (30 תווים ומעלה, בלי משמעות).
   - סוג **Text**, שם `SITE_ORIGIN`: `https://kesher.emanuelphoto.co.il`  (בלי לוכסן בסוף)
   ואז Deploy.
5. **כתובת ה-Worker.** בראש הדף מופיעה הכתובת, בצורה `https://kesher-stats.<שם>.workers.dev`. מעתיקים אותה.
6. **מחברים את הדף.** ב-`index.html` מחפשים את השורה `<meta name="stats-endpoint" content="">` ומדביקים בין המרכאות:
   `https://kesher-stats.<שם>.workers.dev/collect`
   (או שולחים לי את הכתובת, ואני מכין zip מוכן).
7. **מעלים את הדף מחדש.** ה-Worker `square-haze-19f9` ← **New deployment** ← התיקייה (מהתוכן של ה-zip, בלי תיקיות הפיתוח).
8. **הדשבורד:** `https://kesher-stats.<שם>.workers.dev/stats` ← סיסמה `ADMIN_PASSWORD`.

בדיקה: פותחים את הדף בטלפון, גוללים ומנגנים סרטון, ואחרי רגע נכנסים לדשבורד: צפייה אחת אמורה להופיע.

הערות:
- אם משאירים את `content=""` ריק, הדף עובד רגיל והמדידה כבויה.
- נתונים נשמרים ב-D1 בחשבון שלך בלבד. אין IP ואין עוגיות למבקרים. הכל חינמי עבור נפח רגיל.
- להחלפת סיסמה: משנים את `ADMIN_PASSWORD` ב-Settings ← Variables and Secrets.
