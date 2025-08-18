# 🚀 Srecha Invoice System - Production

Система управления счетами и накладными для производственных компаний.

## 📋 Быстрый старт

### 1. Автоматическое развертывание
```bash
chmod +x deploy.sh
sudo ./deploy.sh
```

### 2. Настройка SSL
```bash
chmod +x setup-ssl.sh
sudo ./setup-ssl.sh
```

### 3. Доступ к системе
Откройте в браузере: `https://ваш-домен.com`

## 📖 Подробная инструкция

Откройте файл `deployment-guide.html` в браузере для интерактивного руководства.

## 🗂️ Структура файлов

```
├── index.html                      # Основное приложение (SPA)
├── deploy.sh                       # Скрипт автоматического развертывания
├── setup-ssl.sh                    # Настройка SSL сертификатов
├── docker-compose.production.yml   # Docker Compose для production
├── Dockerfile.production           # Docker образ для backendKSDLAKM




├── nginx.production.conf           # Конфигурация Nginx
├── env.production                  # Шаблон переменных окружения
└── deployment-guide.html           # Интерактивная инструкция
```

## 🔧 Управление

### Статус системы
```bash
cd /opt/srecha/app
docker-compose -f docker-compose.production.yml ps
```

### Просмотр логов
```bash
docker-compose -f docker-compose.production.yml logs -f
```

### Перезапуск
```bash
systemctl restart srecha-invoice
```

### Резервная копия
```bash
/opt/srecha/backup.sh
```

## 📁 Важные директории

- `/opt/srecha/app/` - Код приложения
- `/opt/srecha/data/` - Данные базы и файлы
- `/opt/srecha/logs/` - Логи системы
- `/opt/srecha/ssl/` - SSL сертификаты
- `/opt/srecha/backups/` - Резервные копии

## 🆘 Поддержка

1. Проверьте логи: `docker-compose logs`
2. Перезапустите систему: `systemctl restart srecha-invoice`
3. Создайте резервную копию: `/opt/srecha/backup.sh`

## 🔒 Безопасность

- Все пароли генерируются автоматически
- SSL сертификаты обновляются автоматически
- Firewall настроен автоматически
- Резервные копии создаются ежедневно
