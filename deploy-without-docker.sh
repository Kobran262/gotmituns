#!/bin/bash

# Скрипт автоматического развертывания Srecha Invoice System
# БЕЗ Docker - для Debian/Ubuntu серверов

set -e  # Выход при любой ошибке

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Функция для логирования
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}"
    exit 1
}

info() {
    echo -e "${BLUE}[INFO] $1${NC}"
}

# Проверка прав root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        error "Этот скрипт должен запускаться с правами root. Используйте: sudo $0"
    fi
}

# Проверка операционной системы
check_os() {
    if [[ ! -f /etc/debian_version ]]; then
        error "Этот скрипт предназначен для Debian/Ubuntu систем"
    fi
    log "Операционная система: $(lsb_release -d | cut -f2)"
}

# Установка Node.js
install_nodejs() {
    log "Установка Node.js..."
    
    # Добавление репозитория NodeSource
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    
    # Установка Node.js
    apt-get install -y nodejs
    
    # Установка PM2 глобально
    npm install -g pm2
    
    log "Node.js установлен: $(node --version)"
    log "npm установлен: $(npm --version)"
    log "PM2 установлен: $(pm2 --version)"
}

# Установка PostgreSQL
install_postgresql() {
    log "Установка PostgreSQL..."
    
    # Установка PostgreSQL
    apt-get install -y postgresql postgresql-contrib postgresql-client
    
    # Запуск и автозапуск PostgreSQL
    systemctl start postgresql
    systemctl enable postgresql
    
    log "PostgreSQL установлен: $(sudo -u postgres psql --version)"
}

# Установка Nginx
install_nginx() {
    log "Установка Nginx..."
    
    apt-get install -y nginx
    
    # Запуск и автозапуск Nginx
    systemctl start nginx
    systemctl enable nginx
    
    log "Nginx установлен: $(nginx -v 2>&1)"
}

# Создание пользователя для приложения
create_app_user() {
    log "Создание пользователя приложения..."
    
    if ! id "srecha" &>/dev/null; then
        useradd -r -s /bin/bash -d /opt/srecha -m srecha
        log "Пользователь 'srecha' создан"
    else
        warn "Пользователь 'srecha' уже существует"
    fi
}

# Создание директорий
create_directories() {
    log "Создание необходимых директорий..."
    
    mkdir -p /opt/srecha/{app,uploads,logs,ssl,backups,web}
    
    # Установка правильных прав
    chown -R srecha:srecha /opt/srecha
    chmod -R 755 /opt/srecha
    
    log "Директории созданы"
}

# Настройка PostgreSQL
setup_postgresql() {
    log "Настройка PostgreSQL..."
    
    # Генерация пароля для пользователя базы данных
    DB_PASSWORD=$(openssl rand -base64 32)
    
    # Создание пользователя и базы данных
    sudo -u postgres psql -c "CREATE USER srecha WITH PASSWORD '$DB_PASSWORD';"
    sudo -u postgres psql -c "CREATE DATABASE srecha_invoice OWNER srecha;"
    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE srecha_invoice TO srecha;"
    
    # Сохранение пароля в переменной окружения для дальнейшего использования
    echo "POSTGRES_PASSWORD=\"$DB_PASSWORD\"" > /tmp/db_password.env
    
    log "База данных настроена"
}

# Настройка firewall
setup_firewall() {
    log "Настройка firewall..."
    
    # Установка ufw если не установлен
    if ! command -v ufw &> /dev/null; then
        apt-get install -y ufw
    fi
    
    # Сброс правил
    ufw --force reset
    
    # Базовые правила
    ufw default deny incoming
    ufw default allow outgoing
    
    # Разрешение SSH
    ufw allow ssh
    
    # Разрешение HTTP/HTTPS
    ufw allow 80/tcp
    ufw allow 443/tcp
    
    # Включение firewall
    ufw --force enable
    
    log "Firewall настроен"
}

