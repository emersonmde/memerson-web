---
title: Hello, Gatsby
date: '2024-02-04T10:46:23.000Z'
description: A look at using Gatsby, a static site generator, with GitHub Actions and Pages.
---

I recently discovered a great podcast, [Programming Throwdown](https://www.programmingthrowdown.com/),
that featured [Gatsby](https://www.gatsbyjs.com/) in a prior episode. It was
described as a quick and easy way to generate static websites while still
harnessing the power and compatibility of React. At the time I pictured a
templating engine, similar to Jekyll, with a build process that made it easy to
deploy static content. I wasn't prepared for the power and flexibility that
Gatsby offers right out of the box.

A few years ago, I decided to build a [personal website](https://memerson.dev/) using React. My goal was
to approach the project much the same way I would at work. I wanted to have a
[React website](https://github.com/emersonmde/memerson) deployed in S3 with CloudFront that stored posts in DynamoDB.
Another major goal was to have all of this defined using the [AWS CDK](https://github.com/emersonmde/memerson/tree/main/infrastructure) including a
fully automated [CI/CD pipeline](https://github.com/emersonmde/memerson/blob/main/infrastructure/lib/pipeline-stack.ts). I was able to get a basic website set up using
Cognito for authentication, API Gateway and Lambda for the backend, and a
pre-built [WYSIWYG editor component](https://github.com/jpuri/react-draft-wysiwyg) to create and edit posts all deployed using
AWS Code Pipeline.

Despite the progress, I still wasn't happy with the editor or the pipeline.
Also, to no one's surprise, CDK caused additional headaches that made changing
and testing the backend or the pipeline a multi-hour endeavor. The thought of
wrestling with the CDK or the pre-built WYSIWYG component meant I just avoided
making any improvements and eventually abandoned the idea of blogging
altogether.

### Enter GitHub Actions

My first exposure to [GitHub Actions](https://github.com/features/actions) was from the book [Zero To Production In Rust](https://www.zero2prod.com/index.html?country_code=US)
which has a section on CI/CD pipelines. The book provides a single workflow
configuration file, less than 100 lines, that can be used as a start for any Rust
project that includes building, testing, linting, formatting, and code coverage.
After years of working with proprietary and public CI/CD solutions, the ease of
use and general applicability of GitHub Actions blew me away.

One of the best parts of GitHub Actions is the extensive community that have built
out many common CI/CD tasks, one of which is deploying directly to [GitHub Pages](https://pages.github.com/).
Without the need to setup any keys, permissions, or targets, an action such as
[JamesIves/github-pages-deploy-action](https://github.com/JamesIves/github-pages-deploy-action) can deploy any directory from the build
directly to a branch (such as `gh-pages`).

Here is the workflow I've been using with Gatsby (more on this in a minute), but it
should work with any node build:

```yaml
name: Build
on:
  push:
    branches:
      - main
permissions:
  contents: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Use Node.js
        uses: actions/setup-node@v4.0.1
        with:
          node-version: '20'
      - name: Install Dependencies
        run: npm install
      - name: Build
        run: npm run build
      - name: Deploy
        uses: JamesIves/github-pages-deploy-action@v4.5.0
        with:
          branch: gh-pages
          folder: public
```

Each `uses` directive invokes an action with the parameters specified in the `with`
block. Need to add a step, change the triggers, or re-order steps? No problem,
each time this file is pushed upstream, the workflow automatically changes.

This was exactly what I was looking for. The best part about this workflow, it deploys
to GitHub Pages which is completely free! No more worrying about the hidden cost
of auto scaling serverless solutions. The last piece of the puzzle was a way to
manage and edit blog posts as markdown files without the need to create a bespoke
backend solution. Thats where Gatsby comes in.

### The Almost Great Gatsby

[Gatsby](https://www.gatsbyjs.com/) is an open source framework based on React that includes a
[GraphQL data layer](https://www.netlify.com/platform/connect/) and works out of the box to compile
and build fully featured React websites. There are also many starter templates that
make it easy to get up and running. In this case, I chose to start with the
[Gatsby's Starter Blog](https://github.com/gatsbyjs/gatsby-starter-blog):

1. Install Gatsby:

```sh
npm install -g gatsby-cli
```

2. Create new project from a template:

```sh
gatsby new blog https://github.com/gatsbyjs/gatsby-starter-blog
```

3. Run the development site:

```sh
cd blog
gatsby develop
```

Out of the box the `gatsby-starter-blog` is configured to use Gatsby's GraphQL data
layer to find markdown files corresponding to blog posts and combine that with website
metadata. The results are then rendered as HTML using React components.

This works incredibly well. Each blog post is plain markdown in a directory. By using
markdown saved locally, I can use something like [Obsidian](https://obsidian.md/), a markdown
focused editor with vim motions, to create and edit posts. The metadata is defined in
the `gatsby-config.js` file which makes it easy to reference in any component.
Each query is run at build time to generate the necessary static assets which can
be uploaded to any static website host. Also since Gatsby is a React based
framework, there was no need for me to learn yet another frontend framework.

Alright, what's the catch? So far everything I've wanted to do has been on the
happy path. Its not clear how much trouble it would be to customize Gatsby,
although it does support plugins. Also including a full GraphQL data layer on
top of React with additional support for SEO, Server Side Rendering, Deferred
Static Generation, and more means this is anything but light weight. I'm already
not a big fan of learning GraphQL to access files and data, but only time will tell
if scaling or extending this website in the future proves to be more trouble than
it's worth.

### Final Thoughts

Overall I'm really happy with the current setup. GitHub Actions and Pages have
been a true pleasure to work with compared to some other solutions. I'm excited to
take full advantage of the power and speed of Gatsby, but cautious of the complexity
it may add when maintaining this project long term.

Interested in what the final result looks like? Check out the [repo for this site on
GitHub](https://github.com/emersonmde/emersonmde.github.io).
