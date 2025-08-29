#!/bin/bash

# Скрипт для решения проблемы DNS_PROBE_FINISHED_NXDOMAIN
# Настраивает веб-сервер для работы по IP адресу

echo "🔧 Исправление проблемы с доменом ltf.market"
echo "============================================="

# Проверяем права root
if [ "$EUID" -ne 0 ]; then 
    echo "❌ Пожалуйста, запустите скрипт от имени root"
    echo "Используйте: sudo bash fix_domain_issue.sh"
    exit 1
fi

# Определяем IP адрес сервера
echo "🔍 Определяем IP адрес сервера..."
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')

if [ -z "$SERVER_IP" ]; then
    echo "❌ Не удалось определить IP адрес сервера"
    exit 1
fi

echo "✅ IP адрес сервера: $SERVER_IP"

# Проверяем существование директории проекта
echo "📁 Проверяем директорию проекта..."
if [ ! -d "/srecha/gotmituns" ]; then
    echo "⚠️  Создаем директорию /srecha/gotmituns"
    mkdir -p /srecha/gotmituns
fi

if [ ! -f "/srecha/gotmituns/index.html" ]; then
    echo "⚠️  Файл index.html не найден в /srecha/gotmituns/"
    echo "   Пожалуйста, скопируйте файлы приложения в эту директорию"
    echo "   Пример: cp /путь/к/вашему/index.html /srecha/gotmituns/"
fi

# Проверяем установку Nginx
echo "🔍 Проверяем Nginx..."
if ! command -v nginx &> /dev/null; then
    echo "📦 Устанавливаем Nginx..."
    apt update
    apt install nginx -y
    systemctl enable nginx
else
    echo "✅ Nginx уже установлен"
fi

# Создаем конфигурацию для работы по IP
echo "⚙️  Создаем конфигурацию Nginx для работы по IP..."

cat > /etc/nginx/sites-available/srecha-invoice << 'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    
    # Принимаем любой домен/IP
    server_name _;
    
    # Корневая директория
    root /srecha/gotmituns;
    index index.html;
    
    # Логи
    access_log /var/log/nginx/srecha-access.log;
    error_log /var/log/nginx/srecha-error.log;
    
    # Основная локация для SPA
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # API проксирование (если используется backend)
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    
    # Статические файлы
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        add_header Access-Control-Allow-Origin "*";
    }
    
    # Безопасность
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
}
EOF

# Удаляем дефолтную конфигурацию
echo "🗑️  Удаляем дефолтную конфигурацию Nginx..."
rm -f /etc/nginx/sites-enabled/default

# Активируем нашу конфигурацию
echo "🔗 Активируем конфигурацию..."
ln -sf /etc/nginx/sites-available/srecha-invoice /etc/nginx/sites-enabled/

# Проверяем конфигурацию
echo "✅ Проверяем конфигурацию Nginx..."
if nginx -t; then
    echo "✅ Конфигурация корректна"
else
    echo "❌ Ошибка в конфигурации Nginx"
    exit 1
fi

# Устанавливаем правильные права
echo "🔧 Устанавливаем права доступа..."
chown -R www-data:www-data /srecha/gotmituns
chmod -R 755 /srecha/gotmituns

# Перезапускаем Nginx
echo "🔄 Перезапускаем Nginx..."
systemctl restart nginx

# Проверяем статус
if systemctl is-active --quiet nginx; then
    echo "✅ Nginx запущен успешно"
else
    echo "❌ Ошибка запуска Nginx"
    systemctl status nginx
    exit 1
fi

# Проверяем firewall
echo "🔍 Проверяем firewall..."
if command -v ufw &> /dev/null; then
    ufw allow 80/tcp 2>/dev/null
    ufw allow 443/tcp 2>/dev/null
    echo "✅ Порты 80 и 443 открыты"
fi

# Тестируем доступность
echo "🧪 Тестируем доступность..."
if curl -I -s http://localhost | grep -q "HTTP"; then
    echo "✅ Сервер отвечает локально"
else
    echo "⚠️  Сервер не отвечает локально"
fi

if curl -I -s http://$SERVER_IP | grep -q "HTTP"; then
    echo "✅ Сервер доступен по IP"
else
    echo "⚠️  Сервер недоступен по IP (возможно, firewall)"
fi

echo ""
echo "🎉 НАСТРОЙКА ЗАВЕРШЕНА!"
echo "======================"
echo ""
echo "🌐 Ваш сайт теперь доступен по адресу:"
echo "   http://$SERVER_IP"
echo ""
echo "📋 Что было сделано:"
echo "   ✅ Nginx настроен для работы с любым доменом/IP"
echo "   ✅ Конфигурация активирована"
echo "   ✅ Права доступа установлены"
echo "   ✅ Firewall настроен"
echo ""
echo "⚠️  Если сайт не открывается:"
echo "   1. Проверьте что файлы есть в /srecha/gotmituns/"
echo "   2. Проверьте логи: tail -f /var/log/nginx/error.log"
echo "   3. Убедитесь что firewall провайдера не блокирует порт 80"
echo ""
echo "🔧 Для настройки домена ltf.market:"
echo "   1. Зарегистрируйте домен у регистратора"
echo "   2. Добавьте A-запись: ltf.market -> $SERVER_IP"
echo "   3. Дождитесь распространения DNS (до 48 часов)"
echo "   4. Обновите server_name в /etc/nginx/sites-available/srecha-invoice"
echo ""

# Показываем следующие шаги
echo "📝 Полезные команды:"
echo "   # Проверка логов Nginx:"
echo "   tail -f /var/log/nginx/error.log"
echo ""
echo "   # Перезапуск Nginx:"
echo "   systemctl reload nginx"
echo ""
echo "   # Проверка конфигурации:"
echo "   nginx -t"
echo ""
echo "   # Проверка статуса:"
echo "   systemctl status nginx"
echo ""
