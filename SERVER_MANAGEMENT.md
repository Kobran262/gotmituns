# Быстрая справка по управлению сервером

## 🚀 Основные команды

### Управление приложением
```bash
# Статус сервиса
sudo systemctl status srecha-invoice

# Запуск/остановка/перезапуск
sudo systemctl start srecha-invoice
sudo systemctl stop srecha-invoice
sudo systemctl restart srecha-invoice

# Логи в реальном времени
sudo journalctl -u srecha-invoice -f

# Последние 50 строк логов
sudo journalctl -u srecha-invoice -n 50
```

### Управление Nginx
```bash
# Статус
sudo systemctl status nginx

# Перезагрузка конфигурации без перезапуска
sudo systemctl reload nginx

# Проверка конфигурации
sudo nginx -t

# Перезапуск
sudo systemctl restart nginx
```

### Управление PostgreSQL
```bash
# Статус
sudo systemctl status postgresql

# Подключение к БД
sudo -u postgres psql srecha_invoice

# Перезапуск
sudo systemctl restart postgresql
```

## 🔧 Обслуживание

### Резервное копирование
```bash
# Ручной запуск резервного копирования
sudo /opt/srecha/backup.sh

# Просмотр резервных копий
ls -la /opt/srecha/backups/
```

### Обновление приложения
```bash
cd /opt/srecha/app
sudo systemctl stop srecha-invoice
sudo git pull origin main
sudo -u srecha npm install --production
sudo -u srecha npm run migrate
sudo systemctl start srecha-invoice
```

### SSL сертификаты
```bash
# Обновление Let's Encrypt сертификатов
sudo /opt/srecha/renew-ssl.sh

# Проверка сертификата
openssl x509 -in /opt/srecha/ssl/fullchain.pem -text -noout
```

## 🔍 Мониторинг

### Проверка работоспособности
```bash
# API health check
curl http://localhost:3000/health
curl https://your-domain.com/health

# Проверка портов
sudo netstat -tlnp | grep -E ":80|:443|:3000|:5432"

# Статус всех сервисов
sudo systemctl status srecha-invoice nginx postgresql
```

### Использование ресурсов
```bash
# Дисковое пространство
df -h
du -sh /opt/srecha/*

# Процессы
ps aux | grep -E "node|nginx|postgres"

# Память и CPU
top
htop  # если установлен
```

### Логи
```bash
# Логи приложения
sudo journalctl -u srecha-invoice -f

# Логи Nginx
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log

# Логи PostgreSQL
sudo tail -f /var/log/postgresql/*.log
```

## 🛡️ Безопасность

### Firewall
```bash
# Статус firewall
sudo ufw status

# Просмотр правил
sudo ufw status numbered
```

### Обновления системы
```bash
# Обновление пакетов
sudo apt update && sudo apt upgrade

# Только обновления безопасности
sudo apt update && sudo apt upgrade -s | grep -i security
```

## 🚨 Аварийное восстановление

### Если приложение не отвечает
```bash
# 1. Проверить статус
sudo systemctl status srecha-invoice

# 2. Перезапустить
sudo systemctl restart srecha-invoice

# 3. Проверить логи
sudo journalctl -u srecha-invoice -n 50

# 4. Проверить БД
sudo -u postgres psql -c "SELECT version();"
```

### Если сайт недоступен
```bash
# 1. Проверить Nginx
sudo nginx -t
sudo systemctl status nginx

# 2. Проверить SSL
openssl x509 -in /opt/srecha/ssl/fullchain.pem -checkend 86400

# 3. Перезапустить Nginx
sudo systemctl restart nginx
```

### Если закончилось место на диске
```bash
# 1. Проверить использование
df -h
du -sh /opt/srecha/*

# 2. Очистить старые логи
sudo journalctl --vacuum-time=7d

# 3. Удалить старые бэкапы
find /opt/srecha/backups -name "*.tar.gz" -mtime +30 -delete

# 4. Очистить логи Nginx (если нужно)
sudo truncate -s 0 /var/log/nginx/*.log
```

## 📞 Контакты поддержки

При возникновении проблем соберите следующую информацию:

```bash
# Диагностическая информация
echo "=== Статус сервисов ===" > /tmp/diagnostic.txt
sudo systemctl status srecha-invoice nginx postgresql >> /tmp/diagnostic.txt

echo "=== Логи приложения ===" >> /tmp/diagnostic.txt
sudo journalctl -u srecha-invoice --since "1 hour ago" >> /tmp/diagnostic.txt

echo "=== Использование диска ===" >> /tmp/diagnostic.txt
df -h >> /tmp/diagnostic.txt

echo "=== Процессы ===" >> /tmp/diagnostic.txt
ps aux | grep -E "node|nginx|postgres" >> /tmp/diagnostic.txt

# Отправить файл /tmp/diagnostic.txt в поддержку
```

## 📝 Важные файлы и директории

```
/opt/srecha/app/.env              # Конфигурация приложения
/etc/nginx/nginx.conf             # Конфигурация Nginx
/etc/systemd/system/srecha-invoice.service  # Systemd сервис
/opt/srecha/ssl/                  # SSL сертификаты
/opt/srecha/backups/              # Резервные копии
/opt/srecha/logs/                 # Логи приложения
/opt/srecha/uploads/              # Загруженные файлы
```
