# Команды для загрузки на сервер lft.market (IP: 185.119.90.54)

# 1. Загрузите исправленные файлы:
scp routes/product-groups.js root@185.119.90.54:/opt/srecha/app/routes/
scp routes/invoices.js root@185.119.90.54:/opt/srecha/app/routes/
scp routes/deliveries.js root@185.119.90.54:/opt/srecha/app/routes/

# 2. Подключитесь к серверу:
ssh root@185.119.90.54
