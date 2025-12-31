import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import cors from 'cors';
import { calculateFairShare } from './costLogic.js';
import Stats from './models/Stats.js';

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
    routeCoords: Array, // <--- ADDED: Store route coordinates
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
        const { roomCode, totalDist, fuelPrice, mileage, routeCoords } = req.body; // <--- ADDED: routeCoords
        
        const newTrip = new Trip({
            roomCode, totalDist, fuelPrice, mileage,
            routeCoords, // <--- CRITICAL: Saving the route path here
            passengers: []
        });
        
        await newTrip.save(); // Saves to the real cloud database
        console.log(`Trip created: ${roomCode}`);
        res.json({ success: true, roomCode });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- NEW: GET TRIP DATA ENDPOINT ---
// This allows clients to download the trip data including route coordinates
app.get('/api/trip/:roomCode', async (req, res) => {
    try {
        const { roomCode } = req.params;
        const trip = await Trip.findOne({ roomCode });

        if (trip) {
            res.json(trip);
        } else {
            res.status(404).json({ error: "Trip not found" });
        }
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

// --- API TO GET STATS ---
app.get('/api/stats', async (req, res) => {
    try {
        let stats = await Stats.findOne();
        if (!stats) stats = await Stats.create({ totalMoneySaved: 12450, totalCo2Saved: 450 }); // Initial dummy data
        res.json({ money: stats.totalMoneySaved, co2: stats.totalCo2Saved });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- API TO UPDATE STATS (CALLED WHEN TRIP ENDS) ---
app.post('/api/stats/update', async (req, res) => {
    try {
        const { money, co2 } = req.body;
        let stats = await Stats.findOne();
        if (!stats) stats = await Stats.create({ totalMoneySaved: 0, totalCo2Saved: 0 });
        stats.totalMoneySaved += money;
        stats.totalCo2Saved += co2;
        await stats.save();
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- STORE TRIPS IN MEMORY FOR COST CALCULATION ---
const trips = {};

// --- 4. REAL-TIME LOGIC ---
io.on('connection', (socket) => {
    socket.on('join_ride', (data) => {
        socket.join(data.roomCode);

        // FIX 1: HANDLE WATCHERS (Don't add them to the bill)
        if (data.isWatcher) {
            // Just send them the current data and stop here
            if (trips[data.roomCode]) {
                socket.emit('trip_update', trips[data.roomCode]);
            }
            return;
        }

        const { roomCode, name, startKm, endKm, coords, isDriver, pickupCity, isMaintenance } = data;

        // Initialize Trip if new
        if (!trips[roomCode]) {
            trips[roomCode] = { 
                passengers: [], 
                routeCoords: [], 
                totalDist: 0, 
                fuelPrice: 0, 
                mileage: 0,
                driverName: name // Store driver name to identify easily
            };
        }
        
        const trip = trips[roomCode];

        // FIX 2: PREVENT DUPLICATES & UPDATE EXISTING USERS
        // Check if this person is already in the list to avoid double entry
        const existingIdx = trip.passengers.findIndex(p => p.name === name);
        if (existingIdx !== -1) {
            trip.passengers[existingIdx] = { ...trip.passengers[existingIdx], ...data, socketId: socket.id };
        } else {
            trip.passengers.push({
                name,
                startKm: parseFloat(startKm),
                endKm: parseFloat(endKm),
                coords,
                isDriver: !!isDriver,
                pickupCity: pickupCity || 'Start',
                isMaintenance: !!isMaintenance,
                socketId: socket.id,
                cost: 0 // Initialize cost
            });
        }

        // --- FIX 3: THE PRICE LOGIC (PROPER SPLIT) ---
        // 1. Get all significant points (Start of trip, End of trip, Pickups, Drops)
        let points = [0, trip.totalDist];
        trip.passengers.forEach(p => { 
            points.push(p.startKm); 
            points.push(p.endKm); 
        });
        // Sort points and remove duplicates
        points = [...new Set(points)].sort((a,b) => a - b);

        // 2. Reset everyone's cost
        trip.passengers.forEach(p => p.cost = 0);
        
        const costPerKm = trip.fuelPrice / trip.mileage;

        // 3. Calculate cost for each segment
        for(let i=0; i < points.length - 1; i++) {
            const segStart = points[i];
            const segEnd = points[i+1];
            const dist = segEnd - segStart;
            
            if (dist <= 0) continue;

            // Find who is in the car during this segment
            // (A passenger is active if their start is <= segment start AND their end is >= segment end)
            const activePassengers = trip.passengers.filter(p => p.startKm <= segStart && p.endKm >= segEnd);
            
            if(activePassengers.length > 0) {
                const segmentTotalCost = dist * costPerKm;
                const costPerPerson = segmentTotalCost / activePassengers.length;
                
                // Add share to each active person (Including Driver)
                activePassengers.forEach(p => {
                    p.cost += costPerPerson;
                });
            }
        }

        // 4. Apply Maintenance Fee (Only for those who agreed)
        trip.passengers.forEach(p => {
            if(p.isMaintenance && !p.isDriver) {
                p.cost = p.cost * 1.02; // 2% extra
            }
        });

        // Broadcast
        io.to(roomCode).emit('trip_update', trip);
    });

    socket.on('end_trip', (roomCode) => {
        delete trips[roomCode];
        io.to(roomCode).emit('trip_end');
    });

    socket.on('leave_trip', ({roomCode, name}) => {
        if(trips[roomCode]) {
            trips[roomCode].passengers = trips[roomCode].passengers.filter(p => p.name !== name);
            // Re-run calculation logic here if needed, or wait for next join
            io.to(roomCode).emit('trip_update', trips[roomCode]);
        }
    });
});

server.listen(5000, () => console.log('Server running on port 5000'));