# Инструкции по развертыванию Srecha Invoice System (БЕЗ Docker)

## 📋 Обзор

Эта система развертывается непосредственно на сервере без использования Docker. Все компоненты (Node.js, PostgreSQL, Nginx) устанавливаются и настраиваются как системные сервисы.

## 🔧 Системные требования

### Минимальные требования:
- **ОС**: Ubuntu 20.04 LTS / Debian 11+ 
- **CPU**: 1 ядро, 2 ГГц
- **RAM**: 2 ГБ
- **Диск**: 20 ГБ свободного места
- **Сеть**: статический IP-адрес

### Рекомендуемые требования:
- **ОС**: Ubuntu 22.04 LTS
- **CPU**: 2 ядра, 2.4 ГГц
- **RAM**: 4 ГБ
- **Диск**: 50 ГБ SSD
- **Сеть**: статический IP + настроенный домен

## 🚀 Автоматическое развертывание

### Быстрый старт (рекомендуется)

1. **Подготовка сервера**
   ```bash
   # Подключение к серверу
   ssh root@your-server-ip
   
   # Клонирование репозитория
   git clone https://github.com/your-repo/srecha-invoice.git
   cd srecha-invoice
   ```

2. **Запуск автоматической установки**
   ```bash
   sudo ./deploy-without-docker.sh
   ```

   Скрипт автоматически:
   - Обновит систему
   - Установит Node.js 18.x
   - Установит PostgreSQL
   - Установит Nginx
   - Создаст пользователя системы
   - Настроит базу данных
   - Установит зависимости
   - Настроит SSL (самоподписанные сертификаты)
   - Настроит автозапуск
   - Настроит резервное копирование

3. **После установки**
   - Система будет доступна по адресу: `https://your-domain.com`
   - Самоподписанные SSL сертификаты будут предупреждать о безопасности
   - Используйте `setup-ssl.sh` для получения настоящих Let's Encrypt сертификатов

## 🔐 Настройка SSL сертификатов

### Получение Let's Encrypt сертификатов

```bash
sudo ./setup-ssl.sh
```

Введите:
- Ваш домен (example.com)
- Ваш email для уведомлений

Скрипт автоматически:
- Остановит Nginx
- Получит сертификат от Let's Encrypt
- Установит сертификаты
- Настроит автообновление
- Запустит Nginx

## 📁 Структура директорий

```
/opt/srecha/
├── app/                 # Код приложения
│   ├── server.js       # Главный файл сервера
│   ├── routes/         # API маршруты
│   ├── middleware/     # Middleware функции
│   ├── config/         # Конфигурация
│   ├── migrations/     # Миграции БД
│   ├── .env           # Переменные окружения
│   └── node_modules/   # Зависимости
├── uploads/            # Загруженные файлы
├── logs/              # Логи приложения
├── ssl/               # SSL сертификаты
├── backups/           # Резервные копии
├── web/               # Статические файлы
└── backup.sh          # Скрипт резервного копирования
```

## ⚙️ Конфигурация

### Основные настройки

Файл: `/opt/srecha/app/.env`

```bash
# Основные настройки
NODE_ENV=production
PORT=3000

# База данных
DB_HOST=localhost
DB_PORT=5432
DB_NAME=srecha_invoice
DB_USER=srecha
DB_PASSWORD=ваш_пароль_бд

# Безопасность
JWT_SECRET=ваш_jwt_секрет

# Сеть
FRONTEND_URL=https://ваш-домен.com

# Пути
UPLOADS_DIR=/opt/srecha/uploads
LOGS_DIR=/opt/srecha/logs
SSL_CERT_PATH=/opt/srecha/ssl/fullchain.pem
SSL_KEY_PATH=/opt/srecha/ssl/privkey.pem
```

### Nginx конфигурация

Файл: `/etc/nginx/nginx.conf`

Основные особенности:
- SSL/TLS настройки
- Проксирование к Node.js приложению
- Статическая раздача файлов
- Rate limiting
- Безопасность заголовки

### PostgreSQL конфигурация

- Пользователь: `srecha`
- База данных: `srecha_invoice`
- Порт: `5432` (localhost only)

## 🔄 Управление сервисами

### Основное приложение

```bash
# Статус сервиса
sudo systemctl status srecha-invoice

# Запуск
sudo systemctl start srecha-invoice

# Остановка
sudo systemctl stop srecha-invoice

# Перезапуск
sudo systemctl restart srecha-invoice

# Логи
sudo journalctl -u srecha-invoice -f

# Включить автозапуск
sudo systemctl enable srecha-invoice

# Отключить автозапуск
sudo systemctl disable srecha-invoice
```

### Nginx

```bash
# Статус
sudo systemctl status nginx

# Перезагрузка конфигурации
sudo systemctl reload nginx

# Перезапуск
sudo systemctl restart nginx

# Проверка конфигурации
sudo nginx -t
```

### PostgreSQL

```bash
# Статус
sudo systemctl status postgresql

# Перезапуск
sudo systemctl restart postgresql

# Подключение к БД
sudo -u postgres psql srecha_invoice
```

## 🗄️ Управление базой данных

### Миграции

```bash
cd /opt/srecha/app
sudo -u srecha npm run migrate
```

### Заполнение тестовыми данными

```bash
cd /opt/srecha/app
sudo -u srecha npm run seed
```

### Ручное подключение к БД

```bash
sudo -u postgres psql srecha_invoice
```

### Создание дампа БД

```bash
sudo -u postgres pg_dump srecha_invoice > backup.sql
```

### Восстановление из дампа

```bash
sudo -u postgres psql srecha_invoice < backup.sql
```

