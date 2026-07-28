FROM node:20-alpine

WORKDIR /app

# Install system dependencies needed by Baileys
RUN apk add --no-cache python3 make g++ git

COPY package*.json ./
RUN npm install --production

COPY . .

# Create auth sessions directory
RUN mkdir -p auth_sessions

EXPOSE 3001

CMD ["node", "index.js"]
