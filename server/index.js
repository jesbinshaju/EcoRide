import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import cors from 'cors';
import Stats from './models/Stats.js'; 
import 'dotenv/config';

const app = express();

// CORS Configuration for production & development
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    process.env.FRONTEND_URL,
    'https://ecoride-server.onrender.com'
].filter(Boolean);

app.use(cors({
    origin: allowedOrigins,
    credentials: true
}));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { 
        origin: allowedOrigins,
        credentials: true
    }
});

const mongoURI = process.env.MONGODB_URI;
if (!mongoURI) {
  console.error('❌ MONGODB_URI is missing from .env');
  process.exit(1);
}

mongoose.connect(mongoURI)
  .then(async () => {
      console.log("✅ MongoDB Connected!");
      // Seed initial vehicles if list is empty
      const count = await Vehicle.countDocuments();
      if (count === 0) {
          const initialVehicles = [
              { name: "Santro Xing", mileage: 20 },
              { name: "Honda City", mileage: 17 },
              { name: "Passion Pro", mileage: 38 },
              { name: "Honda Activa", mileage: 45 },
              { name: "Royal Enfield Bullet", mileage: 30 },
              { name: "Mahindra CL 540D", mileage: 25 }
          ];
          await Vehicle.insertMany(initialVehicles);
          console.log("🚗 Seeded initial vehicles");
      }
  })
  .catch(err => console.error("❌ DB Error:", err));

// --- SCHEMAS ---
const VehicleSchema = new mongoose.Schema({
    name: String,
    mileage: Number
});
const Vehicle = mongoose.model('Vehicle', VehicleSchema);

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
        pickupCity: String,
        isMaintenance: Boolean
    }]
});
const Trip = mongoose.model('Trip', TripSchema);

// --- API ROUTES ---

// Vehicle Routes
app.get('/api/vehicles', async (req, res) => {
    const v = await Vehicle.find();
    res.json(v);
});

app.post('/api/vehicles', async (req, res) => {
    const newV = new Vehicle(req.body);
    await newV.save();
    res.json(newV);
});

app.delete('/api/vehicles/:id', async (req, res) => {
    await Vehicle.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

// Trip Routes
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

// --- COST CALCULATION LOGIC ---
const recalculateCosts = (tripData) => {
    let points = [0, tripData.totalDist];
    tripData.passengers.forEach(p => {
        if(p.startKm !== null) points.push(p.startKm);
        if(p.endKm !== null) points.push(p.endKm);
    });
    points = [...new Set(points)].sort((a, b) => a - b);

    const costPerKm = tripData.fuelPrice / tripData.mileage;
    tripData.passengers.forEach(p => p.cost = 0);

    for (let i = 0; i < points.length - 1; i++) {
        const segmentStart = points[i];
        const segmentEnd = points[i + 1];
        const distance = segmentEnd - segmentStart;
        if (distance <= 0) continue;

        const activePassengers = tripData.passengers.filter(p => 
            p.startKm <= segmentStart && p.endKm >= segmentEnd
        );

        if (activePassengers.length > 0) {
            const segmentCost = distance * costPerKm;
            const splitCost = segmentCost / activePassengers.length;
            activePassengers.forEach(p => {
                p.cost += splitCost;
            });
        }
    }

    tripData.passengers.forEach(p => {
        if (p.isMaintenance && !p.isDriver) {
            p.cost = p.cost * 1.02; 
        }
    });

    return tripData;
};

// --- SOCKET LOGIC ---
const trips = {};

io.on('connection', (socket) => {
    socket.on('join_ride', async (data) => {
        const { roomCode, name, startKm, endKm, coords, isDriver, pickupCity, isMaintenance, isWatcher } = data;
        socket.join(roomCode);

        if (!trips[roomCode]) {
            const dbTrip = await Trip.findOne({ roomCode });
            if (dbTrip) {
                trips[roomCode] = {
                    totalDist: dbTrip.totalDist,
                    fuelPrice: dbTrip.fuelPrice,
                    mileage: dbTrip.mileage,
                    routeCoords: dbTrip.routeCoords,
                    passengers: []
                };
            } else {
                return;
            }
        }

        const trip = trips[roomCode];
        if (isWatcher) {
            socket.emit('trip_update', trip);
            return;
        }

        const passengerData = {
            name,
            startKm: parseFloat(startKm),
            endKm: parseFloat(endKm),
            coords,
            isDriver: !!isDriver,
            pickupCity: pickupCity || (isDriver ? 'Start' : 'Unknown'),
            isMaintenance: !!isMaintenance,
            socketId: socket.id,
            cost: 0 
        };

        const existingIdx = trip.passengers.findIndex(p => p.name === name);
        if (existingIdx !== -1) {
            trip.passengers[existingIdx] = passengerData;
        } else {
            trip.passengers.push(passengerData);
        }

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