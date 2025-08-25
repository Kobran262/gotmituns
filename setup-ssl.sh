#!/bin/bash

# Скрипт для настройки SSL сертификатов Let's Encrypt
# Запускать после основного развертывания (БЕЗ Docker)

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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
if [[ $EUID -ne 0 ]]; then
    error "Этот скрипт должен запускаться с правами root. Используйте: sudo $0"
fi

# Получение домена и email
read -p "Введите ваш домен (например, example.com): " DOMAIN
read -p "Введите ваш email: " EMAIL

if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
    error "Домен и email обязательны"
fi

log "Настройка SSL сертификата для домена: $DOMAIN"

# Обновление конфигурации
sed -i "s/DOMAIN=.*/DOMAIN=$DOMAIN/" /opt/srecha/app/.env
sed -i "s/EMAIL=.*/EMAIL=$EMAIL/" /opt/srecha/app/.env
sed -i "s|FRONTEND_URL=.*|FRONTEND_URL=https://$DOMAIN|" /opt/srecha/app/.env

# Остановка nginx для получения сертификата
systemctl stop nginx

# Получение сертификата
log "Получение SSL сертификата от Let's Encrypt..."

certbot certonly \
    --standalone \
    --email $EMAIL \
    --agree-tos \
    --non-interactive \
    --domains $DOMAIN

# Копирование сертификатов
cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem /opt/srecha/ssl/
cp /etc/letsencrypt/live/$DOMAIN/privkey.pem /opt/srecha/ssl/

# Установка правильных прав
chown -R srecha:srecha /opt/srecha/ssl
chmod 600 /opt/srecha/ssl/privkey.pem
chmod 644 /opt/srecha/ssl/fullchain.pem

# Запуск nginx
systemctl start nginx

# Настройка автообновления сертификата
cat > /opt/srecha/renew-ssl.sh << 'EOF'
#!/bin/bash

DOMAIN=$(grep "DOMAIN=" /opt/srecha/app/.env | cut -d'=' -f2)

# Остановка nginx
systemctl stop nginx

# Обновление сертификата
certbot renew --quiet

# Копирование обновленных сертификатов
if [[ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]]; then
    cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem /opt/srecha/ssl/
    cp /etc/letsencrypt/live/$DOMAIN/privkey.pem /opt/srecha/ssl/
    chown -R srecha:srecha /opt/srecha/ssl
    chmod 600 /opt/srecha/ssl/privkey.pem
    chmod 644 /opt/srecha/ssl/fullchain.pem
fi

# Запуск nginx
systemctl start nginx
EOF

chmod +x /opt/srecha/renew-ssl.sh
chown srecha:srecha /opt/srecha/renew-ssl.sh

# Добавление в crontab для автообновления (каждый день в 3:00)
(crontab -u root -l 2>/dev/null; echo "0 3 * * * /opt/srecha/renew-ssl.sh") | crontab -u root -

log "✅ SSL сертификат настроен успешно!"
log "📋 Информация:"
log "   • Домен: $DOMAIN"
log "   • Сертификат: /opt/srecha/ssl/fullchain.pem"
log "   • Ключ: /opt/srecha/ssl/privkey.pem"
log "   • Автообновление: каждый день в 3:00"
log ""
log "🌐 Ваше приложение доступно по адресу: https://$DOMAIN"
