# EcoRide Deployment Guide - Render + Vercel

## Step 1: Set Up MongoDB Atlas (Free Tier)

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free account
3. Create a new cluster (free tier)
4. Create a database user with password
5. Whitelist your IP or use `0.0.0.0/0` for anywhere
6. Copy the connection string:
   ```
   mongodb+srv://username:password@cluster.mongodb.net/ecoride?retryWrites=true&w=majority
   ```

---

## Step 2: Deploy Backend to Render

### 2.1 Push Code to GitHub
```bash
git add .
git commit -m "Ready for deployment"
git push origin main
```

### 2.2 Create Render Account & Deploy

1. Go to [Render.com](https://render.com)
2. Sign up with GitHub
3. Click **New +** → **Web Service**
4. Select your EcoRide repository
5. Configure:
   - **Name**: `ecoride-server`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Root Directory**: `server`
   - **Region**: Choose closest to you

### 2.3 Add Environment Variables in Render Dashboard

Click on your service → **Environment**

Add these variables:
```
NODE_ENV = production
PORT = 5000
MONGODB_URI = mongodb+srv://username:password@cluster.mongodb.net/ecoride?retryWrites=true&w=majority
```

**Save and the service will deploy!**

✅ Your backend will be available at: `https://ecoride-server.onrender.com`

---

## Step 3: Deploy Frontend to Vercel

### 3.1 Create Vercel Account

1. Go to [Vercel.com](https://vercel.com)
2. Sign up with GitHub

### 3.2 Deploy the Frontend

1. Click **Add New** → **Project**
2. Import your `EcoRide` repository
3. Configure:
   - **Framework**: `Vite`
   - **Root Directory**: `client`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`

### 3.3 Add Environment Variable

Before deploying, go to **Settings** → **Environment Variables**

Add:
```
VITE_API_URL = https://ecoride-server.onrender.com
```

**Deploy!** ✅ Your frontend will be live in minutes

---

## Step 4: Update CORS on Backend

Since your frontend will be on a different domain, update your server code:

**File: `server/index.js`** (lines 15-17)

Replace:
```javascript
const io = new Server(server, {
    cors: { origin: "*" }
});
```

With:
```javascript
const io = new Server(server, {
    cors: { 
        origin: process.env.FRONTEND_URL || "*",
        credentials: true
    }
});

app.use(cors({
    origin: process.env.FRONTEND_URL || "*",
    credentials: true
}));
```

Also add to `.env` and Render dashboard:
```
FRONTEND_URL=https://your-vercel-domain.vercel.app
```

---

## Step 5: Test Your Deployment

1. Open Vercel frontend URL
2. Check browser console for any errors
3. Try creating a trip
4. Verify data saves to MongoDB

---

## Troubleshooting

### **"Cannot connect to API"**
- Check VITE_API_URL is correct in Vercel
- Verify MONGODB_URI is correct in Render
- Check CORS settings on backend

### **"MongoDB connection failed"**
- Verify IP whitelist on MongoDB Atlas includes Render
- Check username/password in connection string
- Ensure database name is correct

### **"Render service won't start"**
- Check logs: Render Dashboard → Logs
- Verify `npm start` works locally first
- Check all environment variables are set

### **Slow deployments on free tier**
- Free tier has ~15 second startup delay
- Normal behavior, not a bug
- Keep-alive services: [Render Cron Jobs](https://render.com/docs/cronjobs)

---

## Deployment URLs (After completing all steps)

- **Frontend**: `https://your-project.vercel.app`
- **Backend**: `https://ecoride-server.onrender.com`
- **API Docs**: `https://ecoride-server.onrender.com/api/`

---

## Useful Commands

```bash
# Check if everything builds locally
npm run build  # in client/
npm start      # in server/

# Check for environment variable issues
echo $VITE_API_URL   # Should show API URL in Vercel
echo $MONGODB_URI    # Should show MongoDB URL in Render
```

---

## Next Steps (Optional)

- Add custom domain (Vercel/Render)
- Set up CI/CD pipeline
- Add monitoring & logging (Sentry)
- Configure auto-scaling (Render Pro)

