---
layout: post
title:  "SwaggerHub upload Gradle plugin"
date:   2022-01-27 01:00:00 +0400
categories: Kotlin
published: true
---
Here I'd like to present a short overview of Gradle Plugin creation using Kotlin.

The exhaustive guide can be founded in [Official Documentation](https://docs.gradle.org/current/userguide/custom_plugins.html) ,
but IMHO, it may be complicated. 

This topic spitted into a few main parts:
- [Task creation](#task-creation)
- [Extension & Plugin setting](#extension-and-plugin-setting)
- [build.gradle.kts](#gradle-build)
- [Local testing](#local-testing)

As an example, I will rewrite the upload task from [SwaggerHub Gradle Plugin](https://github.com/swagger-api/swaggerhub-gradle-plugin).


## Task creation

For the simple task creation, we need to extend DefaultTask:

{% highlight kotlin %}

    open class SwaggerhubUploadTask : DefaultTask() {}

{% endhighlight %}

The second step is the @TaskAction definition. Note, the  task will throw Gradle Exception,
so let's declare it.

{% highlight kotlin %}

    @TaskAction
    @Throws(GradleException::class)
    fun uploadDefinition() {
    }

{% endhighlight %}

The next important thing is Input variables. These fields should be marked as lateinit or
have a default value.

{% highlight kotlin %}

    @get:Input
    lateinit var owner: String
    @get:Input
    var skipOnError: Boolean = true

{% endhighlight %}

If the file path should be additionally validated before using, use  ```@get:InputFile```.

{% highlight kotlin %}

    @get:Input
    lateinit var owner: String
    @get:Input
    var skipOnError: Boolean = true

{% endhighlight %}

If the main logic throws an exception, it can be caught and omitted by the external plugin parameter.

{% highlight kotlin %}

        try {
            val content = String(Files.readAllBytes(Paths.get(inputFile)), Charset.forName("UTF-8"))
            val swaggerHubRequest = SwaggerHubRequest(api, owner, version, content, private)

            swaggerHubClient!!.saveDefinition(swaggerHubRequest, skipOnError)
        } catch (e: IOException) {
            val message = e.message ?: "IO exception was happen"
            if (!skipOnError) {
                throw GradleException(message, e)
            } else {
                LOGGER.info(message)
            }
        }

{% endhighlight %}

The logger can be created by a companion object:

{% highlight kotlin %}

    import org.gradle.api.logging.Logging
    import org.slf4j.Logger

    companion object {
        private val LOGGER: Logger = Logging.getLogger("root")
    }

{% endhighlight %}


## Extension and Plugin setting

Firstly, the SwaggerhubPlugin class should implement ```Plugin<Project>```. 

For the "caching" of plugin execution, inputs and output can be used. 
In this case, I assume that OpenApi json was generated during the test phase,
If tests are not executed, our task will be skipped too.
The plugin must have an "apply" function, which receives Project as a parameter.
In this function, we are defined tasks and set parameters from Extension.


{% highlight kotlin %}

    var fName = "tmp/swaggerhub/uploadPlugin"

    fun generateOutput(fName: String, p: Project) {
        val time = LocalDateTime.now()
        val out = p.layout.buildDirectory.file(fName).get().asFile
        out.writeText("$time", Charset.forName("UTF-8"))
    }

        override fun apply(project: Project) {
        with(project) {
            val extension = extensions.create<SwaggerhubPluginExtension>("swaggerhubUpload")

            tasks.register("swaggerhubUpload", SwaggerhubUploadTask::class.java) {
                dependsOn("test")
                inputs.files(layout.files(tasks.getByName("test").outputs))
                outputs.file(layout.buildDirectory.file(fName))

                api = extension.api.getOrElse("")
                // other params setting

                doLast {
                    generateOutput(fName, project)
                }
            }

        }
    }

{% endhighlight %}

Extension should be open or abstract class:

{% highlight kotlin %}

    abstract class SwaggerhubPluginExtension {
      abstract val owner: Property<String>
      abstract val skipOnError: Property<Boolean>
      abstract val port: Property<Int>
    }

{% endhighlight %}

## Gradle Build

In the build.gradle.kts for this plugin, step one is necessary plugin definition.
com.github.johnrengelman.shadow plugin is significant for packing dependencies into resulting jar.

{% highlight kotlin %}

    plugins {
      `kotlin-dsl`
      `java-library`
      kotlin("jvm") version "1.7.10"
      id ("com.github.johnrengelman.shadow") version "7.1.2"
    }

{% endhighlight %}

Shadow plugin tasks should be set according to [documentation](https://imperceptiblethoughts.com/shadow/):

{% highlight kotlin %}

    tasks {
      named<com.github.jengelman.gradle.plugins.shadow.tasks.ShadowJar>("shadowJar") {
          archiveBaseName.set("shadow")
          mergeServiceFiles()
          manifest {
              attributes(mapOf("Main-Class" to "com.github.csolem.gradle.shadow.kotlin.example.App"))
          }
      }
    }

    tasks {
      build {
        dependsOn(shadowJar)
      }
    }

{% endhighlight %}



For these plugins and dependencies let's provide repositories:

{% highlight kotlin %}

    repositories {
      mavenCentral()
      gradlePluginPortal()
    }

{% endhighlight %}

And last but not least is our plugin registration:

{% highlight kotlin %}

    gradlePlugin {
      plugins {
          register("swaggerhub-plugin") {
              id = "swaggerhub-plugin"
              displayName = "swaggerhub-plugin"
              implementationClass = "blog.bocharoviliyav.swaggerhub.SwaggerhubPlugin"
          }
      }
    }

{% endhighlight %}


## Local testing

Manual local test creation can be done by another module definition in the same project.
Firstly, create the module with a test json file and a build.gradle (let's use groovy one).

{% highlight gradle %}

    buildscript {
      repositories { flatDir name: 'libs', dirs: "../plugin/build/libs" }
      dependencies { classpath 'blog.bocharoviliyav.swaggerhub:shadow-1.0-SNAPSHOT-all' }
    }

    apply plugin: 'swaggerhub-plugin'

    swaggerhubUpload {
      api = 'testApi'
      inputFile = "./testApi.json"
      token = 'token'
      owner = 'owner'
      skipOnError = false
    }

{% endhighlight %}

The best way to test is written unit or integration tests, but here is
the easiest way :)
Buildscript defines the path of the plugin jar and sets dependency using classpath.
Next, apply our plugin and set the required parameters.. 

The test can be run after ```gradle build``` command execution in the plugin module and in the test module.
Then use ```gradle swaggerhubUpload --stacktrace```.
```stacktrace``` flag provides complete stacktrace in case of exceptions.


That's all!
The source code of this example is available on [Github](https://github.com/bocharoviliyav/swaggerhub-plugin).
