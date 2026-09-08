# ---------- stage 1: build the React client ----------
FROM node:20-alpine AS client-build
WORKDIR /app/client

COPY client/package.json client/package-lock.json ./
RUN npm ci

COPY client/ ./
RUN npm run build


# ---------- stage 2: server + built client ----------
FROM node:20-alpine
WORKDIR /app/server

ENV NODE_ENV=production

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

# migrations/, assets/ and other-tools/ all ship in the image so the container
# can build and seed its own database on first boot.
COPY server/ ./

# index.js serves this directory when it exists.
COPY --from=client-build /app/client/dist /app/client/dist

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
# Strip CR in case the file was checked out on Windows with CRLF endings,
# which would otherwise make the shebang unusable inside Alpine.
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh \
 && chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "index.js"]
