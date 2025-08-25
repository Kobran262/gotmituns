# ⚡ Быстрые команды для сервера

## 🔥 ЭКСТРЕННЫЕ КОМАНДЫ (выполните по порядку):

### 1. Загрузите файлы на сервер (с вашего компьютера):
```bash
# ЗАМЕНИТЕ YOUR_SERVER_IP НА РЕАЛЬНЫЙ IP!
SERVER_IP="203.0.113.1"  # ЗАМЕНИТЕ НА ВАШ IP!

scp routes/product-groups.js root@$SERVER_IP:/opt/srecha/app/routes/
scp routes/invoices.js root@$SERVER_IP:/opt/srecha/app/routes/
scp routes/deliveries.js root@$SERVER_IP:/opt/srecha/app/routes/
```

### 2. Подключитесь к серверу:
```bash
ssh root@$SERVER_IP  # ЗАМЕНИТЕ IP!
```

### 3. На сервере выполните (скопируйте весь блок):
```bash
cd /opt/srecha/app

# Проверьте что файлы загружены
grep -n "authenticateToken: auth" routes/product-groups.js

# Исправьте FRONTEND_URL
sed -i 's|FRONTEND_URL=.*|FRONTEND_URL=http://localhost|' env.production

# Создайте простую nginx конфигурацию без SSL
cat > nginx.simple.conf << 'EOF'
events {
    worker_connections 1024;
}
http {
    upstream backend {
        server backend:3000;
    }
    server {
        listen 80;
        server_name _;
        location /api/ {
            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }
        location /health {
            proxy_pass http://backend;
        }
        location / {
            root /usr/share/nginx/html;
            index index.html;
        }
    }
}
EOF

# Обновите docker-compose для использования простой конфигурации
sed -i 's|nginx.production.conf|nginx.simple.conf|' docker-compose.yml

# Пересоберите контейнеры
docker compose down
docker compose build --no-cache backend
docker compose up -d

# Проверьте результат
echo "=== СТАТУС КОНТЕЙНЕРОВ ==="
docker compose ps

echo "=== ПРОВЕРКА BACKEND ==="
sleep 10
curl -s http://localhost:3000/health || echo "Backend еще запускается..."

echo "=== ПРОВЕРКА ИСЧЕЗЛА ЛИ ОШИБКА ==="
docker compose logs backend | grep "Route.get" || echo "✅ Ошибка Route.get() исчезла!"
```

## 🎯 ОЖИДАЕМЫЙ РЕЗУЛЬТАТ:

После выполнения команд вы должны увидеть:
```
✅ Ошибка Route.get() исчезла!
{"status":"OK","timestamp":"...","environment":"production"}
```

## 🆘 ЕСЛИ ЧТО-ТО НЕ РАБОТАЕТ:

```bash
# Посмотрите детальные логи
docker compose logs backend
docker compose logs nginx

# Проверьте что процессы запущены
docker compose ps

# Перезапустите проблемный контейнер
docker compose restart backend
```

**ВАЖНО: Замените 203.0.113.1 на реальный IP вашего сервера!**

