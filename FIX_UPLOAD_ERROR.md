# 🚨 Исправление ошибки "Could not resolve hostname"

## ❌ Ошибка которую вы получили:
```
ssh: Could not resolve hostname ip_СЕРВЕРА: Name or service not known
```

## 🔍 Причина:
Вы скопировали команды буквально с плейсхолдером `[IP_СЕРВЕРА]`, но нужно заменить его на **реальный IP адрес** вашего сервера.

## ✅ Как исправить:

### 1. Узнайте IP адрес вашего сервера
Если вы не знаете IP адрес сервера:
- Посмотрите в панели управления хостинг-провайдера
- Или спросите у администратора
- Или выполните на сервере: `curl ifconfig.me`

### 2. Замените плейсхолдер на реальный IP

#### ❌ Неправильно (так как вы делали):
```bash
scp routes/product-groups.js root@[IP_СЕРВЕРА]:/opt/srecha/app/routes/
```

#### ✅ Правильно (пример с IP 192.168.1.100):
```bash
scp routes/product-groups.js root@192.168.1.100:/opt/srecha/app/routes/
```

## 📋 Правильные команды (замените IP на ваш):

```bash
# Замените 192.168.1.100 на IP ВАШЕГО сервера!
scp routes/product-groups.js root@192.168.1.100:/opt/srecha/app/routes/
scp routes/invoices.js root@192.168.1.100:/opt/srecha/app/routes/
scp routes/deliveries.js root@192.168.1.100:/opt/srecha/app/routes/
scp troubleshooting-guide.html root@192.168.1.100:/opt/srecha/app/
```

## 🔧 Альтернативные способы:

### Способ 1: Создать переменную с IP
```bash
# Задайте IP один раз
SERVER_IP="192.168.1.100"  # Замените на ваш IP

# Используйте переменную
scp routes/product-groups.js root@$SERVER_IP:/opt/srecha/app/routes/
scp routes/invoices.js root@$SERVER_IP:/opt/srecha/app/routes/
scp routes/deliveries.js root@$SERVER_IP:/opt/srecha/app/routes/
scp troubleshooting-guide.html root@$SERVER_IP:/opt/srecha/app/
```

### Способ 2: Если у сервера есть доменное имя
```bash
# Если у вас есть домен, можно использовать его вместо IP
scp routes/product-groups.js root@your-domain.com:/opt/srecha/app/routes/
```

## ⚠️ Возможные дополнительные ошибки:

### 1. "Permission denied (publickey)"
Решение: Добавьте пароль или используйте SSH ключ
```bash
scp -o PasswordAuthentication=yes routes/product-groups.js root@IP:/opt/srecha/app/routes/
```

### 2. "Connection refused"
Решение: Проверьте что SSH сервис запущен и порт 22 открыт

### 3. "No such file or directory"
Решение: Создайте папку на сервере:
```bash
ssh root@IP "mkdir -p /opt/srecha/app/routes"
```

## 🎯 Пример полной последовательности:

```bash
# 1. Задайте ваш IP (замените на реальный!)
SERVER_IP="203.0.113.1"

# 2. Проверьте соединение
ssh root@$SERVER_IP "echo 'Соединение работает!'"

# 3. Создайте папки если нужно
ssh root@$SERVER_IP "mkdir -p /opt/srecha/app/routes"

# 4. Загрузите файлы
scp routes/product-groups.js root@$SERVER_IP:/opt/srecha/app/routes/
scp routes/invoices.js root@$SERVER_IP:/opt/srecha/app/routes/
scp routes/deliveries.js root@$SERVER_IP:/opt/srecha/app/routes/
scp troubleshooting-guide.html root@$SERVER_IP:/opt/srecha/app/

# 5. Проверьте что файлы загружены
ssh root@$SERVER_IP "ls -la /opt/srecha/app/routes/"
```

## 🆘 Нужна помощь?
Укажите:
1. IP адрес вашего сервера (или домен)
2. Какой хостинг-провайдер
3. Имеете ли вы SSH доступ

**Главное: замените `[IP_СЕРВЕРА]` или `192.168.1.100` на реальный IP адрес вашего сервера!**

