---
layout: post
title:  "SwaggerHub upload gradle plugin"
date:   2022-01-27 01:00:00 +0400
categories: Kotlin
published: false
---

{% highlight kotlin %}
package blog.bocharoviliyav.swaggerhub

import okhttp3.*
import org.gradle.api.DefaultTask
import org.gradle.api.GradleException
import org.gradle.api.logging.Logging
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.InputFile
import org.gradle.api.tasks.TaskAction
import org.slf4j.Logger
import java.io.IOException
import java.nio.charset.Charset
import java.nio.file.Files
import java.nio.file.Paths

data class SwaggerHubRequest(
val api: String,
val owner: String,
val version: String,
val swagger: String,
val isPrivate: Boolean = false
)


open class SwaggerhubUploadTask : DefaultTask() {
@get:Input
lateinit var owner: String

    @get:Input
    lateinit var api: String

    @get:Input
    lateinit var version: String

    @get:Input
    lateinit var token: String

    @get:InputFile
    lateinit var inputFile: String

    @get:Input
    var skipOnError: Boolean = true


    private var swaggerHubClient: SwaggerHubClient? = null
    private val format: String = "json"
    private val isPrivate: Boolean = true
    private val port: Int = 443
    private var host: String = "api.swaggerhub.com"
    private var protocol: String = "https"

    @TaskAction
    @Throws(GradleException::class)
    fun uploadDefinition() {
        swaggerHubClient = SwaggerHubClient(host, port, protocol, token)
        LOGGER.info(
            "Uploading to " + host
                    + ": api: " + api
                    + ", owner: " + owner
                    + ", version: " + version
                    + ", inputFile: " + inputFile
                    + ", format: " + format
                    + ", isPrivate: " + isPrivate
        )
        try {

            val content = String(Files.readAllBytes(Paths.get(inputFile)), Charset.forName("UTF-8"))
            val swaggerHubRequest = SwaggerHubRequest(api, owner, version, content, isPrivate)

            swaggerHubClient!!.saveDefinition(swaggerHubRequest, skipOnError)
        } catch (e: IOException) {
            val message = e.message?: "IO exception was happen"
            if (!skipOnError) {
                throw GradleException(message, e)
            } else {
                LOGGER.info(message)
            }
        } catch (e: GradleException) {
            val message = e.message?: "Gradle exception was happen"
            if (!skipOnError) {
                throw GradleException(message, e)
            } else {
                LOGGER.info(message)
            }
        }
    }

    companion object {
        private val LOGGER: Logger = Logging.getLogger("root")
    }
}

class SwaggerHubClient(
private val host: String,
private val port: Int,
private val protocol: String,
private val token: String
) {

    private val client: OkHttpClient = OkHttpClient()

    @Throws(GradleException::class)
    fun saveDefinition(swaggerHubRequest: SwaggerHubRequest, skipOnError: Boolean) {
        val httpUrl: HttpUrl = getUploadUrl(swaggerHubRequest)
        val mediaType: MediaType? = MediaType.parse("application/json")
        val httpRequest: Request = buildPostRequest(httpUrl, mediaType!!, swaggerHubRequest.swagger)
        try {
            LOGGER.info("Trying to upload OpenApi definition")
            val response: Response = client.newCall(httpRequest).execute()
            if (!response.isSuccessful && !skipOnError) {
                throw GradleException("Failed to upload definition: ${response.body()?.string()}")
            }
        } catch (e: IOException) {
            throw GradleException("Failed to upload definition", e)
        }
        return
    }

    private fun buildPostRequest(httpUrl: HttpUrl, mediaType: MediaType, content: String): Request {
        return Request.Builder()
            .url(httpUrl)
            .addHeader("Content-Type", mediaType.toString())
            .addHeader("Authorization", token)
            .addHeader("User-Agent", "swaggerhub-gradle-plugin")
            .post(RequestBody.create(mediaType, content))
            .build()
    }

    private fun getUploadUrl(swaggerHubRequest: SwaggerHubRequest): HttpUrl {
        return getBaseUrl(swaggerHubRequest.owner, swaggerHubRequest.api)
            .addEncodedQueryParameter("version", swaggerHubRequest.version)
            .addEncodedQueryParameter("isPrivate", swaggerHubRequest.isPrivate.toString())
            .build()
    }

    private fun getBaseUrl(owner: String, api: String): HttpUrl.Builder {
        return HttpUrl.Builder()
            .scheme(protocol)
            .host(host)
            .port(port)
            .addPathSegment("apis")
            .addEncodedPathSegment(owner)
            .addEncodedPathSegment(api)
    }


    companion object {
        private val LOGGER: Logger = Logging.getLogger("root")
    }

}

{% endhighlight %}

That's all!
The source code of this example is available on [Github](https://github.com/bocharoviliyav/).
