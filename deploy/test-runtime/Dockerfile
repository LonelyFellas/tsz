FROM node:24.19.0-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends nginx curl openssl procps util-linux && rm -rf /var/lib/apt/lists/* && ln -s /usr/local/bin/node /usr/bin/node
