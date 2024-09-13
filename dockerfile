FROM node:latest
WORKDIR /node
COPY package*.json ./
RUN npm install
COPY . .
CMD "npm run start"