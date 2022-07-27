---
layout: post
title:  "Spring Boot and PostGIS"
date:   2021-02-03 17:51:00 +0400
categories: Java
tags: Java Spring Boot PostgreSQL PostGIS Docker
---
If you need to keep geo-data in the PostgreSQL database, you may use the PostGIS extension.

>PostGIS provides spatial objects [...], allowing storage and query information about location and mapping.

In the Spring Boot application, you should add necessary dependencies in pom.xml.

{% highlight xml %}
<dependency>
    <groupId>org.postgresql</groupId>
    <artifactId>postgresql</artifactId>
    <scope>runtime</scope>
</dependency>
<dependency>
    <groupId>com.graphhopper.external</groupId>
    <artifactId>jackson-datatype-jts</artifactId>
    <version>${jackson-datatype-jts.version}</version>
</dependency>
<dependency>
    <groupId>org.locationtech.jts</groupId>
    <artifactId>jts-core</artifactId>
    <version>${jts-core.version}</version>
</dependency>
<dependency>
    <groupId>org.hibernate</groupId>
    <artifactId>hibernate-spatial</artifactId>
    <version>${hibernate-spatial.version}</version>
</dependency>
{% endhighlight %}

In the demo project, I'll use Liquibase for filling a table with the test data. 
Liquibase is a data migration tool. It has a maven plugin for manual/auto migration while the build process runs.

Maven plugin configuration:

{% highlight xml %}
<plugin>
    <groupId>org.liquibase</groupId>
    <artifactId>liquibase-maven-plugin</artifactId>
    <version>${liquibase.version}</version>
    <dependencies>
        <dependency>
            <groupId>org.liquibase</groupId>
            <artifactId>liquibase-core</artifactId>
            <version>${liquibase.version}</version>
        </dependency>
    </dependencies>
    <configuration>
        <changeLogFile>src/main/resources/dbchangelog.xml</changeLogFile>
        <driver>org.postgresql.Driver</driver>
        <url>jdbc:postgresql://127.0.0.1:5432/postgres?prepareThreshold=0</url>
        <username>postgres</username>
        <password>123</password>
        <promptOnNonLocalDatabase>false</promptOnNonLocalDatabase>
    </configuration>
</plugin>
{% endhighlight %}

For the Liquibase usage, you need to define changelog and SQL script itself.

{% highlight xml %}
<databaseChangeLog
        xmlns="http://www.liquibase.org/xml/ns/dbchangelog"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.liquibase.org/xml/ns/dbchangelog
           http://www.liquibase.org/xml/ns/dbchangelog/dbchangelog-3.6.xsd">

<changeSet id="fillTestTable">
    <sqlFile relativeToChangelogFile="true" path="postgresql/fillTable.sql" />
</changeSet>

</databaseChangeLog>
{% endhighlight %}

In a root tag, you need to define the changeset. It must have a unique id and the path to the SQL file (relative or absolute). 

The SQL file can contain DDL and DML queries.

{% highlight sql %}
insert into test(test_name, geog)
select n as test_name, ST_SetSRID( ST_Point(random() * 10, random() * 10), 4326)::geography as geog
from unnest(ARRAY['test0',
'test1',
...]) n
on conflict do nothing;
{% endhighlight %}

The result of this SQL script execution will be inserted as many records as many elements you define in the array.

In this script, 'geog' is a column with the geography PostGIS type. The minimal configuration for geography is longitude, latitude, and SRID (Spatial Reference System Identifier).
Latitude and longitude are set for the point by calling ST_Point(double, double) function.
Then, set SRID via ST_SetSRID and cast to the geography type with '::' or cast operator.

The next step is setting application properties.

{% highlight console %}
#Spring Data general properties
spring.datasource.url=jdbc:postgresql://postgres.default.svc.cluster.local:5432/postgres
spring.datasource.username=postgres
spring.datasource.password=123
spring.jpa.show-sql=true
spring.datasource.driver-class-name=org.postgresql.Driver
#Update used for JPA schema creation, if you use Liquibase, set this property to none. 
spring.jpa.hibernate.ddl-auto=update
logging.level.org.hibernate.type.descriptor.sql.BasicBinder=TRACE
#PostGis specific prop
spring.jpa.properties.hibernate.dialect=org.hibernate.spatial.dialect.postgis.PostgisDialect
#Liquibase specific prop
spring.liquibase.enabled=false
spring.liquibase.change-log=classpath*:dbchangelog.xml
{% endhighlight %}

Documentation for this project based on OpenApi v3, so we can use springdoc-openapi for Swagger UI.
You need to add the dependency in pom.xml.

{% highlight xml %}
<dependency>
    <groupId>org.springdoc</groupId>
    <artifactId>springdoc-openapi-ui</artifactId>
    <version>${swagger.version}</version>
</dependency>
{% endhighlight %}

For proper Jackson JSON conversion, you should add JtsModule Bean in the configuration.

{% highlight java %}
@Configuration
public class JacksonConfig {
  @Bean
  public JtsModule jtsModule() {
    return new JtsModule();
  }
}
{% endhighlight %}

The next step is model creation.

{% highlight java %}
@Entity
public class Test implements Serializable {
    // identity + int = serial type in postgres. identity + long = bigserial. 
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;
    // column definition define postgres column type
    @Column(columnDefinition = "geography")
    private Geometry geog;
    // Constructor, getters and setters should be here
}
{% endhighlight %}


