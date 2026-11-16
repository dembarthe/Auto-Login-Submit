FROM node:26-alpine
RUN apk add --no-cache zip
WORKDIR /app
COPY src ./src
COPY scripts ./scripts
CMD ["sh", "scripts/build.sh"]
