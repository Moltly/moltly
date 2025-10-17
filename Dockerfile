FROM oven/bun:latest AS base

WORKDIR /app

COPY package*.json bun.lock* ./

RUN bun install

COPY . .

RUN bun run build

EXPOSE 5777

ENV PORT=5777

CMD ["bun", "run", "start", "--", "-p", "5777"]
