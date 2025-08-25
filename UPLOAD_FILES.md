# 📤 Быстрая загрузка исправленных файлов на сервер

## 🚀 Файлы, которые были исправлены:
- `routes/product-groups.js` - исправлен импорт auth middleware
- `routes/invoices.js` - исправлен импорт auth middleware  
- `routes/deliveries.js` - исправлен импорт auth middleware
- `troubleshooting-guide.html` - обновленная инструкция

## 📋 Команды для загрузки

### Способ 1: SCP (рекомендуется)
```bash
# ⚠️ ВАЖНО: Замените [IP_СЕРВЕРА] на реальный IP вашего сервера!
# Пример: если IP сервера 192.168.1.100, то команды будут:

scp routes/product-groups.js root@192.168.1.100:/opt/srecha/app/routes/
scp routes/invoices.js root@192.168.1.100:/opt/srecha/app/routes/
scp routes/deliveries.js root@192.168.1.100:/opt/srecha/app/routes/
scp troubleshooting-guide.html root@192.168.1.100:/opt/srecha/app/

# Замените 192.168.1.100 на IP ВАШЕГО сервера!
```

### Способ 2: RSYNC (синхронизация всего проекта)
```bash
rsync -avz --exclude 'node_modules' --exclude '.git' --exclude '.env' \
  ./ root@[IP_СЕРВЕРА]:/opt/srecha/app/
```

### Способ 3: Git (если используете репозиторий)
```bash
# Локально
git add routes/product-groups.js routes/invoices.js routes/deliveries.js
git add troubleshooting-guide.html UPLOAD_FILES.md
git commit -m "Fix routes middleware import and database config"
git push origin main

# На сервере
ssh root@[IP_СЕРВЕРА]
cd /opt/srecha/app
git pull origin main
```

## ✅ Проверка на сервере
```bash
# Подключитесь к серверу
ssh root@[IP_СЕРВЕРА]

# Перейдите в папку проекта
cd /opt/srecha/app

# Проверьте, что исправления применены
grep -n "authenticateToken: auth" routes/product-groups.js
grep -n "authenticateToken: auth" routes/invoices.js  
grep -n "authenticateToken: auth" routes/deliveries.js

# Проверьте наличие обновленного guide
ls -la troubleshooting-guide.html

# Перезапустите контейнеры (если они уже запущены)
docker compose down
docker compose up -d
```

## 🎯 Результат
После загрузки файлов ошибка `Route.get() requires a callback function` больше не должна появляться при запуске backend контейнера.

## 📞 Что дальше?
1. ✅ Файлы загружены на сервер
2. 🔄 Установите Docker (если еще не установлен)
3. 🚀 Запустите проект: `./deploy.sh`
4. 🔒 Настройте SSL: `./setup-ssl.sh`
