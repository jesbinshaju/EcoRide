# EcoRide Backend Deployment to Render - Step by Step

## 📋 Prerequisites Checklist

- ✅ GitHub account with EcoRide repo pushed
- ✅ MongoDB Atlas account (free tier)
- ✅ Render account (free tier available)

---

## Step 1: Get MongoDB Atlas Connection String

### 1.1 Create MongoDB Atlas Account
1. Go to [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
2. Click "Start Free" → Sign up with email
3. Create Organization (default is fine)
4. Create a Project (default is fine)

### 1.2 Create Free Cluster
1. Click "Create Deployment"
2. Select "M0 (free tier)"
3. Choose your region (closest to your users)
4. Click "Create"
5. Wait 1-2 minutes for cluster to deploy

### 1.3 Create Database User
1. In MongoDB Atlas Dashboard → **Security** → **Quickstart**
2. Create database user:
   - Username: `ecoride`
   - Password: Generate strong password (save it!)
   - Click "Finish"

### 1.4 Allow Network Access
1. Go to **Security** → **Network Access**
2. Click "Add IP Address"
3. Select "Allow access from anywhere" → Enter `0.0.0.0/0`
4. Click "Confirm"

### 1.5 Get Connection String
1. Go to **Databases** → Click "Connect" on your cluster
2. Select "Drivers"
3. Copy the connection string that looks like:
   ```
   mongodb+srv://ecoride:PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
4. Replace `PASSWORD` with your actual password
5. **SAVE THIS STRING** - you'll need it for Render

---

## Step 2: Deploy Backend to Render

### 2.1 Create Render Account
1. Go to [render.com](https://render.com)
2. Click "Sign up"
3. Choose "GitHub"
4. Authorize Render to access your GitHub
5. Login to Render

### 2.2 Deploy the Service
1. In Render Dashboard → Click **New +**
2. Select **Web Service**
3. Select your `EcoRide` repository
4. Click "Connect"

### 2.3 Configure Deployment
Fill in the configuration form:

| Field | Value |
|-------|-------|
| **Name** | `ecoride-server` |
| **Environment** | `Node` |
| **Region** | Your region (US or closest) |
| **Branch** | `main` |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Root Directory** | `server` |

### 2.4 Add Environment Variables
1. Scroll down to **Environment Variables**
2. Click **Add Environment Variable**
3. Add these variables:

```
NODE_ENV     =  production
PORT         =  5000
MONGODB_URI  =  mongodb+srv://ecoride:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/ecoride?retryWrites=true&w=majority
```

**IMPORTANT:** Replace `YOUR_PASSWORD` with actual password from Step 1.5

### 2.5 Deploy
1. Click **Create Web Service**
2. Render will now:
   - Clone your repo
   - Install dependencies
   - Build your app
   - Deploy it

**This takes 2-3 minutes.** Wait for the green checkmark ✅

### 2.6 Get Your URL
Once deployed, you'll see your service URL at the top:
```
https://ecoride-server.onrender.com
```

**Test it:**
```
https://ecoride-server.onrender.com/api/vehicles
```

If it returns an empty array `[]`, your backend is working! ✅

---

## Step 3: Add Backend URL to Frontend

After your Render backend is deployed:

### 3.1 Update Vercel (if already deployed)
1. Go to [vercel.com](https://vercel.com) → Select your project
2. Go to **Settings** → **Environment Variables**
3. Add/Update:
   ```
   VITE_API_URL = https://ecoride-server.onrender.com
   ```
4. Redeploy by clicking **Redeploy**

### 3.2 Or Test Locally First
Update your `.env.local` in client folder:
```
VITE_API_URL=https://ecoride-server.onrender.com
```

Then run:
```bash
cd client
npm run dev
```

---

## ✅ Verification Checklist

- [ ] MongoDB Atlas cluster created
- [ ] Database user created
- [ ] IP whitelist set to `0.0.0.0/0`
- [ ] Render service deployed (green checkmark)
- [ ] API responds at `/api/vehicles`
- [ ] Backend URL saved: `https://ecoride-server.onrender.com`
- [ ] Frontend environment variable updated

---

## Troubleshooting Render Deployment

### **Deployment Failed**
1. Check build logs in Render Dashboard
2. Common issues:
   - Missing `package.json` in `server/` folder
   - Wrong root directory (should be `server`)
   - Node.js version mismatch

### **"Cannot connect to MongoDB"**
1. Verify `MONGODB_URI` is correct (exact password)
2. Check IP whitelist includes `0.0.0.0/0`
3. Check MongoDB cluster status is "Running" (green)

### **502 Bad Gateway**
1. Wait 2 minutes (first startup is slow)
2. Check logs: Render → Logs tab
3. Restart service: Render → Manual Restart

### **API Responds but Returns Empty**
- This is normal! MongoDB might be empty
- Try creating data through your app

---

## Performance Tips

- Free tier has ~15 second cold start (first request)
- Subsequent requests are fast
- To keep service warm, add a cron job hitting `/api/vehicles` every 14 minutes
- Upgrade to paid tier for instant startup

---

## Your Live Backend URL

Once deployed:
```
https://ecoride-server.onrender.com
```

**Next Step:** Verify by visiting:
```
https://ecoride-server.onrender.com/api/vehicles
```

Should return: `[]` (empty array) ✅

---

## Need Help?

- **Render Docs**: https://render.com/docs
- **MongoDB Atlas Docs**: https://www.mongodb.com/docs/atlas
- Check service logs in Render dashboard for errors

