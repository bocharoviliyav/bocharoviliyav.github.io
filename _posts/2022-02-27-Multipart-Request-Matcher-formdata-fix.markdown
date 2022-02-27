---
layout: post
title:  "MultipartRequestMatcher formdata fix"
date:   2022-01-27 01:00:00 +0400
categories: Java
---

{% highlight java %}
void serverRequested() {

        LinkedMultiValueMap<String, Object> map = new LinkedMultiValueMap<>();
        map.add("file", PDF_FILE.getResource());
        map.add("additional_param", "123");


        restServiceServer.expect(requestTo(new URI("localhost")))
                .andExpect(method(HttpMethod.POST))
                .andExpect(MultipartRequestMatcher.value(map))
                .andRespond(withStatus(HttpStatus.OK).contentType(APPLICATION_JSON)
                        .body("123"));
    }
{% endhighlight %}


{% highlight java %}
import org.springframework.http.MediaType;
import org.springframework.http.client.ClientHttpRequest;
import org.springframework.http.converter.MultipartFormConverter;
import org.springframework.mock.http.client.MockClientHttpRequest;
import org.springframework.test.web.client.RequestMatcher;
import org.springframework.util.LinkedMultiValueMap;

import javax.servlet.ServletException;
import java.io.IOException;

import static org.springframework.test.util.AssertionErrors.assertEquals;

public abstract class MultipartRequestMatcher implements RequestMatcher {

    @Override
    public final void match(ClientHttpRequest request) throws AssertionError {
        try {
            MockClientHttpRequest mockRequest = (MockClientHttpRequest) request;
            matchInternal(mockRequest);
        } catch (Exception ex) {
            throw new AssertionError("Failed to parse expected or actual Multipart request content", ex);
        }
    }

    abstract void matchInternal(MockClientHttpRequest request) throws IOException, ServletException;

    public static RequestMatcher value(final LinkedMultiValueMap<String, Object> expectedValue) {
        return new MultipartRequestMatcher() {
            @SuppressWarnings("raw")
            protected void matchInternal(MockClientHttpRequest request) throws IOException {
                MultipartFormConverter converter = new MultipartFormConverter();
                MockClientHttpRequest outputMessage = new MockClientHttpRequest();
                MediaType requestContentType = request.getHeaders().getContentType();
                converter.write(expectedValue, requestContentType, outputMessage);

                assertEquals("Request content", outputMessage.getBodyAsString(), request.getBodyAsString());
            }
        };
    }
}
{% endhighlight %}


{% highlight java %}

String boundaryStr = contentType.getParameter("boundary");
byte[] boundary;
if (boundaryStr == null) {
boundary = generateMultipartBoundary();
boundaryStr = new String(boundary, StandardCharsets.US_ASCII);
} else {
boundary = boundaryStr.getBytes(StandardCharsets.US_ASCII);
}
parameters.put("boundary", boundaryStr);

{% endhighlight %}