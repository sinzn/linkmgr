FROM node:alpine
WORKDIR /app
COPY package.json .
RUN npm i --production
COPY . .
CMD ["node", "server.js"]
