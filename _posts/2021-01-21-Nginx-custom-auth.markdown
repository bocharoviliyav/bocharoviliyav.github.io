---
layout: post
title:  "Custom authorization implementation in Keycloak using Nginx"
date:   2021-01-21 23:37:26 +0400
categories: DevOps
---

This topic would be multipurpose. I want to tell you about a powerful web-server, script programming language, and an identity provider.
A lot of material already been written about Nginx.
Nginx is a lightweight web-server, proxy, reverse-proxy, mail-proxy, gateway, and supports Lua scripts.
Lua is a JIT-compiled programming language with light syntax. 
You can overview these language features at [this site](https://learnxinyminutes.com/docs/lua/).
There is an out-of-the-box solution with Nginx and Lua - Openresty. 
It exists as Win/Mac/Linux builds as well as Docker image.
I want to show how you can use Nginx with Lua/Openresty for the simple case below.

The client doesn't support OAuth authorization and can provide information only as static request headers.
We have KeyCloak as the identity provider and have restricted access for k8s/Openshift cluster.
We need to intercept client requests, authorize them,  add additional information and send it to the necessary endpoint. We'll use client id and secret for authorization, but you feel free to use [Basic authorization type](https://github.com/keycloak/keycloak/tree/master/examples/basic-auth). 

# Keycloak client creation

First of all, we need to create a realm in KeyCloak.
If you need multi-tenancy in your application, you should create separate realms for each tenant.
You can also create a realm for utility application in your cluster.

<img src="/assets/images/nginx_keycloak/add_realm.png"/>

The next step is Client creation. You must set required fields, can grant business roles.
Don't forget to save the client's secret and id. We'll use them later.

<img src="/assets/images/nginx_keycloak/client_creation.png"/>


<img src="/assets/images/nginx_keycloak/client_secret.png"/>
You can get more information about OIDC Clients in the official documentation [chapter 8 Managing Clients](https://www.keycloak.org/docs/latest/server_admin/#_clients).

# Nginx preparation

Enable Lua in nginx.conf:
{% highlight lua %}
load_module modules/ndk_http_module.so;
load_module modules/ngx_http_lua_module.so;
{% endhighlight %}
In additional we need two external modules:

    http, json.

You can keep it locally and copy in the docker container or install it with LuaRocks.

If we are intercept requests and send authorization in KeyCloak, we'll
have token regeneration for each one. It would be ok in some cases, but let's reduce KeyCloak compute resource usage and create cache storage in our proxy.
In the http section of nginx.conf initialize the global variable. That variable will contain key-value pairs.
Where key - unique identifier of client and value is current access token.
{% highlight lua %}
lua_shared_dict custom_cache 10m;
{% endhighlight %}
In server block set reverse-proxy paths and rewriting request by Lua script.
{% highlight conf %}
location /in {
  rewrite_by_lua_block { require("convertor")() }
  proxy_pass http://172.20.0.1:8082/out;
}
{% endhighlight %}

All requests sent on {servername}/in would be processed by a script called with require. If no error happens, it sents to the proxy_pass path.

# Lua request processing

We need to create the file with a name that we are defined above. 
In convertor.lua defines the anonymous function:

    return function()

After that get our custom cache and assign to the local variable.
{% highlight lua %}
local customCache = ngx.shared.custom_cache
{% endhighlight %}
The next step is getting KeyCloak client information from request headers. In this example I'll use three headers without any encryption. This is not secure rather with https, use Authorization header for the such sensitive information!
{% highlight lua %}
local realm = ngx.req.get_headers()["realm"]
local client = ngx.req.get_headers()["client"]
local secret = ngx.req.get_headers()["secret"]
{% endhighlight %}
Then call KeyCloak REST API via http module:
{% highlight lua %}
local http = require "http"
local httpClient = http.new()

local response
local err
{% endhighlight %}
Try get token from cache and validate it with calling userinfo:
{% highlight lua %}
local accessTokenFromCache = customCache:get(clientIdentity)
if accessTokenFromCache ~= nil then
local bearerHeaderFromCache = string.format("Bearer %s", accessTokenFromCache)
-- Get user info to token validation
        response, err = httpClient:request_uri(keycloakUrl ..
                '/auth/realms/' .. realm .. '/protocol/openid-connect/userinfo', {
            method = "GET",
            headers = {
                ["Authorization"] = bearerHeaderFromCache,
            }
        })
    end
{% endhighlight %}
If response have no 200 code, call API for a new token creation:
{% highlight lua %}
response, err = httpClient:request_uri(keycloakUrl ..
        '/auth/realms/' .. realm .. '/protocol/openid-connect/token', {
    method = "POST",
    body = ngx.encode_args({
        client_id = client,
        grant_type = 'client_credentials',
        client_secret = secret
    }),
    headers = {
        ["Content-Type"] = "application/x-www-form-urlencoded",
    }
})
{% endhighlight %}
Then parse response JSON and get the new token.
{% highlight lua %}
local json = require "json"
local newAccessToken = json.decode(response.body)['access_token']
customCache = ngx.shared.custom_cache
customCache:set(clientIdentity, newAccessToken)
{% endhighlight %}
The last step is setting new token to the cache, set it to the Authorization header, 
and remove old headers with the sensitive information.

{% highlight lua %}
local accessToken = customCache:get(clientIdentity)
local bearerHeader = string.format("Bearer %s", accessToken)
ngx.req.set_header("Authorization", bearerHeader)

ngx.req.clear_header("realm")
ngx.req.clear_header("client")
ngx.req.clear_header("secret")
{% endhighlight %}

Let's see how it works. 
I'll use docker-compose for running KeyCloak, Openresty, and Spring Boot application as backend.
All applications define as services with required settings in docker-compose.yml. All docker images build previously.
{% highlight yaml %}
version: '3'
services:
  nginx:
    image: nginx:1
    container_name: nginx_container
    restart: always
    ports:
      - 8081:8081
    networks:
      - mybridge

  nginx-consumer:
    image: nginx/consumer:1
    container_name: nginx_consumer_container
    restart: always
    ports:
      - 8082:8082
    networks:
      - mybridge
  keycloak:
    image: quay.io/keycloak/keycloak:latest
    container_name: keycloack
    restart: always
    environment:
      - KEYCLOAK_USER=admin
      - KEYCLOAK_PASSWORD=admin
      - PROXY_ADDRESS_FORWARDING=true
    ports:
      - 8080:8080
    networks:
      - mybridge

networks:
  mybridge:
    driver: bridge
    external: true
{% endhighlight %}

The main thing is setting one own network here. You can create a local docker network via
{% highlight console %}
docker network create mybridge
{% endhighlight %}
And then, you need to define docker host IP instead of localhost in configurations and applications.
In this case, all services with mybridge can have cross-container communication.
We can test our proxy. In Postman, set headers (realm, client, secret) and send the request.

<img src="/assets/images/nginx_keycloak/postman.png"/>

All things can be simpler, but you can find your case when you can apply this knowledge.

Source code is available on [github](https://github.com/bocharoviliyav/nginx-lua-keycloak-example).
