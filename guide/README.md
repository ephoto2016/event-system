# דף ההדרכה: מערכות קשר (kesher.emanuelphoto.co.il)

## העלאה לשרת
מעלים לשורש האתר את התוכן של `kesher-guide.zip`:

```
index.html          הדף (בלי תלות בשרתים חיצוניים; הפונטים והאייקונים מובנים)
preview.png         תמונת התצוגה המקדימה בוואטסאפ/רשתות (1200×630)
assets/             פונטים (Heebo, Assistant), אייקון הדף
video/              חמשת הסרטונים (720p) + posters/
```

`https://kesher.emanuelphoto.co.il/preview.png` הוא הכתובת ש-`og:image` מצביע עליה, ולכן הקובץ חייב לשבת בשורש.
וואטסאפ שומרת תצוגה מקדימה במטמון: אחרי ההחלפה כדאי לבדוק קישור חדש (למשל עם `?v=2` בסוף הכתובת).

## עדכון הסרטונים
`./encode.sh <תיקיית המקורות בגודל 1080p>` מקודד מחדש ל-720p (faststart) ויוצר poster לכל סרטון.
אחרי שינוי ב-`index.template.html` מריצים `python3 build_index.py` כדי לייצר `index.html`.

## קרדיטים
האייקונים: Font Awesome Free 6.5.1 (CC BY 4.0), ראו `assets/FONT-AWESOME-LICENSE.txt`. הפונטים: Heebo ו-Assistant (SIL OFL).
