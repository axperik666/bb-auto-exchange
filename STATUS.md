# B & B Auto Exchange — статус

Обновлено: 18 августа 2026.

- 16 автомобилей, 160 локальных WebP-фото и 16 индивидуальных страниц `/cars/<vehicle-id>/`.
- Концепция: `Weekend Drive / Garage Dream`.
- Прямой рекламный URL фиксирует выбранную машину в HERO, отдельном proof-блоке, форме и 10-фото галерее.
- Открыто показываются точные цена и Stock Number.
- Основные действия: `Check Availability` и `Request Walk-Around Video`.
- WhatsApp удалён; оставлены Live Chat и телефон.
- Добавлены заполненные дилерские Privacy Policy и Terms of Use.
- Lead contract: `dealerId=bb-auto-exchange`, `landingId=bb-auto-exchange`, endpoint `/api/leads`; назначение звонарей выполняется серверным Routing, а не браузером.
- Полный QA на 1440×1000 и 390×844: 38/38 комбинаций прошли, 0 failures, 0 accessibility violations, 0 console/page errors, 0 broken local responses и 0 overflow.
- HTML-валидация, JavaScript syntax check и пакетная проверка прошли.
- `demoMode: true`: до платного трафика требуется реальный тест `форма → Google Sheets → Telegram → назначенный звонарь`, операторский live chat, подтверждение данных дилера и юридическое согласование политик.

Отчёт: `../WebOpsStudio/reports/qa-01_BB_Auto_Exchange.json`.
