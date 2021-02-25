---
layout: post
title:  "Grafana and Prometheus Kubernetes installation"
date:   2021-02-04 23:42:00 +0400
categories: DevOps
---
In this section, I'll show you how to install Prometheus and Grafana in the k8s cluster using Helm (k8s package manager).

> [Prometheus - ] An open-source monitoring system with a dimensional data model, flexible query language, efficient time-series database, and modern alerting approach.

> Grafana allows you to query, visualize, alert on and understand your metrics no matter where they are stored.

Let's start!

For the local k8s cluster, I'll use Minikube.

The first step is a [minikube](https://minikube.sigs.k8s.io/docs/start/) and [helm](https://helm.sh/docs/intro/install/) installation.

{% highlight console %}
choco install minikube
choco install kubernetes-helm
{% endhighlight %}

Then, start the minikube.

{% highlight console %}
minikube start
{% endhighlight %}

The next step is a k8s dashboard installation:

{% highlight console %}
kubectl apply -f https://raw.githubusercontent.com/kubernetes/dashboard/v2.0.0/aio/deploy/recommended.yaml
{% endhighlight %}

After that, create a user and get a token: [link](https://github.com/kubernetes/dashboard/blob/master/docs/user/access-control/creating-sample-user.md).

For the k8s dashboard access we need to create a proxy.
{% highlight console %}
kubectl proxy --address="127.0.0.1" -p 8001 --accept-hosts='^*$'
{% endhighlight %}

For Linux, you can run the proxy process in the foreground using & at the end of the command and switch back to process via fg command.

While proxy running, the dashboard is available by [this link](http://localhost:8001/api/v1/namespaces/kubernetes-dashboard/services/https:kubernetes-dashboard:/proxy/#/settings?namespace=default).

When k8s is ready to use, we need to install Prometheus and Grafana.
One of the easiest ways is using helm.

{% highlight console %}
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add grafana https://grafana.github.io/helm-charts

helm repo update

helm install prometheus prometheus-community/prometheus
helm install grafana grafana/grafana
{% endhighlight %}

Follow installation notes for getting the admin password and forwarding the port.

You can see/edit the Grafana admin account via the k8s dashboard.
Open tab secret, choose grafana, and at the bottom, you'll see necessary fields.

<img alt="Grafana secret" src="/assets/images/grafana/grafanaSecret.webp" width="952" height="891"/>

Then, you should expose grafana service or run port-forwarding.

{% highlight console %}
kubectl port-forward service/grafana 8080:80
{% endhighlight %}

After this, you need to define datasource:

<figure>
  <video width="100%" height="auto" controls loop>
    <source src="/assets/images/grafana/ds.webm" type="video/webm">
  </video>
</figure>

click Add Data Source button, choose Prometheus, define http://prometheus-server:80 as URL, and click Save & Test.

Then you can import any k8s dashboard. With id = 12117, for example.

<figure>
  <video width="100%" height="auto" controls loop>
    <source src="/assets/images/grafana/dash.webm" type="video/webm">
  </video>
</figure>
You can add your application in Prometheus/Grafana.

Let's connect the application from the previous topic to the Prometheus.

We need to add the host into the prometheus.yml configuration file.
In our case, this file stores in ConfigMap.
Open dashboard, choose Config Maps tab, find prometheus-server and detect target config.

{% highlight yaml %}
scrape_configs:
- job_name: prometheus
  static_configs:
  - targets:
    - localhost:9090
{% endhighlight %}

The default Prometheus metric endpoint is '/metrics'. Our application has Prometheus metrics on this endpoint, so we need to add the host and the port (postgis-example.default.svc.cluster.local:8080) as another target.

{% highlight yaml %}
scrape_configs:
- job_name: prometheus
  static_configs:
    - targets:
        - localhost:9090
        - postgis-example.default.svc.cluster.local:8080
{% endhighlight %}
          
<img alt="Prometheus JVM source" src="/assets/images/grafana/PromAddJvm.webp" width="1504" height="859"/>

Then, forward the port for prometheus-server and send a POST request to the http://127.0.0.1:9090/-/reload.

{% highlight console %}
kubectl port-forward service/prometheus-server 9090:80
curl -X POST http://127.0.0.1:9090/-/reload
{% endhighlight %}

Next, you can add a JVM-specific dashboard.
Import via Grafana.com -> 4701 -> Load -> select prometheus datasource -> Import.

You must see a dashboard like this.

<img alt="JVM Dashboard" src="/assets/images/grafana/PromJvm.webp" width="1779" height="901"/>

All this stuff can be used in the following article.
