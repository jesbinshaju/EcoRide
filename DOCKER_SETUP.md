# EcoRide Docker Setup Guide

## Prerequisites
- Docker Desktop (version 20.10+)
- Docker Compose (usually included with Docker Desktop)

## What Was Added for Frontend

✅ **API Configuration System**
- Created `client/src/config.js` - Centralizes API endpoint configuration
- Environment variables (`VITE_API_URL`) for dynamic API URL
- Auto-generates correct URLs for both development and Docker environments

✅ **Updated All API Calls**
- Replaced 10+ hardcoded `localhost:5000` URLs with dynamic `API_CONFIG.BASE_URL`
- Socket.io now uses dynamic URL: `API_CONFIG.SOCKET_URL`
- Works seamlessly in Docker (points to `http://server:5000`) and locally

✅ **Environment Files**
- `.env` - Default environment variables
- `.env.local` - Local development overrides
- Build args in Dockerfile to inject correct API URL

## Quick Start

### 1. Build and Run All Services
```bash
docker-compose up --build
```

This will:
- Build the client (React/Vite)
- Build the server (Node.js)
- Start MongoDB
- Start the backend server
- Start the frontend client

### 2. Access the Application
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:5000
- **MongoDB**: mongodb://localhost:27017 (user: root, password: rootpassword)

## Docker Commands

### Start Services (without rebuilding)
```bash
docker-compose up
```

### Stop Services
```bash
docker-compose down
```

### Stop and Remove Volumes (clean slate)
```bash
docker-compose down -v
```

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f server
docker-compose logs -f client
docker-compose logs -f mongodb
```

### Rebuild Images
```bash
docker-compose up --build
```

### Access Service Shell
```bash
# Server shell
docker-compose exec server sh

# Client shell
docker-compose exec client sh

# MongoDB shell
docker-compose exec mongodb mongosh
```

## Project Structure
```
EcoRide/
├── client/
│   ├── Dockerfile
│   ├── .dockerignore
│   └── ...
├── server/
│   ├── Dockerfile
│   ├── .dockerignore
│   └── ...
├── docker-compose.yml
├── .dockerignore
└── .env.example
```

## Environment Variables

The application uses environment variables configured in `docker-compose.yml`. Key variables:

- `MONGODB_URI`: MongoDB connection string (auto-set in Docker)
- `NODE_ENV`: Set to 'production'
- `PORT`: Server runs on 5000
- `VITE_API_URL`: Frontend API URL (points to server)

## Production Deployment

For production, update these settings in `docker-compose.yml`:

1. Change MongoDB credentials (currently: root/rootpassword)
2. Update CORS settings in server code if needed
3. Configure proper domain names instead of localhost
4. Use environment files for secrets

### Example for Production:
```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Troubleshooting

### MongoDB Connection Error
```
Error: connect ECONNREFUSED 127.0.0.1:27017
```
**Solution**: Ensure MongoDB service is running:
```bash
docker-compose logs mongodb
```

### Port Already in Use
Change ports in `docker-compose.yml`:
```yaml
ports:
  - "3000:5173"  # Map to different host port
  - "8000:5000"  # Map to different host port
```

### Clear Docker Cache
```bash
docker system prune -a
docker-compose down -v
docker-compose up --build
```

## Performance Tips

- Use `.dockerignore` to exclude unnecessary files
- Use multi-stage builds (already implemented for client)
- Add health checks (already included for MongoDB)
- Set resource limits in `docker-compose.yml` if needed:
  ```yaml
  server:
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
  ```

## Additional Resources
- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Node.js Docker Best Practices](https://nodejs.org/en/docs/guides/nodejs-docker-webapp/)
