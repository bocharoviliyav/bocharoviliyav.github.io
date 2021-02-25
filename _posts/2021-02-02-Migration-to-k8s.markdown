---
layout: post
title:  "Migration Java application to Kubernetes"
date:   2021-02-02 00:13:00 +0400
categories: Java
---
In this article, I want to introduce a checklist that can be followed when you
migrate java application to k8s.
Let's highlight two main types of application:
1. Java application with Spring Boot
2. Old Java application manually deployed on Tomcat server

Some rules applied to both types, but other rules applied only for the second category.

## Project must contain k8s configuration

Typically you can add k8s/deployment.yaml. Examples available in 
[k8s documentation](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)

## Project should contain ignore files

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

## Dockerfile
Docker file used to image creation.
The image usually contains few layers: os, auxiliary soft, JDK, application itself.
In this example, OS - Ubuntu, JDK installed manually and Spring Boot "fat" jar as application.
{% highlight docker %}
FROM ubuntu:20.04

EXPOSE 8080

RUN apt-get update && \
    apt-get install -y openjdk-8-jdk

WORKDIR /app
COPY target/Application.jar .
CMD["java", "$JAVA_OPTS","-Djava.security.egd=file:/dev/./urandom", "-jar", "Application.jar"]
{% endhighlight %}

Remember that all tools started in RUN section available only in the
image creation phase! If you need any daemons, create and run the script.

## Prepare application to Prometheus
In pom.xml, add necessary dependencies:
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

## You can redefine jar/war name for docker
In pom.xml, in build tag define the final name:
{% highlight xml %}
<build>
    <finalName>Application</finalName>
</build>
{% endhighlight %}


## If you are using Oracle database
For Spring Boot application add the official dependency:
{% highlight xml %}
<dependency>
    <groupId>com.oracle.database.jdbc</groupId>
    <artifactId>ojdbc8</artifactId>
</dependency>
{% endhighlight %}


## Use properties section for all dependency versions
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
After that, use this variable in the dependency version:
{% highlight xml %}
<version>${spring.version}</version>
{% endhighlight %}
## Don't forget useful readme.md
Describe how you can build and run the application:
{% highlight console %}
mvn clean package -D maven.test.skip=true // without tests running
//or
mvn clean install -D spring.profiles.active=test // with defining Spring profile for tests
//or
docker build -t your/application:1 && docker-compose up // build and up the image if docker-compose is used
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

Describe all environment variables that your application need:
1. APP_PORT
1. JDBC_DATABASE

## Parametrize application.yaml and use profiles

{% highlight yaml %}
spring:
  profiles:
    active: stage

# Graceful shutdown. Waiting period for active requests completion
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
## Use logback-spring.xml for log configuration.

For example, if you use a console logger like below:
{% highlight java %}
private static final Logger CONSOLE_LOGGER = LoggerFactory.getLogger("console");
{% endhighlight %}

In logback-spring.xml, you can define that only for the dev profile all Spring logs are available.
Otherwise, only yours will print.

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

## Use Swagger/OpenApi

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

For getting information from the BuildProperties you need to define the build-info goal
in pom.xml:
{% highlight xml %}
<plugin>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-maven-plugin</artifactId>
    <executions>
        <execution>
            <goals>
                <goal>build-info</goal>
            </goals>
        </execution>
    </executions>
</plugin>
{% endhighlight %}

If you use @EnableWebMvc in your application, add ResourceHandlers:
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

## Check JavaDoc comments and package-info.java file
{% highlight java %}
/**
  * This is a main package.
  */ 
package io.github.bocharoviliyav.app; 
{% endhighlight %}

You can use the IDEA plugin for primitive JavaDoc generation: install JavaDoc by Sergey Timofiychuk
and in the Java file press Ctrl+Alt+Shift+G

## Check your code 
Use CheckStyle, Sonarqube.

For IDEA CheckStyle plugin exists. 
In the toolbar on the CheckStyle, tab chooses Rules: Sun Checks and start project validation.

# Horizontal Pod Autoscaler (HPA)

If you have an inconsistent workload, use [HPA](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/). 
{% highlight xml %}
kind: HorizontalPodAutoscaler
apiVersion: autoscaling/v2beta2
metadata:
  name: hpa
spec:
  minReplicas: 2
  maxReplicas: 4
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: hpa
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 10
      policies:
      - type: Percent
        value: 100
        periodSeconds: 15
    scaleDown:
      stabilizationWindowSeconds: 120
      policies:
      - type: Percent
        value: 50
        periodSeconds: 60
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 90
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 85
{% endhighlight %}


