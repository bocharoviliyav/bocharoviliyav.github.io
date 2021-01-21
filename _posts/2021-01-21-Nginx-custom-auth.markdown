---
layout: post
title:  "Using Nginx to implement custom authorization in Keycloak"
date:   2021-01-21 23:37:26 +0400
categories: devops
---
Привет, читатель!

Уже написано большое количество материала про NGINX, однако, и его возможности
велики.
В своей работе я использовал NGINX как шлюз, кеш для статики и в виде прослойки между бэком
и фронтенд-приложением.
Для решения нижеописанной проблемы было решено так же использовать NGINX.

В наличии:  K8s облако с набором сервисов, KeyCloak в качестве идентификационного брокера,
внешние системы с которыми необходимо интегрироваться.

Запрещено: хождение запросов внутри облака без JWT токена.

Проблема: далеко не все внешние системы имеют поддержку OAuth.
Необходимо: решение, которое позволит производить получение данных из заголовка запроса,
предоставит эти данные KeyCloak и переподпишет запрос полученым токеном.

NGINX имеет поддержку языка Lua, связка которых и будет использоваться для решения проблемы.

Для начала необходимо создать клиента в KeyCloak.
Зададим ID клиента, укажем бизнес роли, сохраним секрет клиента.
Подробнее о OIDC Clients вы можете прочитать в документациии https://www.keycloak.org/docs/latest/server_admin/#_clients
глава 8 Managing Clients. Также необходимо запомнить id реалма, в котором был создан клиент.

На этом подготовка завершена. Приступим к конфигурации NGINX.

Для поддержки Lua В nginx.conf укажем:

    load_module modules/ndk_http_module.so;
    load_module modules/ngx_http_lua_module.so;

Дополнительно будут использованы слудующие модули:  
http_headers, http, json.

Так как крайне не желательно, чтобы на каждый запрос от внешней системы генерировался новый
токен и новая сессия, заранее предусмотрим кеширование токена. Для этого в блоке
http укажем глобальную переменную:

    lua_shared_dict our_cache 10m;

В блоке server укажем перенаправление запроса и обработкой скриптом:

    location /external_api { rewrite_by_lua_block {require(\"our_script\")()}  proxy_pass /internal_path; }

Таким образом, запросы, послупающие по адресу /external_api будут обработаны скриптом
и перенаправлены на /internal_path. Скрипт может находится в отдельном файле,а может
быть написан непосредственно в блоке rewrite_by_lua_block.
Осталось написать логику обработки запроса.

В файле our_script будет находиться анонимная функция:

    return function()

внутри которой объявим переменную для доступа к кешу:

    local ourCache = ngx.shared.our_cache

Затем нужно получить заголовоки запроса внешней системы. В качестве таких
заголовков для примера будут данные клиента KeyCloak. Для упрощения положим, что данные
передаются в виде трёх заголовков в незашифрованном виде. Но необходмо понимать,
что это крайне небезопасно, нужно использовать соответствующие заголовки(например в случае с парой id-секрет
можно использовать Authorization header).

    local headers = ngx.req.get_headers()
    local realm = headers["realm"]
    local clientId = headers["clientId"]
    local secret = headers["secret"]

Для обрашения к KeyCloak используем http:
    
    local http = require "http"
    local httpClient = http.new()
    
    local response
    local err

Попробуем получить токен из кеша, и пройти его валидацию:

    local accessTokenFromCache = ourCache:get(clientId)
    if accessTokenFromCache ~= nil then
        local bearerHeaderFromCache = string.format("Bearer %s", accessTokenFromCache)
        response, err = httpClient:request_uri(ngx.var.idp ..
                '/auth/realms/' .. realm .. '/protocol/openid-connect/userinfo', {
            method = "GET",
            headers = {
                ["Authorization"] = bearerHeaderFromCache,
            }
        })
    end

Если токена нет в кеше, или он просрочен, отправим запрос на получение нового токена:

        response, err = httpClient:request_uri(ngx.var.idp ..
                '/auth/realms/' .. realm .. '/protocol/openid-connect/token', {
            method = "POST",
            body = ngx.encode_args({
                client_id = clientId,
                grant_type = 'client_credentials',
                client_secret = secret
            }),
            headers = {
                ["Content-Type"] = "application/x-www-form-urlencoded",
            }
        })

Из ответа достанем токен и запишем его в кеш:

        local json = require "json"
        local newAccessToken = json.decode(response.body)['access_token']
        ourCache:set(clientId, newAccessToken)

    end
Для исходного запроса удалим заголовки с данными клиента и запишем новый с JWT
токеном клиента.

    local accessToken = ourCache:get(clientId)
    local bearerHeader = string.format("Bearer %s", accessToken)
    
    ngx.req.set_header("Authorization", bearerHeader)
    ngx.req.clear_header("realm")
    ngx.req.clear_header("clientId")
    ngx.req.clear_header("secret")

end

Таким образом, с помощью NGINX и Lua, возможно решить проблему интеграции с внешними
системами, которые не поддерживают полноценную OAuth авторизацию.
Всем добра!
