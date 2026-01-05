# Use Node.js 20 Alpine as base image
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* yarn.lock* ./

# Install dependencies
RUN npm install

# Copy application code
COPY . .

# Expose port
EXPOSE 5000

# Set environment to production
ENV NODE_ENV=production

# Start the server
CMD ["npm", "start"]