# Генерация паролей и ключей
generate_secrets() {
    log "Генерация секретных ключей..."
    
    # Чтение пароля базы данных
    source /tmp/db_password.env
    
    # Генерация JWT секрета
    JWT_SECRET=$(openssl rand -base64 64)
    
    # Сохранение в файл
    cat > /opt/srecha/app/.env << EOF
# Srecha Invoice - Production Environment Variables
NODE_ENV=production
PORT=3000

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=srecha_invoice
DB_USER=srecha
DB_PASSWORD=${POSTGRES_PASSWORD}

# Legacy compatibility
POSTGRES_DB=srecha_invoice
POSTGRES_USER=srecha
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}

# Application Configuration
JWT_SECRET=${JWT_SECRET}

# Network Configuration
FRONTEND_URL=https://$(hostname -f)

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=1000

# Paths
UPLOADS_DIR=/opt/srecha/uploads
LOGS_DIR=/opt/srecha/logs
SSL_CERT_PATH=/opt/srecha/ssl/fullchain.pem
SSL_KEY_PATH=/opt/srecha/ssl/privkey.pem

# SSL Configuration
DOMAIN=$(hostname -f)
EMAIL=admin@$(hostname -f)

# Backup Configuration
BACKUP_SCHEDULE=0 2 * * *
BACKUP_RETENTION_DAYS=30

# Monitoring
ENABLE_MONITORING=false
EOF
    
    chmod 600 /opt/srecha/app/.env
    chown srecha:srecha /opt/srecha/app/.env
    
    # Очистка временного файла
    rm -f /tmp/db_password.env
    
    log "Секретные ключи сгенерированы и сохранены"
}

# Установка SSL сертификатов
setup_ssl() {
    log "Настройка SSL сертификатов..."
    
    # Установка Certbot
    apt-get install -y certbot
    
    # Создание самоподписанного сертификата для начала
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout /opt/srecha/ssl/privkey.pem \
        -out /opt/srecha/ssl/fullchain.pem \
        -subj "/C=RS/ST=Serbia/L=Belgrade/O=Srecha/CN=$(hostname -f)"
    
    chown -R srecha:srecha /opt/srecha/ssl
    chmod 600 /opt/srecha/ssl/privkey.pem
    chmod 644 /opt/srecha/ssl/fullchain.pem
    
    log "SSL сертификаты настроены (самоподписанные)"
}

# Копирование файлов приложения
deploy_application() {
    log "Развертывание приложения..."
    
    # Копирование файлов в рабочую директорию
    cp -r . /opt/srecha/app/
    
    # Копирование HTML файла в web директорию
    cp index.html /opt/srecha/web/
    
    # Установка правильных прав
    chown -R srecha:srecha /opt/srecha/app
    chown -R srecha:srecha /opt/srecha/web
    
    # Переход в директорию приложения
    cd /opt/srecha/app
    
    # Установка зависимостей от имени пользователя srecha
    sudo -u srecha npm install --production
    
    log "Файлы приложения скопированы и зависимости установлены"
}

# Выполнение миграций базы данных
run_migrations() {
    log "Выполнение миграций базы данных..."
    
    cd /opt/srecha/app
    
    # Выполнение миграций от имени пользователя srecha
    sudo -u srecha npm run migrate
    
    log "Миграции выполнены"
}

# Настройка Nginx
setup_nginx() {
    log "Настройка Nginx..."
    
    # Копирование конфигурации Nginx
    cp nginx.conf /etc/nginx/nginx.conf
    
    # Тестирование конфигурации
    nginx -t
    
    # Перезагрузка Nginx
    systemctl reload nginx
    
    log "Nginx настроен"
}

# Настройка systemd сервиса
setup_systemd() {
    log "Настройка systemd сервиса..."
    
    # Копирование файла сервиса
    cp srecha-invoice.service /etc/systemd/system/
    
    # Перезагрузка systemd и включение автозапуска
    systemctl daemon-reload
    systemctl enable srecha-invoice.service
    systemctl start srecha-invoice.service
    
    log "Systemd сервис настроен и запущен"
}

