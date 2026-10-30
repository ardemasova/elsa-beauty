# Обновление сервера до версии с изоляцией салонов (этап 1)

Всё выполняется на сервере в папке проекта (`~/ELSA_BEAUTY/ELSA_BEAUTY_git`).
Сначала проверьте на Mac (раздел в конце), потом сервер.

## 0. Резервные копии (обязательно)

```bash
cd ~/ELSA_BEAUTY/ELSA_BEAUTY_git
mkdir -p ~/backups
# база целиком
docker compose exec -T db pg_dump -U postgres -Fc ELSA_BEAUTY > ~/backups/elsa_$(date +%F).dump
ls -lh ~/backups/
# фото мастеров и клиентов: при обновлении git удалит их из папки проекта
cp -a backend/uploads ~/backups/uploads_$(date +%F)
```

Восстановление базы при необходимости:
`docker compose exec -T db pg_restore -U postgres -d ELSA_BEAUTY --clean < ~/backups/elsa_ДАТА.dump`

## 1. Получить новую версию

```bash
git fetch origin
git checkout security/stage-1
# вернуть фото на место (теперь они не хранятся в git)
mkdir -p backend/uploads && cp -an ~/backups/uploads_$(date +%F)/. backend/uploads/
```

## 2. Файл с настройками `.env` (рядом с docker-compose.yml)

Раньше секреты были прописаны прямо в `docker-compose.yml` и попадали в образ
из `backend/.env`. Теперь они в одном файле `.env` в корне проекта:

```bash
cp .env.example .env
nano .env
```

- `DB_PASSWORD` — **текущий** пароль базы (сейчас это `postgres`; пароль из
  `.env` не меняет пароль уже созданной базы). Сменить его — шаг 6.
- `ACCESS_TOKEN_SECRET` — новый случайный ключ:
  `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
  (или `openssl rand -base64 48`). Все пользователи один раз войдут заново.
- `MAIL_USER`, `MAIL_PASS`, `OPENROUTER_API_KEY` — перенесите из `backend/.env`.
- `CORS_ORIGINS` — адрес, с которого открывают приложение (`https://app.elsaerp.com`).

## 3. Миграции базы

```bash
docker compose build backend
docker compose run --rm backend npm run migrate
```

В конце должно быть `✅ Migrations complete`. Строки `WARNING` прочитайте:
так помечаются, например, пользователи с одинаковым email в разных филиалах
(их копии переименованы в `имя+dup2@...` и отключены).

## 4. Запуск

```bash
docker compose up -d --build
docker compose ps          # все три контейнера "running"/"healthy"
curl -s localhost:3000/api/health   # {"ok":true}
```

Порты базы (5433) и API (3000) теперь доступны только с самого сервера.
Если nginx на сервере проксирует на них — всё продолжит работать. Если вы
открывали API напрямую по `http://IP:3000` — перенастройте через nginx/HTTPS.

## 5. Права владельца для вашей учётной записи

После миграции каждый существующий салон стал отдельным аккаунтом, а все
бывшие «admin» остались администраторами своего филиала. Чтобы получить
права владельца (открывать филиалы, управлять всеми пользователями):

```bash
docker compose exec db psql -U postgres -d ELSA_BEAUTY \
  -c "UPDATE public.users SET role = 'owner' WHERE lower(email) = 'ваш@email'"
```

Новых клиентов (салоны) заводите командой — она создаёт аккаунт, владельца
и первый филиал и печатает временный пароль:

```bash
docker compose run --rm backend npm run create-account -- \
  --name "Salon Lola" --email owner@salonlola.es --plan standard --branch "Lola Centro"
```

## 6. Сменить пароль базы (рекомендуется)

```bash
docker compose exec db psql -U postgres -c "ALTER USER postgres PASSWORD 'новый_длинный_пароль'"
nano .env    # DB_PASSWORD=новый_длинный_пароль
docker compose up -d backend
```

---

## Проверка на Mac перед сервером

```bash
cd ~/elsa_beauty
git fetch origin && git checkout security/stage-1
cd backend && npm install
# в backend/.env добавьте ACCESS_TOKEN_SECRET длиной от 32 символов
npm run migrate
npm start
# в другом окне
cd ../frontend && npm install && npm run dev
```

Автотесты безопасности (на отдельной тестовой базе, не на рабочей):
создайте `backend/.env.test` по образцу `.env` с `DB_NAME=elsa_test`, затем
`./test/prepare-db.sh && npm test`.
