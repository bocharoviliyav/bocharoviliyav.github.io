---
layout: post
title:  "Migration Java application to Kubernetes. JVM optimisation"
date:   2021-02-06 00:03:00 +0400
categories: Java
---
That is the third part of the k8s migration articles. Here are few things about JVM performance monitoring and optimization.
In k8s, Java applications usually run without any JVM configurations or with just like this one:

{% highlight console %}
java -jar -Xms=req -Xmx=lim Application.jar
{% endhighlight %}

In this case, JVM 10 can use a Serial GC if a machine has less than two available CPUs and two GB of RAM;
set a large amount of memory reservation for the code cache;
use a bigger thread stack size than necessary, etc.

Let's see how we can change the default settings of JVM.

We can start our application with additional JVM params:

**-Xms** parameter sets the initial heap size.

**-Xmx** set the maximum heap size.

**-Xss** defines thread stack size.

**-XX:ReservedCodeCacheSize** set maximum code cache size. Used for JIT compiler.

**-XX:CodeCacheMinimumFreeSpace** parameter set minimum code cache size.

**-XX:CodeCacheExpansionSize** set increase size.

**-XX:+UseG1GC** enable G1 GC instead of the default.

**-XX:MaxGCPauseMillis** set the target for the maximum GC pause time. JVM can exceed this target.

**-XX:ParallelGCThreads** set the number of threads used for stop-the-world phases.

**-XX:ConcGCThreads** set the number of threads used for concurrent phases.

**-XX:InitiatingHeapOccupancyPercent** set percentage of the heap occupancy to start a concurrent GC cycle.

**-XX:MetaspaceSize** the value when a Full GC starts.

**-XX:MaxMetaspaceSize** maximum metaspace size.

**-XX:MinMetaspaceExpansion** the minimum growth size for a Metaspace.

**-XX:MaxMetaspaceExpansion** the maximum growth size for a Metaspace.

**-XX:+PerfDisableSharedMem** disable writing hsperfdata in persistence storage.

**-XX:MaxDirectMemorySize** limit on the amount of memory reservation for all Direct Byte Buffers.

**-XX:+AlwaysActAsServerClassMachine** parameter that disables Serial GC usage in cases of the small heap size.

*Pay attention that some of that arguments are deprecated/removed in Java 9+!*


Let's run our application with the default JVM settings and load it with the simple workload.
We can create a Postman collection or manually send requests to the application. 
But jMeter is a wide-spreading solution for load testing.

Run jMeter and create tread group in our workload:

<img src="/assets/images/jvm_perf/jMeterTG.png"/>

Set 10 parallel threads with infinity loop of workload and 10 minutes timeout. 

<img src="/assets/images/jvm_perf/jMeterTGsettings.png"/>

Then create a new HTTP request.

<img src="/assets/images/jvm_perf/jMeterHttp.png"/>

Provide the protocol, the host, the port, the path, choose the type of the request.

<img src="/assets/images/jvm_perf/jMeterHttpSettings.png"/>

Create Graph Results to visualize our workload.

<img src="/assets/images/jvm_perf/jMeterGR.png"/>

Then, run the test plan.
Check results and Grafana metrics for JVM and k8s.

<img src="/assets/images/jvm_perf/jMeterResult.png"/>

The main thing here is the throughput = 42.9/minute.

<img src="/assets/images/jvm_perf/JVMMem.png"/>

We can see that the application reserve 15 times more heap than consume.

<img src="/assets/images/jvm_perf/JVMMemNonHeap.png"/>

You can reduce Compressed Class Space down to 32m and slightly increase Metaspace.

<img src="/assets/images/jvm_perf/K8sMem.png"/>

K8s container consumes around 500m, but while the workload increase consumes almost **900m**!


We can try to reduce general parameters, apply new settings, and rerun the test plan.

{% highlight console %}
-Xms128M
-Xmx128M
-Xss1024k
-XX:ReservedCodeCacheSize=32M
-XX:CodeCacheExpansionSize=512k
-XX:MaxDirectMemorySize=64M
-XX:CompressedClassSpaceSize=32M
-XX:MaxMetaspaceSize=64M
-XX:+PerfDisableSharedMem
{% endhighlight %}

<img src="/assets/images/jvm_perf/JVMMem2.png"/>

With the strictly defined heap size, JVM starts to use all available space.

<img src="/assets/images/jvm_perf/JVMMemNonHeap2.png"/>

In Non-Heap, we can reduce Compressed Class Space down to 16m and Code Cache down to 32m.

<img src="/assets/images/jvm_perf/K8sMem2.png"/>

There is no peak memory consumption.

Throughput increases up to 43.6/minute with this memory limit reduction.

