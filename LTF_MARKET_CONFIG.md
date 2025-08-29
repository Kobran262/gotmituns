# 🌐 Конфигурация для ltf.market

## Обновленные настройки

Гайд по развертыванию обновлен с конкретными данными для вашего проекта.

## 📋 Конкретные параметры

- **Домен:** `ltf.market` (с поддержкой www.ltf.market)
- **Путь проекта:** `/srecha/gotmituns/`
- **Веб-сервер:** Nginx или Apache (на выбор)

## 🔧 Готовые конфигурации

### Nginx конфигурация:
```nginx
server {
    listen 80;
    server_name ltf.market www.ltf.market;
    
    root /srecha/gotmituns;
    index index.html;

    # Логи
    access_log /var/log/nginx/srecha-access.log;
    error_log /var/log/nginx/srecha-error.log;

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

    # Оптимизация для статических файлов
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Безопасность
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
}
```

### Apache конфигурация:
```apache
<VirtualHost *:80>
    ServerName ltf.market
    ServerAlias www.ltf.market
    DocumentRoot /srecha/gotmituns
    
    # Логи
    ErrorLog ${APACHE_LOG_DIR}/srecha-error.log
    CustomLog ${APACHE_LOG_DIR}/srecha-access.log combined

    # Директива для SPA
    <Directory /srecha/gotmituns>
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
        
        # Fallback для SPA
        RewriteEngine On
        RewriteBase /
        RewriteRule ^index\.html$ - [L]
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteRule . /index.html [L]
    </Directory>

    # Проксирование API (если используется)
    ProxyPreserveHost On
    ProxyPass /api/ http://localhost:3000/
    ProxyPassReverse /api/ http://localhost:3000/
</VirtualHost>
```

## 📁 Подготовка файлов

### Создание директории и копирование файлов:
```bash
# Создаем директорию
mkdir -p /srecha/gotmituns

# Копируем файлы (выберите подходящий способ):

# Способ 1: Через SCP с локального компьютера
scp index.html root@your-server-ip:/srecha/gotmituns/
scp -r static/* root@your-server-ip:/srecha/gotmituns/

# Способ 2: Через Git (если проект в репозитории)
cd /srecha/
git clone https://github.com/your-repo/gotmituns.git

# Способ 3: Загрузка через wget/curl (если файлы доступны по URL)
cd /srecha/gotmituns/
wget https://example.com/path/to/index.html

# Установка прав доступа
chown -R www-data:www-data /srecha/gotmituns
chmod -R 755 /srecha/gotmituns
```

## 🔍 Проверка DNS и доступности

### DNS проверка:
```bash
# Проверка A-записи
nslookup ltf.market
dig ltf.market A

# Результат должен показать IP вашего сервера
```

### Тестирование доступности:
```bash
# Проверка HTTP ответа
curl -I http://ltf.market
curl -I http://www.ltf.market

# Проверка содержимого
curl http://ltf.market
```

## 🛠️ Пошаговая настройка

### Для Nginx:
```bash
# 1. Создать конфигурацию
cat > /etc/nginx/sites-available/srecha-invoice << 'EOF'
# ... (конфигурация выше)
EOF

# 2. Активировать конфигурацию
ln -s /etc/nginx/sites-available/srecha-invoice /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# 3. Проверить и перезапустить
nginx -t
systemctl reload nginx
```

### Для Apache:
```bash
# 1. Создать конфигурацию
cat > /etc/apache2/sites-available/srecha-invoice.conf << 'EOF'
# ... (конфигурация выше)
EOF

# 2. Активировать конфигурацию
a2dissite 000-default
a2ensite srecha-invoice

# 3. Проверить и перезапустить
apache2ctl configtest
systemctl reload apache2
```

## ✅ Финальная проверка

После настройки откройте в браузере:
- http://ltf.market
- http://www.ltf.market

Вы должны увидеть интерфейс Srecha Invoice System.

## 📋 Checklist

- [ ] DNS записи ltf.market указывают на ваш сервер
- [ ] Директория `/srecha/gotmituns/` создана
- [ ] Файлы приложения скопированы в `/srecha/gotmituns/`
- [ ] Права доступа установлены (755, владелец www-data)
- [ ] Веб-сервер настроен (Nginx или Apache)
- [ ] Конфигурация активирована
- [ ] Веб-сервер перезапущен
- [ ] Тестирование через curl успешно
- [ ] Сайт доступен в браузере

## 🚨 Если что-то не работает

### Проверьте логи:
```bash
# Nginx логи
tail -f /var/log/nginx/error.log
tail -f /var/log/nginx/srecha-error.log

# Apache логи
tail -f /var/log/apache2/error.log
tail -f /var/log/apache2/srecha-error.log
```

### Частые проблемы:
1. **404 Not Found** → Проверьте путь `/srecha/gotmituns/` и наличие index.html
2. **403 Forbidden** → Проверьте права доступа (chmod 755)
3. **DNS не резолвится** → Проверьте A-запись у регистратора домена
4. **502 Bad Gateway** → Проверьте backend приложение (если используется)

---

**Обновлено:** deployment-guide-interactive.html  
**Домен:** ltf.market  
**Путь:** /srecha/gotmituns  
**Статус:** ✅ Готово к развертыванию
