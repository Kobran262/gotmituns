# 🎯 Команды для вашего сервера lft.market

## 📋 ВАШИ ДАННЫЕ:
- **IP:** 185.119.90.54
- **Домен:** lft.market

## 🚀 ВЫПОЛНИТЕ ПО ПОРЯДКУ:

### ШАГ 1: Загрузите исправленные файлы (с вашего Mac):

```bash
# Загрузите исправленные routes файлы
scp routes/product-groups.js root@185.119.90.54:/opt/srecha/app/routes/
scp routes/invoices.js root@185.119.90.54:/opt/srecha/app/routes/
scp routes/deliveries.js root@185.119.90.54:/opt/srecha/app/routes/

# Загрузите инструкции
scp SERVER_FIX.md root@185.119.90.54:/opt/srecha/app/
scp CURRENT_ISSUES_FIX.md root@185.119.90.54:/opt/srecha/app/
```

### ШАГ 2: Подключитесь к серверу:

```bash
ssh root@185.119.90.54
```

### ШАГ 3: На сервере выполните все команды (скопируйте весь блок):

```bash
cd /opt/srecha/app

echo "=== ПРОВЕРКА ЗАГРУЖЕННЫХ ФАЙЛОВ ==="
grep -n "authenticateToken: auth" routes/product-groups.js
echo "Должно показать строку 3 с правильным импортом"

echo "=== ИСПРАВЛЕНИЕ КОНФИГУРАЦИИ ==="
# Исправляем FRONTEND_URL для вашего домена
sed -i 's|FRONTEND_URL=.*|FRONTEND_URL=https://lft.market|' env.production

# Исправляем домен и email
sed -i 's|DOMAIN=.*|DOMAIN=lft.market|' env.production
sed -i 's|EMAIL=.*|EMAIL=admin@lft.market|' env.production

echo "=== СОЗДАНИЕ ВРЕМЕННОЙ NGINX КОНФИГУРАЦИИ БЕЗ SSL ==="
cat > nginx.temp.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    upstream backend {
        server backend:3000;
    }

    server {
        listen 80;
        server_name lft.market www.lft.market;

        # Redirect HTTP to HTTPS (временно отключено)
        # return 301 https://$host$request_uri;

        location /api/ {
            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        location /health {
            proxy_pass http://backend;
            proxy_set_header Host $host;
        }

        location / {
            root /usr/share/nginx/html;
            index index.html;
            try_files $uri $uri/ /index.html;
        }
    }
}
EOF

echo "=== ОБНОВЛЕНИЕ DOCKER-COMPOSE ==="
# Используем временную конфигурацию nginx
sed -i 's|nginx.production.conf|nginx.temp.conf|' docker-compose.yml

# Временно убираем SSL volume
sed -i '/ssl:/d' docker-compose.yml

echo "=== ПЕРЕСБОРКА И ЗАПУСК КОНТЕЙНЕРОВ ==="
docker compose down
docker compose build --no-cache backend
docker compose up -d

echo "=== ОЖИДАНИЕ ЗАПУСКА (30 секунд) ==="
sleep 30

echo "=== ПРОВЕРКА РЕЗУЛЬТАТОВ ==="
echo "Статус контейнеров:"
docker compose ps

echo ""
echo "Проверка backend health:"
curl -s http://localhost:3000/health || echo "Backend еще запускается..."

echo ""
echo "Проверка исчезла ли основная ошибка:"
docker compose logs backend | grep "Route.get" && echo "❌ Ошибка все еще есть!" || echo "✅ Ошибка Route.get() исчезла!"

echo ""
echo "Проверка через внешний IP:"
curl -s http://185.119.90.54/health || echo "Nginx еще настраивается..."

echo ""
echo "=== ЛОГИ ДЛЯ ДИАГНОСТИКИ ==="
echo "Backend логи (последние 10 строк):"
docker compose logs backend | tail -10

echo ""
echo "Nginx логи (последние 5 строк):"
docker compose logs nginx | tail -5
```

### ШАГ 4: Проверьте работу системы:

```bash
# На сервере проверьте:
curl http://lft.market/health
curl http://lft.market/api/

# С вашего компьютера проверьте:
curl http://lft.market/health
```

## 🔒 НАСТРОЙКА SSL (после того как основное заработает):

```bash
# НА СЕРВЕРЕ: После успешного запуска настройте SSL
apt update && apt install -y certbot

# Остановите nginx для получения сертификата
docker compose stop nginx

# Получите SSL сертификат
certbot certonly --standalone \
  -d lft.market \
  -d www.lft.market \
  --email admin@lft.market \
  --agree-tos \
  --non-interactive

# Скопируйте сертификаты
mkdir -p /opt/srecha/ssl
cp /etc/letsencrypt/live/lft.market/fullchain.pem /opt/srecha/ssl/
cp /etc/letsencrypt/live/lft.market/privkey.pem /opt/srecha/ssl/
chown -R root:root /opt/srecha/ssl
chmod 644 /opt/srecha/ssl/fullchain.pem
chmod 600 /opt/srecha/ssl/privkey.pem

# Верните оригинальную nginx конфигурацию
sed -i 's|nginx.temp.conf|nginx.production.conf|' docker-compose.yml

# Верните SSL volume
sed -i '/volumes:/a\      - ./ssl:/etc/nginx/ssl:ro' docker-compose.yml

# Перезапустите с SSL
docker compose up -d

# Проверьте HTTPS
curl https://lft.market/health
```

## ✅ ОЖИДАЕМЫЙ РЕЗУЛЬТАТ:

После выполнения команд:
- ✅ `Route.get() requires a callback function` исчезнет
- ✅ Backend ответит на `http://lft.market/health`
- ✅ API будет доступно на `http://lft.market/api/`
- ✅ (После SSL) HTTPS будет работать

## 🆘 ЕСЛИ ПРОБЛЕМЫ:

```bash
# Детальная диагностика
docker compose logs
docker compose ps
systemctl status docker
```

**Все готово! Выполняйте команды по порядку.** 🚀