Geography is a binary PostGIS type defined by longitude, latitude, SRID. Other way is conversion from EWKT( Extended Well-Known Text/Binary). EWKT example: SRID=4326;POINT(37.617635 55.755814).

PostGIS provides a lot of useful functions for GIS operations.
You can create PostGIS objects in Java.

{% highlight java %}
GeometryFactory geometryFactory = new GeometryFactory();
Coordinate coordinate = new Coordinate(x, y);
Point point = geometryFactory.createPoint(coordinate);
point.setSRID(4326);

{% endhighlight %}

Then, use this object in the native query.
In this example, query result is three nearest objects to the provided point.

{% highlight java %}
@Query(value = "SELECT * FROM public.test ORDER BY ST_Distance(geog,  :geom ) LIMIT 3", nativeQuery = true)
List<Test> findNearest(final Point geom);
{% endhighlight %}

In alternative, you can create a fully native query.

{% highlight java %}
@Transactional
@Modifying
@Query(value = "insert into test(test_name, geog) values (:name, ST_SetSRID(ST_Point( :lat, :lon ), 4326)\\:\\:geography)", nativeQuery = true)
void createOrUpdate(final String name, final Double lat, final Double lon);
{% endhighlight %}

Let's deploy this application to the k8s cluster.
All that we need for installation of PostgreSQL + PostGIS extension in the k8s is configuration yaml.

For the PostgreSQL + PostGIS deployment, let's create k8s config. This config contains the ConfigMap with
credentials, PersistentVolume and PersistentVolumeClaim, Deployment and Service.
You should save it to the k8s folder as postgres.yml.

{% highlight yaml %}
apiVersion: v1
kind: ConfigMap
metadata:
  name: postgres-config
  labels:
    app: postgres
data:
  POSTGRES_DB: "postgres"
  POSTGRES_USER: "postgres"
  POSTGRES_PASSWORD: "123"
---
kind: PersistentVolume
apiVersion: v1
metadata:
  name: postgres-pv-volume
  labels:
    type: local
    app: postgres
spec:
  storageClassName: manual
  capacity:
    storage: 1Gi
  accessModes:
    - ReadWriteMany
  hostPath:
    path: "/mnt/data"
---
kind: PersistentVolumeClaim
apiVersion: v1
metadata:
  name: postgres-pv-claim
  labels:
    app: postgres
spec:
  storageClassName: manual
  accessModes:
    - ReadWriteMany
  resources:
    requests:
      storage: 1Gi
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: postgres
  labels:
    app: postgres
spec:
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
        - name: postgres
          image: postgis/postgis:latest
          imagePullPolicy: "IfNotPresent"
          ports:
            - containerPort: 5432
          envFrom:
            - configMapRef:
                name: postgres-config
          volumeMounts:
            - mountPath: /var/lib/postgresql/data
              name: postgredb
      volumes:
        - name: postgredb
          persistentVolumeClaim:
            claimName: postgres-pv-claim
---
apiVersion: v1
kind: Service
metadata:
  name: postgres
  labels:
    app: postgres
spec:
  type: NodePort
  ports:
   - port: 5432
  selector:
   app: postgres
{% endhighlight %}
     
Then, create a config for the application to define Deployment and Service.

{% highlight yaml %}
apiVersion: apps/v1
kind: Deployment
metadata:
  name: postgis-example-deployment
  labels:
    app: postgis-example
spec:
  replicas: 1
  selector:
    matchLabels:
      app: postgis-example
  template:
    metadata:
      labels:
        app: postgis-example
    spec:
      containers:
        - name: postgis-example
          imagePullPolicy: Never
          image: example/postgis:2
          ports:
            - containerPort: 8080
---
apiVersion: v1
kind: Service
metadata:
  name: postgis-example
  labels:
    app: postgis-example
spec:
  type: NodePort
  ports:
    - port: 8080
  selector:
    app: postgis-example
{% endhighlight %}

With the local docker-machine, you should pay attention to imagePullPolicy property.

{% highlight yaml %}
imagePullPolicy: Never
{% endhighlight %}

After all these preparations, build the application (by 'mvn clean install' command) and 
follow these steps.

Go to the root of the application via cd.

Set the local docker repository.

{% highlight console %}
minikube -p minikube docker-env | Invoke-Expression
{% endhighlight %}

Build a local docker image for the application with tag name example/postgis:2.

{% highlight console %}
docker build -t example/postgis:2 .
{% endhighlight %}

Deploy PostgreSQL and PostGIS in the k8s cluster.

{% highlight console %}
kubectl apply -f .\k8s\postgres.yml
{% endhighlight %}

Deploy the application.

{% highlight console %}
kubectl apply -f .\k8s\deployment.yaml
{% endhighlight %}

Then, forward the port for the local access.

{% highlight console %}
kubectl port-forward service/postgis-example 8081:8080
{% endhighlight %}

After this, you can open OpenApi UI by [this link](http://127.0.0.1:8081/swagger-ui/index.html?configUrl=/v3/api-docs/swagger-config#/)

The source code of the application is available on [Github](https://github.com/bocharoviliyav/postgis-example).
