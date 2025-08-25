# 🚀 Srecha Invoice System - Production (БЕЗ Docker)

Система управления счетами и накладными для производственных компаний.
**Развертывание без Docker** - все компоненты устанавливаются как системные сервисы.

## 📋 Быстрый старт

### 1. Автоматическое развертывание
```bash
chmod +x deploy-without-docker.sh
sudo ./deploy-without-docker.sh
```

### 2. Настройка SSL
```bash
chmod +x setup-ssl.sh
sudo ./setup-ssl.sh
```

### 3. Доступ к системе
Откройте в браузере: `https://ваш-домен.com`

## 📖 Подробная инструкция

Смотрите файл `DEPLOYMENT_INSTRUCTIONS.md` для детального руководства по развертыванию и управлению.

## 🗂️ Структура файлов

```
├── index.html                      # Основное приложение (SPA)
├── deploy-without-docker.sh        # Скрипт автоматического развертывания (БЕЗ Docker)
├── setup-ssl.sh                    # Настройка SSL сертификатов
├── nginx.conf                      # Конфигурация Nginx для системной установки
├── srecha-invoice.service          # Systemd сервис
├── env.production                  # Шаблон переменных окружения
├── DEPLOYMENT_INSTRUCTIONS.md      # Полная инструкция по развертыванию
├── SERVER_MANAGEMENT.md            # Быстрая справка по управлению
└── server.js                       # Node.js сервер приложения
```

## 🏗️ Архитектура системы

**Компоненты:**
- **Node.js 18.x** - Backend API сервер
- **PostgreSQL** - База данных
- **Nginx** - Reverse proxy и статический контент
- **Systemd** - Управление сервисами
- **Let's Encrypt** - SSL сертификаты

**Без Docker контейнеров** - все работает как нативные системные сервисы.

## 🔧 Управление

### Статус системы
```bash
sudo systemctl status srecha-invoice nginx postgresql
```

### Просмотр логов
```bash
sudo journalctl -u srecha-invoice -f
```

### Перезапуск
```bash
sudo systemctl restart srecha-invoice
```

### Резервная копия
```bash
sudo /opt/srecha/backup.sh
```

## 📁 Важные директории

- `/opt/srecha/app/` - Код приложения
- `/opt/srecha/uploads/` - Загруженные файлы
- `/opt/srecha/logs/` - Логи системы
- `/opt/srecha/ssl/` - SSL сертификаты
- `/opt/srecha/backups/` - Резервные копии
- `/opt/srecha/web/` - Статические файлы

## 🆘 Поддержка

1. Проверьте логи: `sudo journalctl -u srecha-invoice -n 50`
2. Перезапустите систему: `sudo systemctl restart srecha-invoice`
3. Создайте резервную копию: `sudo /opt/srecha/backup.sh`
4. Проверьте статус: `curl http://localhost:3000/health`

Для детальной диагностики см. `SERVER_MANAGEMENT.md`

## 🔒 Безопасность

- Все пароли генерируются автоматически
- SSL сертификаты обновляются автоматически
- Firewall настроен автоматически (UFW)
- Резервные копии создаются ежедневно
- Приложение работает под ограниченным пользователем `srecha`
- Systemd security features включены

## ⚡ Производительность

- Прямой доступ к ресурсам системы (без Docker overhead)
- PostgreSQL connection pooling
- Nginx кэширование и сжатие
- Systemd resource limits
- PM2 альтернатива для production (опционально)

## 🔄 Миграция с Docker

Если у вас была Docker версия:
1. Сделайте бэкап данных
2. Остановите Docker контейнеры
3. Запустите `deploy-without-docker.sh`
4. Восстановите данные из бэкапа
