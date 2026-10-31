# Dev runtime for the sandbox: base Node image + the system libraries Chromium
# needs. Application source is bind-mounted at runtime (nothing is baked here).
FROM node:22-bookworm-slim

# Chromium system dependencies (installed via Playwright's own apt list).
RUN npm i -g playwright@1.64.1 --no-audit --no-fund \
 && playwright install-deps chromium \
 && npm rm -g playwright \
 && rm -rf /root/.npm /var/lib/apt/lists/*

WORKDIR /app