# Создание скрипта резервного копирования
setup_backup() {
    log "Настройка резервного копирования..."
    
    cat > /opt/srecha/backup.sh << 'EOF'
#!/bin/bash

BACKUP_DIR="/opt/srecha/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="srecha_backup_${DATE}.tar.gz"

# Создание директории для бэкапа
mkdir -p ${BACKUP_DIR}

# Остановка сервиса для консистентности
systemctl stop srecha-invoice

# Создание дампа базы данных
sudo -u postgres pg_dump srecha_invoice > ${BACKUP_DIR}/database_${DATE}.sql

# Создание архива данных
tar -czf ${BACKUP_DIR}/${BACKUP_FILE} \
    /opt/srecha/uploads \
    /opt/srecha/app/.env \
    /opt/srecha/ssl \
    ${BACKUP_DIR}/database_${DATE}.sql

# Запуск сервиса
systemctl start srecha-invoice

# Удаление временного дампа
rm -f ${BACKUP_DIR}/database_${DATE}.sql

# Удаление старых бэкапов (старше 30 дней)
find ${BACKUP_DIR} -name "srecha_backup_*.tar.gz" -mtime +30 -delete

echo "Backup completed: ${BACKUP_FILE}"
EOF
    
    chmod +x /opt/srecha/backup.sh
    chown srecha:srecha /opt/srecha/backup.sh
    
    # Добавление в crontab
    (crontab -u root -l 2>/dev/null; echo "0 2 * * * /opt/srecha/backup.sh") | crontab -u root -
    
    log "Резервное копирование настроено"
}

# Проверка состояния
check_status() {
    log "Проверка состояния приложения..."
    
    # Ожидание запуска сервиса
    sleep 10
    
    # Проверка статуса сервиса
    if systemctl is-active --quiet srecha-invoice; then
        log "✅ Сервис srecha-invoice активен"
    else
        error "❌ Проблема с запуском сервиса"
    fi
    
    # Проверка статуса Nginx
    if systemctl is-active --quiet nginx; then
        log "✅ Nginx активен"
    else
        error "❌ Проблема с Nginx"
    fi
    
    # Проверка статуса PostgreSQL
    if systemctl is-active --quiet postgresql; then
        log "✅ PostgreSQL активен"
    else
        error "❌ Проблема с PostgreSQL"
    fi
    
    # Проверка доступности API
    if curl -s http://localhost:3000/health > /dev/null; then
        log "✅ API доступен"
    else
        warn "⚠️  API пока недоступен (может потребоваться время для инициализации)"
    fi
}

# Главная функция
main() {
    log "🚀 Начало развертывания Srecha Invoice System (без Docker)"
    
    check_root
    check_os
    
    # Обновление системы
    log "Обновление системы..."
    apt-get update && apt-get upgrade -y
    
    # Установка базовых пакетов
    apt-get install -y curl wget git openssl ufw lsb-release
    
    # Установка компонентов
    install_nodejs
    install_postgresql
    install_nginx
    
    create_app_user
    create_directories
    setup_postgresql
    setup_firewall
    generate_secrets
    setup_ssl
    deploy_application
    run_migrations
    setup_nginx
    setup_systemd
    setup_backup
    check_status
    
    log "🎉 Развертывание завершено!"
    log ""
    log "📋 Информация о развертывании:"
    log "   • Приложение доступно по адресу: https://$(hostname -f)"
    log "   • Файлы приложения: /opt/srecha/app"
    log "   • Загрузки: /opt/srecha/uploads"
    log "   • Логи: /opt/srecha/logs"
    log "   • SSL сертификаты: /opt/srecha/ssl"
    log "   • Резервные копии: /opt/srecha/backups"
    log ""
    log "🔧 Полезные команды:"
    log "   • Статус сервиса: systemctl status srecha-invoice"
    log "   • Логи сервиса: journalctl -u srecha-invoice -f"
    log "   • Перезапуск: systemctl restart srecha-invoice"
    log "   • Статус Nginx: systemctl status nginx"
    log "   • Статус PostgreSQL: systemctl status postgresql"
    log "   • Резервная копия: /opt/srecha/backup.sh"
    log ""
    warn "⚠️  Не забудьте:"
    warn "   1. Настроить DNS для вашего домена"
    warn "   2. Получить настоящий SSL сертификат с Let's Encrypt (используйте setup-ssl.sh)"
    warn "   3. Изменить пароли в /opt/srecha/app/.env"
    warn "   4. Настроить мониторинг и логирование"
}

# Запуск главной функции
main "$@"
