---
layout: post
title:  "Migration java application to kubernetes. Monolith"
date:   2021-02-03 00:03:00 +0400
categories: java
---
This article is the thoughts about additional steps that needs for monolith installation in k8s. 

In general, we have the same application as Spring Boot, but there are few major things
that need to be highlighted.

### Dockerfile
In this example dockerfile contains ubuntu, tomcat server and jar/war as application.

{% highlight docker %}
FROM ubuntu:20.04

RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y unzip && \
    apt-get install -y openjdk-8-jdk && \
    apt-get install -y wget

RUN mkdir /usr/local/tomcat && \
    wget https://apache-mirror.rbc.ru/pub/apache/tomcat/tomcat-9/v9.0.41/bin/apache-tomcat-9.0.41.tar.gz -O /tmp/tomcat.tar.gz && \
    cd /tmp && \
    tar xvfz tomcat.tar.gz && \
    cp -Rv /tmp/apache-tomcat-9.0.41/* /usr/local/tomcat/ && \
    echo "org.apache.tomcat.util.digester.PROPERTY_SOURCE=org.apache.tomcat.util.digester.EnvironmentPropertySource" >> /usr/local/tomcat/conf/catalina.properties

COPY target/Application.war /tmp

RUN rm -rf /usr/local/tomcat/webapps/examples && \
    rm -rf /usr/local/tomcat/webapps/docs && \
    rm -rf /usr/local/tomcat/webapps/ROOT && \
    unzip /tmp/Application.war -d /usr/local/tomcat/webapps/ROOT && \
    rm -rf /tmp/apache-tomcat-9.0.41 && \
    rm -rf /usr/local/tomcat/webapps/host-manager && \
    rm -rf /usr/local/tomcat/webapps/manager && \
    rm /tmp/tomcat.tar.gz && \
    rm /tmp/Application.war

RUN export CATALINA_HOME="/usr/local/tomcat" && \
    export PATH="$PATH:$CATALINA_HOME/bin"  && \
    export CATALINA_OPTS="$CATALINA_OPTS -server"  && \
    export CATALINA_OPTS="$CATALINA_OPTS ${JAVA_OPTS}"  && \
    export CATALINA_OPTS="$CATALINA_OPTS -DCUSTOM_OPTION=${ENV_OPTION}"

CMD["./usr/local/tomcat/bin/catalina.sh", "run"]
{% endhighlight %}

Image based on Ubuntu. Exposed on 8080 port.

Second step is jdk, unzip and wget installation.

The third step is downloading Tomcat server and unpacking.

Setting PROPERTY_SOURCE is optional. That echo operation change tomcat property
source to OS Environment variables.

Next steps are copy Application.war to tmp directory, removing Tomcat default
project, unzip Application as root Tomcat application and removing temporary
files. Then set java and tomcat running options. You can set your own
properties. That properties can be used in the server.xml and should be called with -D
prefix.

Last step is Tomcat running. If any utility soft are needed, create start script, copy into image
and run in CMD/ENTRYPOINT. 

#### For Spring Application

In pom.xml add necessary dependencies:
{% highlight xml %}
<dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-core</artifactId>
</dependency>
<dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-registry-prometheus</artifactId>
</dependency>
<dependency>
    <groupId>io.prometheus</groupId>
    <artifactId>simpleclient</artifactId>
</dependency>
<dependency>
    <groupId>io.prometheus</groupId>
    <artifactId>simpleclient_servlet</artifactId>
</dependency>
{% endhighlight %}

Then create ServletContextListener:

{% highlight java %}
import io.micrometer.core.instrument.Clock;
import io.micrometer.core.instrument.binder.jvm.ClassLoaderMetrics;
import io.micrometer.core.instrument.binder.jvm.JvmCompilationMetrics;
import io.micrometer.core.instrument.binder.jvm.JvmGcMetrics;
import io.micrometer.core.instrument.binder.jvm.JvmHeapPressureMetrics;
import io.micrometer.core.instrument.binder.jvm.JvmMemoryMetrics;
import io.micrometer.core.instrument.binder.jvm.JvmThreadMetrics;
import io.micrometer.core.instrument.binder.system.FileDescriptorMetrics;
import io.micrometer.core.instrument.binder.system.ProcessorMetrics;
import io.micrometer.core.instrument.binder.system.UptimeMetrics;
import io.micrometer.prometheus.PrometheusConfig;
import io.micrometer.prometheus.PrometheusMeterRegistry;
import io.prometheus.client.CollectorRegistry;

import javax.servlet.ServletContextEvent;
import javax.servlet.ServletContextListener;
/**
  * The Prometheus Listener for metrics binding.
  */
  public class PrometheusInitListener implements ServletContextListener {
  @Override
  public void contextInitialized(ServletContextEvent sce) {
  PrometheusMeterRegistry meterRegistry =
  new PrometheusMeterRegistry(PrometheusConfig.DEFAULT, CollectorRegistry.defaultRegistry, Clock.SYSTEM);
  new ClassLoaderMetrics().bindTo(meterRegistry);
  new JvmMemoryMetrics().bindTo(meterRegistry);
  new JvmGcMetrics().bindTo(meterRegistry);
  new ProcessorMetrics().bindTo(meterRegistry);
  new JvmThreadMetrics().bindTo(meterRegistry);
  new JvmHeapPressureMetrics().bindTo(meterRegistry);
  new JvmCompilationMetrics().bindTo(meterRegistry);
  new UptimeMetrics().bindTo(meterRegistry);
  new FileDescriptorMetrics().bindTo(meterRegistry);
  new ProcessorMetrics().bindTo(meterRegistry);
  }

  @Override
  public void contextDestroyed(ServletContextEvent sce) {
  }
}
  {% endhighlight %}

