---
layout: post
title:  "Migration java application to kubernetes"
date:   2021-02-02 00:13:00 +0400
categories: java
---
In this article I want to introduce check list that can be followed when you 
migrate java application to k8s.
Let's highlight two main types of application:
1. Java application with Spring Boot
2. Old Java application manually deployed on Tomcat server

Some rules applied to both type, but other rules applied only for second category.

### Project must contain k8s configuration

Typically you can add k8s/deployment.yaml. Examples available in 
[k8s documentation](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)

### Project should contain ignore files

.gitignore
{% highlight ignore %}
# File-based project format
*.iws
# IntelliJ
target/
# IntelliJ project files
.idea_modules/
.idea/
/.idea/
.idea
*.iml
gen
# Compiled class file
*.class
# Log file
*.log
# Package Files #
*.jar
*.war
*.nar
*.ear
*.zip
*.tar.gz
*.rar
.git
{% endhighlight %}

.dockerignore
{% highlight ignore %}
.git
{% endhighlight %}

### Dockerfile
Docker file used to image creation.
Image usually contain few layers: os, auxiliary soft, jdk, application itself.
In this example os - ubuntu, jdk installed manually and Spring Boot "fat" jar as application.
{% highlight docker %}
FROM ubuntu:20.04

EXPOSE 8080

RUN apt-get update && \
apt-get install -y openjdk-8-jdk

WORKDIR /app
COPY target/Application.jar .
CMD["java", "$JAVA_OPTS","-Djava.security.egd=file:/dev/./urandom", "-jar", "Application.jar"]
{% endhighlight %}


Remember that all tools started in RUN section available only in
image creation phase! If you need any daemons, create and run script.

### Prepare application to Prometheus
#### For Spring Boot Application

In pom.xml add necessary dependencies:
{% highlight xml %}
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-actuator</artifactId>
</dependency>

<dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-core</artifactId>
</dependency>

<dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-registry-prometheus</artifactId>
</dependency>
{% endhighlight %}

In application.yaml enable metrics and define endpoint:

{% highlight yaml %}
management:
  metrics:
    export:
      prometheus:
        enabled: true
  endpoint:
    prometheus:
      enabled: true
  metrics:
    enabled: true 
endpoints:
  web:
    exposure:
      include: metrics, prometheus
    base-path: "/"
      path-mapping:
        metrics: /metrics/spring
        prometheus: /metrics/prom

{% endhighlight %}