## 💾 Резервное копирование

### Автоматическое резервное копирование

Настроено через cron (ежедневно в 2:00):

```bash
# Проверка cron задач
sudo crontab -l

# Ручной запуск
sudo /opt/srecha/backup.sh
```

### Что включается в резервную копию:
- Дамп базы данных
- Загруженные файлы (`/opt/srecha/uploads`)
- Конфигурация (`.env`)
- SSL сертификаты

### Восстановление из резервной копии:

```bash
# Распаковка архива
cd /opt/srecha/backups
tar -xzf srecha_backup_YYYYMMDD_HHMMSS.tar.gz

# Остановка сервиса
sudo systemctl stop srecha-invoice

# Восстановление файлов
sudo cp -r opt/srecha/uploads/* /opt/srecha/uploads/
sudo cp opt/srecha/app/.env /opt/srecha/app/

# Восстановление БД
sudo -u postgres dropdb srecha_invoice
sudo -u postgres createdb srecha_invoice -O srecha
sudo -u postgres psql srecha_invoice < database_YYYYMMDD_HHMMSS.sql

# Запуск сервиса
sudo systemctl start srecha-invoice
```

## 🔧 Обслуживание

### Обновление приложения

```bash
# Переход в директорию приложения
cd /opt/srecha/app

# Остановка сервиса
sudo systemctl stop srecha-invoice

# Резервная копия (на всякий случай)
sudo /opt/srecha/backup.sh

# Получение обновлений
sudo git pull origin main

# Установка зависимостей
sudo -u srecha npm install --production

# Выполнение миграций
sudo -u srecha npm run migrate

# Запуск сервиса
sudo systemctl start srecha-invoice

# Проверка статуса
sudo systemctl status srecha-invoice
```

### Просмотр логов

```bash
# Логи приложения (systemd)
sudo journalctl -u srecha-invoice -f

# Логи Nginx
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log

# Логи PostgreSQL
sudo tail -f /var/log/postgresql/postgresql-*.log
```

### Мониторинг производительности

```bash
# Использование ресурсов приложением
sudo systemd-cgtop

# Статистика PostgreSQL
sudo -u postgres psql -c "SELECT * FROM pg_stat_activity;"

# Использование дискового пространства
df -h
du -sh /opt/srecha/*
```

## 🛡️ Безопасность

### Firewall (UFW)

```bash
# Проверка статуса
sudo ufw status

# Разрешенные порты:
# - 22 (SSH)
# - 80 (HTTP) 
# - 443 (HTTPS)
```

### SSL/TLS

```bash
# Проверка сертификата
openssl x509 -in /opt/srecha/ssl/fullchain.pem -text -noout

# Проверка SSL конфигурации
sudo nginx -t

# Тест SSL
curl -I https://ваш-домен.com
```

### Обновления безопасности

```bash
# Автоматические обновления безопасности
sudo apt install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

## 🔍 Устранение неполадок

### Приложение не запускается

```bash
# Проверка логов
sudo journalctl -u srecha-invoice -n 50

# Проверка переменных окружения
sudo -u srecha env | grep -E "(NODE_ENV|DB_|PORT)"

# Проверка подключения к БД
sudo -u srecha psql -h localhost -U srecha -d srecha_invoice
```

### Nginx не работает

```bash
# Проверка конфигурации
sudo nginx -t

# Проверка логов
sudo tail -f /var/log/nginx/error.log

# Проверка портов
sudo netstat -tlnp | grep :443
```

### PostgreSQL недоступен

```bash
# Проверка статуса
sudo systemctl status postgresql

# Проверка логов
sudo tail -f /var/log/postgresql/*.log

# Проверка подключений
sudo -u postgres psql -c "SELECT * FROM pg_stat_activity;"
```

### Проблемы с SSL

```bash
# Проверка сертификатов
ls -la /opt/srecha/ssl/

# Проверка прав доступа
sudo chown -R srecha:srecha /opt/srecha/ssl
sudo chmod 600 /opt/srecha/ssl/privkey.pem
sudo chmod 644 /opt/srecha/ssl/fullchain.pem

# Обновление сертификатов Let's Encrypt
sudo /opt/srecha/renew-ssl.sh
```

## 📞 Поддержка

### Полезные команды для диагностики

```bash
# Общий статус системы
sudo systemctl status srecha-invoice nginx postgresql

# Проверка доступности
curl -I http://localhost:3000/health
curl -I https://ваш-домен.com/health

# Проверка портов
sudo netstat -tlnp | grep -E ":80|:443|:3000|:5432"

# Проверка процессов
ps aux | grep -E "node|nginx|postgres"

# Использование дискового пространства
df -h
du -sh /opt/srecha/*
```

### Сбор информации для поддержки

```bash
# Создание диагностического отчета
sudo journalctl -u srecha-invoice --since "1 hour ago" > /tmp/app.log
sudo tail -n 100 /var/log/nginx/error.log > /tmp/nginx.log
sudo systemctl status srecha-invoice nginx postgresql > /tmp/services.log
```

---

## 📚 Дополнительные материалы

- [Документация Node.js](https://nodejs.org/docs/)
- [Документация PostgreSQL](https://www.postgresql.org/docs/)
- [Документация Nginx](https://nginx.org/en/docs/)
- [Let's Encrypt](https://letsencrypt.org/docs/)

---

**Важно**: После развертывания обязательно:
1. Смените все пароли по умолчанию в `/opt/srecha/app/.env`
2. Настройте мониторинг и уведомления
3. Протестируйте процедуры резервного копирования и восстановления
4. Настройте автоматические обновления безопасности
