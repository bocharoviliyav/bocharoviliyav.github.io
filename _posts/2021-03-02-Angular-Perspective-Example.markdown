---
layout: post
title:  "Using Perspective in Angular"
date:   2021-03-02 01:00:00 +0400
categories: Angular
tags: Angular JavaScript TypeScript 
---
In this article, I'd like to submit the tiny guide for Perspective usage in the Angular application.
Perspective is the powerful data visualization component. It is based on JS + WebAssebmly or Python, supports Apache Arrow, CSV, JSON formats. 
More information about Perspective is available by [this link](https://perspective.finos.org).

First of all, we need an Angular application. If you don't have one, you can create it by calling the command below.

{% highlight console %}
ng new name-of-app
{% endhighlight %}

The second step is adding the Perspective dependencies in package.json:

{% highlight json %} 
{
    "dependencies": {
        "@finos/perspective": "^0.6.2",
        "@finos/perspective-viewer": "^0.6.2",
        "@finos/perspective-viewer-d3fc": "^0.6.2",
        "@finos/perspective-viewer-datagrid": "^0.6.2",
        "@finos/perspective-viewer-hypergrid": "^0.5.2",
        "@finos/perspective-webpack-plugin": "^0.6.2", 
    },
    "devDependencies": {
        "@webcomponents/webcomponentsjs": "^2.5.0", 
    }
}
{% endhighlight %}

The next step is providing the webpack configuration for the perspective-webpack-plugin.
Create webpack.config.js and place this config in it.

{% highlight js %}
import PerspectivePlugin from "@finos/perspective-webpack-plugin";

export const entry = "./in.js";
export const output = {
    filename: "out.js",
    path: "build"
};
export const plugins = [new PerspectivePlugin()];

{% endhighlight %}

Then, in the angular.json we need to add the webcomponent.js asset's configuration.

{% highlight json %}
{
  "projects": {
    "perspective-angular": {
      "architect": {
        "build": {
          "options": {
            "assets": [
              "src/favicon.ico",
              "src/assets",
              {
                "glob": "**/*.js",
                "input": "node_modules/@webcomponents/webcomponentsjs",
                "output": "node_modules/@webcomponents/webcomponentsjs"
              }
            ]
          }
        }
      }
    }
  }
}
{% endhighlight %}

We need to edit the polyfills.ts file. 
Add ' (window as any).global = window; ' for the node compatibility.

The main.ts should look like this:

{% highlight js %}
import {enableProdMode} from '@angular/core';
import {platformBrowserDynamic} from '@angular/platform-browser-dynamic';

import {AppModule} from './app/app.module';
import {environment} from './environments/environment';

declare global {
  interface Window {
    WebComponents: {
      ready: boolean;
    }
  }
}

if (environment.production) {
  enableProdMode();
}

function bootstrapModule() {
  platformBrowserDynamic()
  .bootstrapModule(AppModule)
  .catch(err => console.log(err));
}

if (window.WebComponents.ready) {
  bootstrapModule();
} else {
   window.addEventListener('WebComponentsReady', bootstrapModule);
}

{% endhighlight %}

In the index.html, in the head tag, add the following code.

{% highlight html %}
  <script src="node_modules/@webcomponents/webcomponentsjs/webcomponents-loader.js"></script>
  <script>
    if (!window.customElements) {
      document.write('<!--');
    }
  </script>
  <script src="node_modules/@webcomponents/webcomponentsjs/custom-elements-es5-adapter.js"></script>
  <!-- ! DO NOT REMOVE THIS COMMENT, WE NEED ITS CLOSING MARKER -->
  <script src="https://unpkg.com/@finos/perspective-viewer-d3fc"></script>
{% endhighlight %}

Manual import perspective-viewer-d3fc from the CDN is a temporary solution for chart visualization fixing.

Then, we need to provide the custom element schema in the application module file.

{% highlight js %}
import { NgModule,CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
@NgModule({
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
{% endhighlight %}

After all these preparations, we can configure our components.

In the less (css/sass/scss) component's file, add import Perspective's themes, and feel free to provide your own styles.

{% highlight css %}
@import "../../node_modules/@finos/perspective-viewer/src/themes/all-themes.less";

perspective-viewer {
  position: relative;
  width: 100%;
  height: 600px;
}
{% endhighlight %}

Add the perspective-viewer in the component's html.

{% highlight html %}
<perspective-viewer class='perspective-viewer-material-dense'></perspective-viewer>
{% endhighlight %}

The last step is component.ts configuration. Provide necessary imports, define the worker, provide data to the viewer.

{% highlight js %}
import {Component, OnInit} from '@angular/core';
import {HTMLPerspectiveViewerElement} from '@finos/perspective-viewer';
import perspective, {PerspectiveWorker} from '@finos/perspective';
import '@finos/perspective-viewer';
import '@finos/perspective-viewer-hypergrid';
import '@finos/perspective-viewer-datagrid';
import '@finos/perspective';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.less'],
})
export class AppComponent implements OnInit {
  private worker: PerspectiveWorker;

  constructor() {
    this.worker = perspective.worker();
  }

  ngOnInit() {
    const viewer: HTMLPerspectiveViewerElement = document.getElementsByTagName('perspective-viewer')[0] as HTMLPerspectiveViewerElement;
    const table = this.worker.table(this.getData());
    viewer.load(table);
    viewer.toggleConfig();
    viewer.editable = true;
    viewer.plugin = 'hypergrid';
  }

  private getData() : Object[] {
    return [
      {
        "LatD": 41,
        "LatM": 5,
        "LatS": 59,
        "NS": "N",
        "LonD": 80,
        "LonM": 39,
        "LonS": 0,
        "EW": "W",
        "City": "Youngstown",
        "State": " OH"
      },
      {
        "LatD": 42,
        "LatM": 52,
        "LatS": 48,
        "NS": "N",
        "LonD": 97,
        "LonM": 23,
        "LonS": 23,
        "EW": "W",
        "City": "Yankton",
        "State": " SD"
      }
    ]
  }
}

}

{% endhighlight %}

That's all!
The source code of this example is available on [Github](https://github.com/bocharoviliyav/perspective-angular).