<img src="/assets/images/jvm_perf/jMeterResult2.png"/>


Unfortunately, when you try to track resource usage in Grafana or analogs, you'll see that JVM consumes more RAM than you set via JVM params.

Container memory consumption 473m.

<img src="/assets/images/jvm_perf/K8sMemContainer.png"/>

But JVM heap + non-heap size 284m.

<img src="/assets/images/jvm_perf/K8sMemJVM.png"/>

That can be the reason for exceeding the container memory limits, and the reason of OOM.

For diving deeper into JVM memory usage, we can use Native Memory Tracking(NMT).
[One of the best topics about NMT](https://shipilev.net/jvm/anatomy-quarks/12-native-memory-tracking/).

In few words, we should run our application with these params:

{% highlight console %}
-XX:+UnlockDiagnosticVMOptions
-XX:NativeMemoryTracking=summary
-XX:+PrintNMTStatistics
{% endhighlight %}

PrintNMTStatistics flag means that NMT statistics will be printed in stdout by SIGTERM signal.
Or you can connect in your pod console and run:

{% highlight console %}
pidof java
{% endhighlight %}

Get the PID of the process and run this program.

{% highlight console %}
jcmd <pid> VM.native_memory summary
{% endhighlight %}

The result looks like this.

{% highlight console %}
Native Memory Tracking:

Total: reserved=355478KB, committed=238634KB
-                 Java Heap (reserved=131072KB, committed=131072KB)
                            (mmap: reserved=131072KB, committed=131072KB) 
 
-                     Class (reserved=33867KB, committed=8779KB)
                            (classes #12874)
                            (  instance classes #11892, array classes #982)
                            (malloc=1099KB #25615) 
                            (mmap: reserved=32768KB, committed=7680KB) 
                            (  Metadata:   )
                            (    reserved=57344KB, committed=49408KB)
                            (    used=49168KB)
                            (    free=240KB)
                            (    waste=0KB =0.00%)
                            (  Class space:)
                            (    reserved=32768KB, committed=7680KB)
                            (    used=7452KB)
                            (    free=228KB)
                            (    waste=0KB =0.00%)
 
-                    Thread (reserved=32977KB, committed=3121KB)
                            (thread #33)
                            (stack: reserved=32888KB, committed=3032KB)
                            (malloc=54KB #194) 
                            (arena=36KB #62)
 
-                      Code (reserved=66988KB, committed=13260KB)
                            (malloc=940KB #5656) 
                            (mmap: reserved=66048KB, committed=12320KB) 
 
-                        GC (reserved=809KB, committed=809KB)
                            (malloc=377KB #673) 
                            (mmap: reserved=432KB, committed=432KB) 
 
-                  Compiler (reserved=248KB, committed=248KB)
                            (malloc=83KB #591) 
                            (arena=165KB #5)
 
-                  Internal (reserved=172KB, committed=172KB)
                            (malloc=168KB #876) 
                            (mmap: reserved=4KB, committed=4KB) 
 
-                     Other (reserved=120KB, committed=120KB)
                            (malloc=120KB #23) 
 
-                    Symbol (reserved=12988KB, committed=12988KB)
                            (malloc=12244KB #329779) 
                            (arena=744KB #1)
 
-    Native Memory Tracking (reserved=5747KB, committed=5747KB)
                            (malloc=8KB #98) 
                            (tracking overhead=5739KB)
 
-        Shared class space (reserved=12288KB, committed=12052KB)
                            (mmap: reserved=12288KB, committed=12052KB) 
 
-               Arena Chunk (reserved=175KB, committed=175KB)
                            (malloc=175KB) 
 
-                   Logging (reserved=5KB, committed=5KB)
                            (malloc=5KB #211) 
 
-                 Arguments (reserved=1KB, committed=1KB)
                            (malloc=1KB #53) 
 
-                    Module (reserved=326KB, committed=326KB)
                            (malloc=326KB #2511) 
 
-                 Safepoint (reserved=8KB, committed=8KB)
                            (mmap: reserved=8KB, committed=8KB) 
 
-           Synchronization (reserved=94KB, committed=94KB)
                            (malloc=94KB #787) 
 
-                 Metaspace (reserved=216KB, committed=216KB)
                            (malloc=216KB #115) 
 
-                   Unknown (reserved=57376KB, committed=49440KB)
                            (mmap: reserved=57376KB, committed=49440KB)
{% endhighlight %}


Java Heap reserved and committed size decreases by -Xms and -Xmx.
Class size depends on Metaspace. Thread size decreases by stack size -Xss. GC size can be changed by CG changing itself.

Use NMT and JVM params for reducing memory consumption and increasing application performance. 
Set k8s request and limits by the NMT results, and do not forget to remove NMT for the production.
