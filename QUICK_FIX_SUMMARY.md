# ⚡ Быстрое решение DNS_PROBE_FINISHED_NXDOMAIN

## 🚨 Проблема
Ошибка `DNS_PROBE_FINISHED_NXDOMAIN` означает, что домен `ltf.market` **не найден в DNS**.

## ⚡ Быстрое решение

### Вариант 1: Автоматический скрипт
```bash
# Загрузите скрипт на сервер и запустите:
sudo bash fix_domain_issue.sh
```

### Вариант 2: Ручная настройка
```bash
# 1. Узнайте IP сервера
curl ifconfig.me

# 2. Настройте Nginx для работы по IP
cat > /etc/nginx/sites-available/srecha-invoice << 'EOF'
server {
    listen 80 default_server;
    server_name _;
    root /srecha/gotmituns;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

# 3. Активируйте конфигурацию
rm -f /etc/nginx/sites-enabled/default
ln -s /etc/nginx/sites-available/srecha-invoice /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# 4. Откройте по IP: http://[ВАШ_IP]
```

## 🎯 Результат
После выполнения сайт будет доступен по IP адресу вашего сервера.

## 📋 Долгосрочное решение
1. **Зарегистрируйте домен** ltf.market у регистратора
2. **Добавьте DNS записи:**
   - Тип: A, Имя: @, Значение: [IP_СЕРВЕРА]
   - Тип: A, Имя: www, Значение: [IP_СЕРВЕРА]
3. **Дождитесь распространения DNS** (до 48 часов)
4. **Обновите конфигурацию** с правильным доменом

---

## 📁 Созданные файлы:
- `fix_domain_issue.sh` - автоматический скрипт настройки
- `DNS_NXDOMAIN_SOLUTION.md` - подробное решение
- Обновленный `deployment-guide-interactive.html` с разделом решения проблем

**Статус:** ✅ Готово к исправлению проблемы