After that register this listener in web.xml:
{% highlight xml %}
<servlet>
    <servlet-name>prometheus</servlet-name>
    <servlet-class>io.prometheus.client.exporter.MetricsServlet</servlet-class>
    <load-on-startup>1</load-on-startup>
</servlet>

<servlet-mapping>
	<servlet-name>prometheus</servlet-name>
	<url-pattern>/metrics/prom</url-pattern>
</servlet-mapping>
<listener>
    <listener-class>io.github.bocharoviliyav.PrometheusInitListener</listener-class>
</listener>
{% endhighlight %}

If Spring Security was used, disable security validation to this endpoint,
in security-context.xml add:
{% highlight xml %}
    <http pattern="/metrics/prom" security="none"/>
{% endhighlight %}


### If Oracle database are used

For web application you should add this driver in dockerfile to

{% highlight docker %}
    ADD path-to-repo/ojdbc8.jar /usr/local/tomcat/lib
{% endhighlight %}

and in the maven define driver as provided:
{% highlight xml %}
<dependency>
    <groupId>com.oracle.database.jdbc</groupId>
    <artifactId>ojdbc8</artifactId>
    <scope>provided</scope>
</dependency>
{% endhighlight %}

### Log definition


For Tomcat based application log4j.xml can print JSON too.
{% highlight xml %}
<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE log4j:configuration SYSTEM "log4j.dtd">
<log4j:configuration xmlns:log4j="http://jakarta.apache.org/log4j/">
    <appender name="CONSOLE" class="org.apache.log4j.ConsoleAppender">
        <param name="target" value="System.out" />
        <layout class="org.apache.log4j.PatternLayout">
            <param name="ConversionPattern" value='{"level":"%p","message":"%m"}%n'/>
        </layout>
    </appender>
    <root>
        <appender-ref ref="CONSOLE" />
    </root>
</log4j:configuration>
{% endhighlight %}

For container memory leak avoiding in logging.properties
disable file log appenders:
{% highlight properties %}
handlers = java.util.logging.ConsoleHandler
.handlers = java.util.logging.ConsoleHandler
java.util.logging.ConsoleHandler.level = FINE
java.util.logging.ConsoleHandler.formatter = java.util.logging.SimpleFormatter
java.util.logging.SimpleFormatter.format={"level":"%4$s","message": "%5$s%6$s"}%n
java.util.logging.ConsoleHandler.encoding = UTF-8
{% endhighlight %}

You can do it in Dokerfile by replacing original logging.properties with COPY/ADD or 
you can use script like in example below:
{% highlight docker %}
    RUN rm /usr/local/tomcat/conf/logging.properties && echo -e ${log-config} >> /usr/local/tomcat/conf/logging.properties
{% endhighlight %}
 
If ${log-config} are multiline use /n at the end of each line. 
