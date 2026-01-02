import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import cors from 'cors';
import Stats from './models/Stats.js'; // Ensure this model exists in your folder
import 'dotenv/config';

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// --- DATABASE CONNECTION ---
const mongoURI = process.env.MONGODB_URI;

if (!mongoURI) {
  console.error('❌ MONGODB_URI is missing from .env');
  process.exit(1);
}

mongoose.connect(mongoURI)
  .then(() => console.log("✅ MongoDB Connected!"))
  .catch(err => console.error("❌ DB Error:", err));

// --- SCHEMA ---
const TripSchema = new mongoose.Schema({
    roomCode: String,
    totalDist: Number,
    fuelPrice: Number,
    mileage: Number,
    routeCoords: Array,
    passengers: [{
        name: String,
        startKm: Number,
        endKm: Number,
        cost: Number,
        isDriver: Boolean,
        pickupCity: String
    }]
});
const Trip = mongoose.model('Trip', TripSchema);

// --- API ROUTES ---
app.post('/api/create-trip', async (req, res) => {
    try {
        const { roomCode, totalDist, fuelPrice, mileage, routeCoords } = req.body;
        const newTrip = new Trip({ roomCode, totalDist, fuelPrice, mileage, routeCoords, passengers: [] });
        await newTrip.save();
        res.json({ success: true, roomCode });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/trip/:roomCode', async (req, res) => {
    try {
        const trip = await Trip.findOne({ roomCode: req.params.roomCode });
        trip ? res.json(trip) : res.status(404).json({ error: "Not found" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/stats', async (req, res) => {
    let stats = await Stats.findOne();
    if (!stats) stats = await Stats.create({ totalMoneySaved: 0, totalCo2Saved: 0 });
    res.json({ money: stats.totalMoneySaved, co2: stats.totalCo2Saved });
});

app.post('/api/stats/update', async (req, res) => {
    const { money, co2 } = req.body;
    let stats = await Stats.findOne();
    if (!stats) stats = await Stats.create({ totalMoneySaved: 0, totalCo2Saved: 0 });
    stats.totalMoneySaved += money;
    stats.totalCo2Saved += co2;
    await stats.save();
    res.json(stats);
});

// --- IN-MEMORY STATE ---
const trips = {};

// --- COST CALCULATION LOGIC (The Fix) ---
const recalculateCosts = (tripData) => {
    // 1. Sort all unique geographic points (Start, Drops, Pickups, End)
    let points = [0, tripData.totalDist];
    tripData.passengers.forEach(p => {
        if(p.startKm !== null) points.push(p.startKm);
        if(p.endKm !== null) points.push(p.endKm);
    });
    // Remove duplicates and sort numerically
    points = [...new Set(points)].sort((a, b) => a - b);

    // 2. Cost Per Km for the car
    const costPerKm = tripData.fuelPrice / tripData.mileage;

    // 3. Reset everyone's cost
    tripData.passengers.forEach(p => p.cost = 0);

    // 4. Iterate through every segment
    for (let i = 0; i < points.length - 1; i++) {
        const segmentStart = points[i];
        const segmentEnd = points[i + 1];
        const distance = segmentEnd - segmentStart;

        if (distance <= 0) continue;

        // Find who is in the car for this specific segment
        // A passenger is "active" if they started before/at segment start AND get off after/at segment end
        const activePassengers = tripData.passengers.filter(p => 
            p.startKm <= segmentStart && p.endKm >= segmentEnd
        );

        if (activePassengers.length > 0) {
            const segmentCost = distance * costPerKm;
            const splitCost = segmentCost / activePassengers.length;

            // Add the split cost to everyone in the car
            activePassengers.forEach(p => {
                p.cost += splitCost;
            });
        }
    }

    // 5. Apply Maintenance Fee (2%) logic
    tripData.passengers.forEach(p => {
        if (p.isMaintenance && !p.isDriver) {
            p.cost = p.cost * 1.02; 
        }
    });

    return tripData;
};

// --- SOCKET LOGIC ---
io.on('connection', (socket) => {
    
    socket.on('join_ride', async (data) => {
        socket.join(data.roomCode);
        const { roomCode, name, startKm, endKm, coords, isDriver, pickupCity, isMaintenance, isWatcher } = data;

        // If trip not in memory, fetch from DB
        if (!trips[roomCode]) {
            const dbTrip = await Trip.findOne({ roomCode });
            if (dbTrip) {
                trips[roomCode] = {
                    totalDist: dbTrip.totalDist,
                    fuelPrice: dbTrip.fuelPrice,
                    mileage: dbTrip.mileage,
                    routeCoords: dbTrip.routeCoords,
                    passengers: [] // Re-populate passengers as they join
                };
            } else {
                // Should not happen if create-trip was called, but safety fallback
                if(!isWatcher) socket.emit('error', 'Trip not found');
                return;
            }
        }

        const trip = trips[roomCode];

        if (isWatcher) {
            socket.emit('trip_update', trip);
            return;
        }

        // Add/Update Passenger
        const existingIdx = trip.passengers.findIndex(p => p.name === name);
        const passengerData = {
            name,
            startKm: parseFloat(startKm),
            endKm: parseFloat(endKm),
            coords,
            isDriver: !!isDriver,
            pickupCity: pickupCity || (isDriver ? 'Start' : 'Unknown'),
            isMaintenance: !!isMaintenance,
            socketId: socket.id,
            cost: 0 // Will be calculated below
        };

        if (existingIdx !== -1) {
            trip.passengers[existingIdx] = { ...trip.passengers[existingIdx], ...passengerData };
        } else {
            trip.passengers.push(passengerData);
        }

        // RECALCULATE COSTS
        const updatedTrip = recalculateCosts(trip);
        trips[roomCode] = updatedTrip;

        io.to(roomCode).emit('trip_update', updatedTrip);
    });

    socket.on('end_trip', (roomCode) => {
        delete trips[roomCode];
        io.to(roomCode).emit('trip_end');
    });

    socket.on('leave_trip', ({ roomCode, name }) => {
        if (trips[roomCode]) {
            trips[roomCode].passengers = trips[roomCode].passengers.filter(p => p.name !== name);
            recalculateCosts(trips[roomCode]);
            io.to(roomCode).emit('trip_update', trips[roomCode]);
        }
    });
});

server.listen(5000, () => console.log('✅ Server running on 5000'));