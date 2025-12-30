import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import cors from 'cors';
import { calculateFairShare } from './costLogic.js';

import 'dotenv/config';



const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// --- 1. DATABASE CONNECTION ---
// PASTE YOUR COPIED LINK BELOW inside the quotes ''
const mongoURI = process.env.MONGODB_URI;

if (!mongoURI) {
  console.error('❌ MONGODB_URI is missing from .env');
  process.exit(1);
}

mongoose.connect(mongoURI)
  .then(() => console.log("✅ MongoDB Connected Safely!"))
  .catch(err => {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  });


// --- 2. DATABASE SCHEMA ---
const TripSchema = new mongoose.Schema({
    roomCode: String,
    totalDist: Number,
    fuelPrice: Number,
    mileage: Number,
    passengers: [{
        id: String,
        name: String,
        startKm: Number,
        endKm: Number,
        cost: Number
    }]
});
const Trip = mongoose.model('Trip', TripSchema);

// --- 3. API ROUTES ---
app.post('/api/create-trip', async (req, res) => {
    try {
        const { roomCode, totalDist, fuelPrice, mileage } = req.body;
        
        const newTrip = new Trip({
            roomCode, totalDist, fuelPrice, mileage,
            passengers: []
        });
        
        await newTrip.save(); // Saves to the real cloud database
        console.log(`Trip created: ${roomCode}`);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- NEW: FUEL PRICE ROUTE ---
app.get('/api/fuel-price', async (req, res) => {
  const { city, type } = req.query;
  
  // NOTE: In a real app, you'd call a Fuel API here. 
  // For your project, let's use a "Smart Default" logic that simulates real Indian prices.
  const cityPrices = {
    "mumbai": { petrol: 104.21, diesel: 92.15, electric: 8.50 },
    "delhi": { petrol: 94.72, diesel: 87.62, electric: 7.00 },
    "kochi": { petrol: 105.30, diesel: 94.20, electric: 7.50 },
    "bangalore": { petrol: 102.86, diesel: 88.94, electric: 8.00 },
  };

  const cityKey = city.toLowerCase();
  const priceData = cityPrices[cityKey] || { petrol: 101.50, diesel: 90.00, electric: 7.50 }; // Default if city not in list

  res.json({ price: priceData[type.toLowerCase()] });
});

// --- 4. REAL-TIME LOGIC ---
io.on('connection', (socket) => {
    socket.on('join_ride', async ({ roomCode, name, startKm, endKm }) => {
        socket.join(roomCode);
        
        // Find trip in Real Database
        const trip = await Trip.findOne({ roomCode });
        
        if (trip) {
            trip.passengers.push({
                id: socket.id,
                name,
                startKm: Number(startKm),
                endKm: Number(endKm),
                cost: 0
            });

            // Calculate Math
            const costs = calculateFairShare(trip.totalDist, trip.mileage, trip.fuelPrice, trip.passengers);
            
            // Update Costs
            trip.passengers.forEach(p => {
                if (costs[p.id]) p.cost = costs[p.id];
            });

            // Save updates to Real Database
            await trip.save();

            // Notify everyone
            io.to(roomCode).emit('trip_update', trip);
        }
    });
});

server.listen(5000, () => console.log('Server running on port 5000'));