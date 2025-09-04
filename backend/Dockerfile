FROM node:20-alpine

WORKDIR /app

# 패키지 설치
COPY package*.json ./
RUN npm ci --omit=dev

# 소스 복사
COPY . .

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "app.js"]