Useful Grafana [JVM dashboard](https://grafana.com/grafana/dashboards/4701).

### You can redefine jar/war name for docker
In pom.xml in build section define the final name:
{% highlight xml %}
<build>
    <finalName>Application</finalName>
</build>
{% endhighlight %}


### If Oracle database are used
For Spring Boot application add official dependency:
{% highlight xml %}
<dependency>
    <groupId>com.oracle.database.jdbc</groupId>
    <artifactId>ojdbc8</artifactId>
</dependency>
{% endhighlight %}


### Use properties section for all dependency versions
In pom.xml:
{% highlight xml %}
<properties>
    <java.version>1.8</java.version>
    <maven.compiler.source>1.8</maven.compiler.source>
    <maven.compiler.target>1.8</maven.compiler.target>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    <project.reporting.outputEncoding>UTF-8</project.reporting.outputEncoding>
    <spring.version>4.4.4.RELEASE</spring.version>
</properties>
{% endhighlight %}
After that use this variable in dependency version:
{% highlight xml %}
<version>${spring.version}</version>
{% endhighlight %}
### Don't forget useful readme.md
Describe how you can build and run application:
{% highlight console %}
mvn clean package -D maven.test.skip=true // without tests running
//or
mvn clean install -D spring.profiles.active=test // with defining Spring profile for test
//or
docker build -t your/application:1 && docker-compose up // build and up image if docker compose used
{% endhighlight %}
Define how you can build JavaDocs:
{% highlight console %}
javadoc.exe -protected -splitindex -encoding UTF-8 -docencoding UTF-8 -charset UTF-8 -d ${path}
{% endhighlight %}

Write application service endpoints:

/metrics/prom - prometheus metrics

/monitor/health - actuator default

/monitor/health/liveness - liveness probe

/monitor/health/readiness - readiness probe

Describe all Environment variable that your application needs:
1. APP_PORT
1. JDBC_DATABASE

### Parametrize application.yaml and use profiles

{% highlight yaml %}
spring:
  profiles:
    active: stage

# graceful shutdown. Waiting period for active requests completion
lifecycle:
  timeout-per-shutdown-phase: 20s
# ==========================
# FOR ALL PROFILES (DEFAULT)
# ==========================
server:
  port: ${app_port}
  shutdown: graceful

# actuator endpoints
management:
  metrics:
    health: 
      probes:
        enabled: true
  endpoints:
    web:
      exposure:
        include: health
      base-path: "/"
        path-mapping:
          health: /health

# -------------------
# DEVELOPMENT PROFILE
# -------------------
---
spring:
  profiles: dev

# any dev props

# ------------------
# PRODUCTION PROFILE
# ------------------
---
spring:
  profiles: prod
# any prod props
{% endhighlight %}

Choose necessary profile as running arguments:
{% highlight console %}
java -jar Application.jar --spring.profiles.active=dev
{% endhighlight %}
### Use logback-spring.xml for log configuration.

For example, if you use console logger like below:
{% highlight java %}
private static final Logger CONSOLE_LOGGER = LoggerFactory.getLogger("console");
{% endhighlight %}

in logback-spring.xml you can define that for only for dev profile all Spring log
should be available. Otherwise, only your logs will be printed.

You can print log in JSON format also.
{% highlight xml %}
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
    <springProfile name="dev">
        <include resource="org/springframework/boot/logging/logback/base.xml"/>
    </springProfile>

    <appender name="STDOUT" class="ch.qos.logback.core.ConsoleAppender">
        <encoder>
            <charset>utf-8</charset>
            <pattern>{"level":"%level","message":"%msg"}%n</pattern>
        </encoder>
    </appender>

    <logger name="console" additivity="false">
        <appender-ref ref="STDOUT" />
    </logger>

</configuration>
{% endhighlight %}

### Use Swagger

{% highlight java %}
/**
  * The Swagger config.
  */
  @Configuration
  @Profile({"!prod && (dev || test)"})
  @EnableSwagger2
  public class SwaggerConfiguration {
  
    /**
    * Api docket.
    *
    * @param env the maven build properties
    * @return the docket
    */
    @Bean
    public Docket createApi(final BuildProperties env) {
        return new Docket(DocumentationType.SWAGGER_2)
            .select()
            .apis(basePackage(Application.class.getPackage().getName()))
            .paths(PathSelectors.any())
            .build()
            .apiInfo(new ApiInfoBuilder()
                .title("Application name REST API")
                .description("Spring Boot REST API for Application name")
                .version(env.getVersion())
                .build());
    }

}
{% endhighlight %}


If you use @EnableWebMvc in your application add ResourceHandlers:
{% highlight java %}
/**
  * The Web application configuration class.
  */
  @Configuration
  @EnableWebMvc
  public class WebApplication implements WebMvcConfigurer {

  @Override
  public void addResourceHandlers(final ResourceHandlerRegistry registry) {

        registry
            .addResourceHandler("swagger-ui.html")
            .addResourceLocations("classpath:/META-INF/resources/");

        registry
            .addResourceHandler("/webjars/**")
            .addResourceLocations("classpath:/META-INF/resources/webjars/");
  }
  } 
{% endhighlight %}

### Check JavaDoc comments and package-info.java file
{% highlight java %}
/**
  * This is a main package.
  */ 
package io.github.bocharoviliyav.app; 
{% endhighlight %}

You can use IDEA plugin for primitive JavaDoc generation: install JavaDoc by Sergey Timofiychuk
and in Java file press Ctrl+Alt+Shift+G

### Check your code 
Use CheckStyle, Sonarqube.

For IDEA CheckStyle plugin exists.
In toolbar on CheckStyle tab choose Rules: Sun Checks and run project validation.