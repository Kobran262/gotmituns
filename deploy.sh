#!/bin/bash

# Скрипт автоматического развертывания Srecha Invoice System
# Для Debian/Ubuntu серверов

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

# Установка Docker
install_docker() {
    log "Установка Docker..."
    
    # Обновление пакетов
    apt-get update
    apt-get install -y ca-certificates curl gnupg lsb-release
    
    # Добавление GPG ключа Docker
    curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    
    # Добавление репозитория Docker
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/debian $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    # Установка Docker
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    
    # Запуск и автозапуск Docker
    systemctl start docker
    systemctl enable docker
    
    log "Docker установлен успешно"
}

# Установка Docker Compose
install_docker_compose() {
    log "Установка Docker Compose..."
    
    # Получение последней версии
    DOCKER_COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep -oP '"tag_name": "\K(.*)(?=")')
    
    # Скачивание и установка
    curl -L "https://github.com/docker/compose/releases/download/${DOCKER_COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    
    # Создание символической ссылки
    ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose
    
    log "Docker Compose установлен: $(docker-compose --version)"
}

# Создание пользователя для приложения
create_app_user() {
    log "Создание пользователя приложения..."
    
    if ! id "srecha" &>/dev/null; then
        useradd -r -s /bin/false -d /opt/srecha srecha
        log "Пользователь 'srecha' создан"
    else
        warn "Пользователь 'srecha' уже существует"
    fi
}

# Создание директорий
create_directories() {
    log "Создание необходимых директорий..."
    
    mkdir -p /opt/srecha/{app,data,logs,ssl,backups}
    mkdir -p /opt/srecha/data/{postgres,uploads}
    
    # Установка правильных прав
    chown -R srecha:srecha /opt/srecha
    chmod -R 755 /opt/srecha
    
    log "Директории созданы"
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
    
    # Генерация пароля базы данных
    DB_PASSWORD=$(openssl rand -base64 32)
    
    # Генерация JWT секрета
    JWT_SECRET=$(openssl rand -base64 64)
    
    # Сохранение в файл
    cat > /opt/srecha/.env.production << EOF
POSTGRES_DB=srecha_invoice
POSTGRES_USER=srecha
POSTGRES_PASSWORD=${DB_PASSWORD}
NODE_ENV=production
JWT_SECRET=${JWT_SECRET}
FRONTEND_URL=https://$(hostname -f)
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=1000
DOMAIN=$(hostname -f)
EMAIL=admin@$(hostname -f)
BACKUP_SCHEDULE=0 2 * * *
BACKUP_RETENTION_DAYS=30
ENABLE_MONITORING=false
EOF
    
    chmod 600 /opt/srecha/.env.production
    chown srecha:srecha /opt/srecha/.env.production
    
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
    
    # Установка правильных прав
    chown -R srecha:srecha /opt/srecha/app
    
    # Переход в директорию приложения
    cd /opt/srecha/app
    
    log "Файлы приложения скопированы"
}

# Запуск приложения
start_application() {
    log "Запуск приложения..."
    
    cd /opt/srecha/app
    
    # Использование production конфигурации
    cp env.production .env
    
    # Запуск с Docker Compose
    docker-compose -f docker-compose.production.yml up -d
    
    log "Приложение запущено"
}

# Настройка автозапуска
setup_autostart() {
    log "Настройка автозапуска..."
    
    # Создание systemd сервиса
    cat > /etc/systemd/system/srecha-invoice.service << EOF
[Unit]
Description=Srecha Invoice System
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/srecha/app
ExecStart=/usr/local/bin/docker-compose -f docker-compose.production.yml up -d
ExecStop=/usr/local/bin/docker-compose -f docker-compose.production.yml down
TimeoutStartSec=0
User=srecha
Group=srecha

[Install]
WantedBy=multi-user.target
EOF
    
    # Перезагрузка systemd и включение автозапуска
    systemctl daemon-reload
    systemctl enable srecha-invoice.service
    
    log "Автозапуск настроен"
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

# Остановка контейнера базы данных для консистентности
cd /opt/srecha/app
docker-compose -f docker-compose.production.yml stop database

# Создание архива данных
tar -czf ${BACKUP_DIR}/${BACKUP_FILE} \
    /opt/srecha/data \
    /opt/srecha/app/.env \
    /opt/srecha/ssl

# Запуск контейнера базы данных
docker-compose -f docker-compose.production.yml start database

# Удаление старых бэкапов (старше 30 дней)
find ${BACKUP_DIR} -name "srecha_backup_*.tar.gz" -mtime +30 -delete

echo "Backup completed: ${BACKUP_FILE}"
EOF
    
    chmod +x /opt/srecha/backup.sh
    chown srecha:srecha /opt/srecha/backup.sh
    
    # Добавление в crontab
    (crontab -u srecha -l 2>/dev/null; echo "0 2 * * * /opt/srecha/backup.sh") | crontab -u srecha -
    
    log "Резервное копирование настроено"
}

# Проверка состояния
check_status() {
    log "Проверка состояния приложения..."
    
    cd /opt/srecha/app
    
    # Ожидание запуска контейнеров
    sleep 30
    
    # Проверка статуса контейнеров
    if docker-compose -f docker-compose.production.yml ps | grep -q "Up"; then
        log "✅ Контейнеры запущены"
    else
        error "❌ Проблема с запуском контейнеров"
    fi
    
    # Проверка доступности API
    if curl -s http://localhost/health > /dev/null; then
        log "✅ API доступен"
    else
        warn "⚠️  API пока недоступен (может потребоваться время для инициализации)"
    fi
}

# Главная функция
main() {
    log "🚀 Начало развертывания Srecha Invoice System"
    
    check_root
    check_os
    
    # Обновление системы
    log "Обновление системы..."
    apt-get update && apt-get upgrade -y
    
    # Установка базовых пакетов
    apt-get install -y curl wget git openssl ufw
    
    # Установка Docker и Docker Compose
    if ! command -v docker &> /dev/null; then
        install_docker
    else
        log "Docker уже установлен"
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        install_docker_compose
    else
        log "Docker Compose уже установлен"
    fi
    
    create_app_user
    create_directories
    setup_firewall
    generate_secrets
    setup_ssl
    deploy_application
    start_application
    setup_autostart
    setup_backup
    check_status
    
    log "🎉 Развертывание завершено!"
    log ""
    log "📋 Информация о развертывании:"
    log "   • Приложение доступно по адресу: https://$(hostname -f)"
    log "   • Файлы приложения: /opt/srecha/app"
    log "   • Данные: /opt/srecha/data"
    log "   • Логи: /opt/srecha/logs"
    log "   • SSL сертификаты: /opt/srecha/ssl"
    log "   • Резервные копии: /opt/srecha/backups"
    log ""
    log "🔧 Полезные команды:"
    log "   • Статус: docker-compose -f /opt/srecha/app/docker-compose.production.yml ps"
    log "   • Логи: docker-compose -f /opt/srecha/app/docker-compose.production.yml logs"
    log "   • Перезапуск: systemctl restart srecha-invoice"
    log "   • Резервная копия: /opt/srecha/backup.sh"
    log ""
    warn "⚠️  Не забудьте:"
    warn "   1. Настроить DNS для вашего домена"
    warn "   2. Получить настоящий SSL сертификат с Let's Encrypt"
    warn "   3. Изменить пароли в /opt/srecha/.env.production"
}

# Запуск главной функции
main "$@"
