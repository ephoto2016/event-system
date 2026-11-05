# דף ההדרכה: מערכות קשר (kesher.emanuelphoto.co.il)

## העלאה לשרת
מעלים לשורש האתר את כל התוכן של `kesher-guide.zip` (בלי תיקייה נוספת):

```
index.html        הדף (הפונטים והאייקונים מובנים; עובד גם בלי אינטרנט)
preview.png       תמונת התצוגה המקדימה בוואטסאפ/רשתות (1200×630); חייב להיות בשורש
assets/           פונטים, אייקונים, לוגו, track.js (מדידת צפיות)
video/            חמשת הסרטונים (720p), posters/ והטיזר לשיתוף (teaser-9x16.mp4)
collect.php       קולט את אירועי המדידה האנונימיים
stats.php         דשבורד הסטטיסטיקה (מוגן בסיסמה): /stats.php
config.php        סיסמת הדשבורד (hash) והגדרות. פרטי, חסום בגישה ישירה
lib.php           קוד משותף (חסום בגישה ישירה)
.htaccess         חסימת config.php / lib.php והצגת תיקיות (Apache)
```
וואטסאפ שומרת תצוגה מקדימה במטמון: אחרי החלפה, בדקו קישור חדש (למשל עם `?v=2`).

## דרישות לשרת למדידת צפיות
- PHP 7.4 ומעלה עם `pdo_sqlite`, והרשאת כתיבה לתיקיית האתר (נוצרת אוטומטית תיקיית `data/` עם `stats.sqlite`).
- **Apache:** `.htaccess` חוסם את `data/` ו-`config.php`. **nginx (או שרת אחר שמתעלם מ-.htaccess):** ב-`config.php` הגדירו `'data_dir' => '/path/outside/webroot'`, וחסמו גישה ישירה ל-`config.php` ו-`lib.php`.
- אם אין PHP בשרת: הדף עובד כרגיל (המדידה פשוט כבויה). אפשר להחליף את `ENDPOINT` ב-`assets/track.js` בשירות אחר.
- הדשבורד: `https://kesher.emanuelphoto.co.il/stats.php`. להחלפת סיסמה: `php -r 'echo password_hash("הסיסמה-החדשה", PASSWORD_BCRYPT);'` ולהדביק את התוצאה ב-`admin_hash` ב-`config.php`.

## מה נמדד (אנונימי: בלי עוגיות, בלי שמירת IP, בלי צד שלישי)
צפיות, מבקרים (מזהה מגובב שמתחלף מדי יום), זמן שהייה בפועל, עומק גלילה, הפעלות/השלמות/שניות צפייה בכל סרטון, מסך מלא, לחיצות שיתוף ושיתופים שהושלמו, כניסות שהגיעו משיתוף (`?src=share`), פניות ליצירת קשר, סוג מכשיר, כיוון מסך, מקור הגעה. מכבד Do-Not-Track. בוטים ותצוגות מקדימות של וואטסאפ לא נספרים.

## עדכון הסרטונים והדף
`./encode.sh <תיקיית המקורות 1080p> [teaser_short_9x16.mp4]` מקודד ל-720p עם poster. אחרי שינוי ב-`index.template.html`: `python3 build_index.py`.

## קרדיטים
אייקונים: Font Awesome Free 6.5.1 (CC BY 4.0), `assets/FONT-AWESOME-LICENSE.txt`. פונטים: Heebo ו-Assistant (SIL OFL).
