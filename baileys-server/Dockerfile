FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

# Create auth sessions directory
RUN mkdir -p auth_sessions

EXPOSE 3001

CMD ["node", "index.js"]
