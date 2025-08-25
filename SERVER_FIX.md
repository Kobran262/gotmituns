# 🌐 Решение для продакшн сервера

## 🎯 ТЕКУЩАЯ СИТУАЦИЯ:
- ✅ Основная ошибка кода исправлена локально
- ❌ Исправления НЕ загружены на сервер  
- ❌ SSL сертификаты отсутствуют
- ❌ CORS настроен неправильно

## 🚀 ПОШАГОВОЕ РЕШЕНИЕ:

### ШАГ 1: Загрузите исправленные файлы на сервер

```bash
# НА ВАШЕМ КОМПЬЮТЕРЕ (замените YOUR_SERVER_IP на реальный IP):
scp routes/product-groups.js root@YOUR_SERVER_IP:/opt/srecha/app/routes/
scp routes/invoices.js root@YOUR_SERVER_IP:/opt/srecha/app/routes/  
scp routes/deliveries.js root@YOUR_SERVER_IP:/opt/srecha/app/routes/
scp troubleshooting-guide.html root@YOUR_SERVER_IP:/opt/srecha/app/
scp CURRENT_ISSUES_FIX.md root@YOUR_SERVER_IP:/opt/srecha/app/
```

### ШАГ 2: Подключитесь к серверу и проверьте файлы

```bash
# Подключение к серверу
ssh root@YOUR_SERVER_IP

# Переход в папку проекта
cd /opt/srecha/app

# Проверка что исправления загружены
grep -n "authenticateToken: auth" routes/product-groups.js
# Должно показать: 3:const { authenticateToken: auth } = require('../middleware/auth');
```

### ШАГ 3: Исправьте конфигурацию для сервера

```bash
# НА СЕРВЕРЕ: Исправьте FRONTEND_URL в env файле
sed -i 's|FRONTEND_URL=.*|FRONTEND_URL=http://localhost|' env.production

# Или замените на ваш реальный домен:
# sed -i 's|FRONTEND_URL=.*|FRONTEND_URL=https://your-domain.com|' env.production
```

### ШАГ 4: Временно отключите SSL (для быстрого решения)

```bash
# НА СЕРВЕРЕ: Создайте временную nginx конфигурацию без SSL
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
        server_name _;

        location /api/ {
            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        location /health {
            proxy_pass http://backend;
        }

        location / {
            root /usr/share/nginx/html;
            index index.html;
            try_files $uri $uri/ /index.html;
        }
    }
}
EOF
```

### ШАГ 5: Обновите Docker Compose конфигурацию

```bash
# НА СЕРВЕРЕ: Используйте временную nginx конфигурацию
sed -i 's|nginx.production.conf|nginx.temp.conf|' docker-compose.yml

# Уберите SSL volume из nginx сервиса (временно)
sed -i '/ssl:/d' docker-compose.yml
```

### ШАГ 6: Пересоберите и запустите контейнеры

```bash
# НА СЕРВЕРЕ:
docker compose down
docker compose build --no-cache backend
docker compose up -d

# Проверьте статус
docker compose ps
```

### ШАГ 7: Проверьте работу системы

```bash
# НА СЕРВЕРЕ: Проверьте backend
curl http://localhost:3000/health
# Должен ответить: {"status":"OK",...}

# Проверьте логи
docker compose logs backend | head -20
docker compose logs nginx | head -20

# Проверьте что ошибки исчезли
docker compose logs backend | grep "Route.get"
# Не должно показать ошибок!
```

## 🔒 НАСТРОЙКА SSL (после основной работы):

### Если у вас есть домен:

```bash
# НА СЕРВЕРЕ: Установите certbot
apt update && apt install -y certbot

# Получите SSL сертификат
certbot certonly --standalone -d your-domain.com --email your-email@domain.com --agree-tos

# Скопируйте сертификаты
mkdir -p /opt/srecha/ssl
cp /etc/letsencrypt/live/your-domain.com/fullchain.pem /opt/srecha/ssl/
cp /etc/letsencrypt/live/your-domain.com/privkey.pem /opt/srecha/ssl/

# Верните оригинальную nginx конфигурацию
sed -i 's|nginx.temp.conf|nginx.production.conf|' docker-compose.yml

# Перезапустите
docker compose down && docker compose up -d
```

## ✅ РЕЗУЛЬТАТ:

После выполнения этих шагов:
- ✅ Backend будет работать без ошибок
- ✅ База данных будет доступна
- ✅ API будет отвечать на HTTP запросы
- ✅ (Опционально) HTTPS с настоящими сертификатами

## 🆘 БЫСТРАЯ ДИАГНОСТИКА:

```bash
# Проверка всех сервисов
docker compose ps

# Проверка backend здоровья
curl http://localhost:3000/health

# Проверка логов на ошибки
docker compose logs | grep -i error

# Проверка что основная ошибка исчезла
docker compose logs backend | grep "Route.get" || echo "Ошибка исчезла!"
```

**Замените YOUR_SERVER_IP на реальный IP адрес вашего сервера!**

