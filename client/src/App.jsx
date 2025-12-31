import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import io from 'socket.io-client';
import axios from 'axios';
import L from 'leaflet';
import { Car, User, Sun, Moon, Copy, CheckCircle, MapPin, LogOut, Navigation , Leaf, Wallet, Quote} from 'lucide-react';


// --- CSS & ICON FIX ---
import "leaflet/dist/leaflet.css";
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// --- Backend Connection ---
const socket = io.connect("http://localhost:5000");

// --- GEOMETRY HELPERS ---

// Calculate distance between two lat/lon points in km (Haversine)
const getDist = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Radius of earth in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function ChangeView({ center, zoom }) {
  const map = useMap();
  map.setView(center, zoom);
  return null;
}

export default function App() {
  const [view, setView] = useState('home'); 
  const [tripData, setTripData] = useState(null);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
  const [fuelType, setFuelType] = useState('Petrol');
  const [loading, setLoading] = useState(false);

  // Map State
  const [mapCenter, setMapCenter] = useState([10.0159, 76.3419]); 
  const [zoom, setZoom] = useState(13);
  const [routeCoords, setRouteCoords] = useState([]); 
  
  // New: Store rider pickup locations for map display
  const [riderMarkers, setRiderMarkers] = useState([]);

  const [isTripCreated, setIsTripCreated] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  
  // Driver Inputs
  const [startCity, setStartCity] = useState("");
  const [endCity, setEndCity] = useState("");
  const [mileage, setMileage] = useState(""); 
  const [fuelPrice, setFuelPrice] = useState(105.50); 
  const [tripCost, setTripCost] = useState(0); 
  const [distance, setDistance] = useState(0);

  // Rider Form
  const [riderForm, setRiderForm] = useState({ 
      roomCode: '', 
      name: '', 
      pickupCity: '',
      dropCity: '',
      isMaintenance: false
  });
  
  // Validated Rider Data
  const [riderRouteData, setRiderRouteData] = useState({
      startKm: null,
      endKm: null,
      pickupCoords: null,
      dropCoords: null
  });

  // --- NEW: QUOTES & STATS LOGIC ---
  const [quote, setQuote] = useState("");
  const [stats, setStats] = useState({ money: 0, co2: 0 });

  useEffect(() => {
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  // --- NEW: QUOTES & STATS INITIALIZATION ---
  const ecoQuotes = [
      "Every shared ride is a breath of fresh air for the planet.",
      "Ride together, save together, breathe better.",
      "Less traffic, more life. Thank you for sharing.",
      "Small wheels keep on turning, big footprints stop burning.",
      "Sharing a ride divides the cost and multiplies the joy."
  ];

  useEffect(() => {
      // 1. Set Random Quote
      setQuote(ecoQuotes[Math.floor(Math.random() * ecoQuotes.length)]);

      // 2. Load Stats from LocalStorage (or initialize with a 'base' amount to look cool)
      const savedMoney = parseFloat(localStorage.getItem('eco_money')) || 12450.50; // Fake base start
      const savedCo2 = parseFloat(localStorage.getItem('eco_co2')) || 450.2;
      setStats({ money: savedMoney, co2: savedCo2 });

      // 3. Simulate "Live" global counter (Optional: makes it look active)
      const interval = setInterval(() => {
          setStats(prev => ({
              money: prev.money + 0.05, // Increment slightly
              co2: prev.co2 + 0.001
          }));
      }, 3000);

      return () => clearInterval(interval);
  }, []);

  // LISTEN FOR UPDATES
  useEffect(() => {
    socket.on('trip_update', (data) => {
        console.log("Trip Update Received:", data); 
        setTripData(data);
        
        // If we are a rider joining, we might need the route from the payload
        // (Assuming backend passes 'routeCoords' if driver sent them, or we parse from data)
        if(data.routeCoords && data.routeCoords.length > 0) {
            setRouteCoords(data.routeCoords);
            // Center map on the route if we just got it
            if(data.routeCoords[0]) setMapCenter(data.routeCoords[0]);
        }

        // Update markers for passengers
        if(data.passengers) {
            const markers = data.passengers
                .filter(p => p.coords) // Ensure passenger has coords
                .map(p => ({ lat: p.coords.lat, lon: p.coords.lon, name: p.name }));
            setRiderMarkers(markers);
        }
    });
    return () => socket.off('trip_update');
  }, []);

  const getCoords = async (city) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${city}`);
      const data = await res.json();
      if (!data[0]) return null;
      return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
    } catch (err) { return null; }
  };

  const autoUpdatePrice = async (city) => {
    if (!city) return;
    try {
      const res = await axios.get(`http://localhost:5000/api/fuel-price/${city}`);
      if (res.data && res.data.prices) {
        if(fuelType === 'Petrol') setFuelPrice(res.data.prices.petrol);
        if(fuelType === 'Diesel') setFuelPrice(res.data.prices.diesel);
        if(fuelType === 'Electric') setFuelPrice(res.data.prices.electric);
      }
    } catch (err) { console.log("Using default price"); }
  };

  // --- DRIVER: CREATE TRIP ---
  const handleCreateTrip = async () => {
    if (!startCity || !endCity || !mileage || !fuelPrice) {
      alert("Please fill in all fields");
      return;
    }
    setLoading(true);
    const start = await getCoords(startCity);
    const end = await getCoords(endCity);
    
    if (!start || !end) { alert("City not found"); setLoading(false); return; }

    try {
      // Fetch Route from OSRM
      const url = `https://router.project-osrm.org/route/v1/driving/${start.lon},${start.lat};${end.lon},${end.lat}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      const data = await res.json();
      
      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const distKm = route.distance / 1000;
        // Swap [lon, lat] to [lat, lon] for Leaflet
        const path = route.geometry.coordinates.map(c => [c[1], c[0]]);
        
        setDistance(distKm);
        setRouteCoords(path);
        setMapCenter([start.lat, start.lon]);
        setZoom(8);

        const mileVal = parseFloat(mileage);
        const priceVal = parseFloat(fuelPrice);
        const totalCost = (distKm / mileVal) * priceVal;
        setTripCost(totalCost.toFixed(2));

        const code = Math.random().toString(36).substr(2, 6).toUpperCase();
        setRoomCode(code);

        // Sending routeCoords to server so Riders can validate against it
        await axios.post('http://localhost:5000/api/create-trip', {
          roomCode: code, 
          totalDist: distKm, 
          fuelPrice: priceVal, 
          mileage: mileVal,
          routeCoords: path // Pass route path to state
        });

        socket.emit('join_ride', { 
            roomCode: code, 
            name: 'Driver', 
            startKm: 0, 
            endKm: distKm,
            isDriver: true 
        });
        setIsTripCreated(true);
      }
    } catch (e) { alert("Error creating route"); console.error(e);}
    setLoading(false);
  };

  // --- RIDER: VALIDATION ALGORITHM ---
  
  // 1. Check if user location is near the driver's route
// Change the default threshold from 5 to 15
const isLocationOnRoute = (userLoc, routePath, thresholdKm = 15) => { // <--- CHANGED 5 to 15
    let minDistance = Infinity;
    let closestIndex = -1;

    routePath.forEach((point, index) => {
        // ... (distance calculation logic remains same)
        const d = getDist(userLoc.lat, userLoc.lon, point[0], point[1]);
        if (d < minDistance) {
            minDistance = d;
            closestIndex = index;
        }
    });

    // Console log to debug why it might look "wrong"
    console.log(`Distance from route: ${minDistance.toFixed(2)} km`);

    return { isValid: minDistance <= thresholdKm, closestIndex, minDistance };
};

  // 2. Calculate Cumulative Distance (KM) along route to a specific index
  const calculateKmFromRoute = (routePath, targetIndex) => {
      let d = 0;
      for (let i = 0; i < targetIndex; i++) {
          d += getDist(routePath[i][0], routePath[i][1], routePath[i+1][0], routePath[i+1][1]);
      }
      return d;
  };

  // 3. Handle Validate Click
  const validateRiderRoute = async () => {
    if(!riderForm.pickupCity || !riderForm.dropCity) return alert("Enter cities first");
    if(routeCoords.length === 0) return alert("Enter Room Code and wait for Route Data to load first!");

    setLoading(true);
    
    // A. Geocode Cities
    const pickup = await getCoords(riderForm.pickupCity);
    const dropoff = await getCoords(riderForm.dropCity);

    if(!pickup || !dropoff) { setLoading(false); return alert("Could not find locations"); }

    // B. Validate Geospatially
    const validStart = isLocationOnRoute(pickup, routeCoords);
    const validEnd = isLocationOnRoute(dropoff, routeCoords);

    if(!validStart.isValid) {
        setLoading(false);
        return alert(`Pickup location is too far (${validStart.minDistance.toFixed(1)}km) from the driver's route!`);
    }
    if(!validEnd.isValid) {
        setLoading(false);
        return alert(`Dropoff location is too far (${validEnd.minDistance.toFixed(1)}km) from the driver's route!`);
    }

    // C. Calculate KMs
    const startKm = calculateKmFromRoute(routeCoords, validStart.closestIndex);
    const endKm = calculateKmFromRoute(routeCoords, validEnd.closestIndex);

    if(startKm >= endKm) {
        setLoading(false);
        return alert("Pickup cannot be after Dropoff!");
    }

    // D. Save data for Join
    setRiderRouteData({
        startKm: startKm.toFixed(1),
        endKm: endKm.toFixed(1),
        pickupCoords: pickup,
        dropCoords: dropoff
    });

    // Zoom map to show the segment
    setMapCenter([pickup.lat, pickup.lon]);
    setZoom(10);
    
    setLoading(false);
  };

  const joinRide = () => {
    if (!riderForm.roomCode || !riderForm.name || !riderRouteData.startKm) return alert("Please validate route first");
    
    socket.emit('join_ride', {
      roomCode: riderForm.roomCode, 
      name: riderForm.name, 
      startKm: riderRouteData.startKm, 
      endKm: riderRouteData.endKm,
      coords: riderRouteData.pickupCoords, // Send coords to display on map
      isMaintenance: riderForm.isMaintenance 
    });
    
    setView('active_rider'); 
  };

  // --- EXIT TRIP LOGIC ---
  // Helper to update stats when a trip is finished (Call this in leaveRide)
  const updateEcoStats = (km) => {
      // Logic: 1km shared = ~5 INR saved and ~0.12kg CO2 saved
      const newMoney = stats.money + (km * 5);
      const newCo2 = stats.co2 + (km * 0.12);
      
      setStats({ money: newMoney, co2: newCo2 });
      localStorage.setItem('eco_money', newMoney);
      localStorage.setItem('eco_co2', newCo2);
  };

  const leaveRide = () => {
      if(window.confirm("Are you sure you want to leave this trip?")) {
          // UPDATE STATS HERE BEFORE LEAVING
          if(riderRouteData.startKm && riderRouteData.endKm) {
             const dist = Math.abs(riderRouteData.endKm - riderRouteData.startKm);
             updateEcoStats(dist);
          }
          
          socket.emit('leave_trip', { roomCode: riderForm.roomCode, name: riderForm.name });
          setTripData(null);
          setRouteCoords([]);
          setRiderMarkers([]); // Clear map markers
          setRiderRouteData({ startKm: null, endKm: null, pickupCoords: null, dropCoords: null });
          setView('home');
      }
  };

  // Helper to pre-fetch route when room code is entered (Simulated by joining room lightly)
const fetchRouteDetails = async () => {
      // Validation: ensure code is typed
      if(!riderForm.roomCode || riderForm.roomCode.length < 4) {
          alert("Please enter a valid Room Code");
          return;
      }
      
      setLoading(true);
      
      try {
          // CALL THE NEW API ENDPOINT WE JUST ADDED TO SERVER
          const res = await axios.get(`http://localhost:5000/api/trip/${riderForm.roomCode}`);
          
          if(res.data) {
              console.log("Trip Data Received:", res.data);
              setTripData(res.data); // <--- ADD THIS LINE. This fixes the infinite loading.
              
              // 1. UPDATE THE MAP WITH DRIVER'S ROUTE
              if(res.data.routeCoords && res.data.routeCoords.length > 0) {
                  setRouteCoords(res.data.routeCoords);
                  setMapCenter(res.data.routeCoords[0]); // Center map on driver start
              } else {
                  alert("Trip found, but no route data available. Ask driver to recreate trip.");
                  setLoading(false);
                  return;
              }

              // 2. LOAD EXISTING PASSENGERS ON MAP
              if(res.data.passengers) {
                  const markers = res.data.passengers
                    .filter(p => p.coords)
                    .map(p => ({ lat: p.coords.lat, lon: p.coords.lon, name: p.name }));
                  setRiderMarkers(markers);
              }

              // 3. JOIN SOCKET ROOM FOR LIVE UPDATES
              // We join as a 'watcher' first to get updates before we actually join as a passenger
              socket.emit('join_ride', { 
                  roomCode: riderForm.roomCode, 
                  name: 'RiderWaiting', // Temporary name
                  isDriver: false 
              });
              
              alert("Route Loaded! You can now validate your location.");
          }
      } catch (err) {
          console.error("Error fetching route:", err);
          alert("Room Code not found on server.");
      }
      setLoading(false);
  };

  const copyToClipboard = () => {
      navigator.clipboard.writeText(roomCode);
      alert("Room Code Copied!");
  }

  return (
    <div className={`flex h-screen w-full ${theme === 'dark' ? 'bg-slate-900 text-white' : 'bg-[#FCF9EA] text-slate-900'}`}>      
      
      {/* --- SIDEBAR --- */}
      <div className={`w-1/3 min-w-[350px] p-6 border-r flex flex-col transition-all duration-500 z-10 ${theme === 'dark' ? 'bg-slate-800 border-slate-700 shadow-xl' : 'bg-[#FCF9EA] border-amber-200 shadow-inner'}`}>
        
        <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-green-500 flex items-center gap-2"><Car /> EcoRide</h1>
            <button 
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} 
                className={`p-2 rounded-full transition-all ${theme === 'dark' ? 'bg-slate-700 text-yellow-400' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
            >
                {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
            </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          
          {/* --- HOME DASHBOARD --- */}
          {view === 'home' && (
            <div className="space-y-6 mt-6 animate-fade-in relative h-full flex flex-col">
              
              {/* STATS CARDS */}
              <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gradient-to-br from-green-500 to-emerald-700 p-4 rounded-2xl text-white shadow-lg relative overflow-hidden group">
                      <Leaf className="absolute -bottom-4 -right-4 opacity-20 group-hover:scale-125 transition-transform" size={80} />
                      <p className="text-xs font-medium opacity-80 mb-1">CO₂ Saved (kg)</p>
                      <h3 className="text-2xl font-bold font-mono">{stats.co2.toFixed(1)}</h3>
                  </div>
                  <div className="bg-gradient-to-br from-blue-500 to-indigo-700 p-4 rounded-2xl text-white shadow-lg relative overflow-hidden group">
                      <Wallet className="absolute -bottom-4 -right-4 opacity-20 group-hover:scale-125 transition-transform" size={80} />
                      <p className="text-xs font-medium opacity-80 mb-1">Money Saved (₹)</p>
                      <h3 className="text-2xl font-bold font-mono">₹{stats.money.toFixed(0)}</h3>
                  </div>
              </div>

              {/* QUOTE SECTION */}
              <div className="bg-amber-100 dark:bg-slate-700/50 border-l-4 border-amber-400 p-4 rounded-r-xl italic text-sm text-slate-600 dark:text-slate-300 relative">
                  <Quote size={16} className="text-amber-400 absolute top-2 right-2 opacity-50"/>
                  "{quote}"
              </div>

              {/* BUTTONS */}
              <div className="space-y-4 pt-4">
                <button onClick={() => setView('driver')} className="w-full bg-slate-900 dark:bg-green-600 p-5 rounded-xl font-bold text-white text-lg hover:opacity-90 shadow-xl flex items-center justify-center gap-3 transition-transform hover:scale-[1.02]">
                   <Car /> Create Trip (Driver)
                </button>
                <button onClick={() => setView('rider')} className="w-full bg-blue-600 p-5 rounded-xl font-bold text-white text-lg hover:bg-blue-700 shadow-xl flex items-center justify-center gap-3 transition-transform hover:scale-[1.02]">
                   <User /> Join Trip (Rider)
                </button>
              </div>

              {/* WATERMARK - Positioned at bottom of this container */}
              <div className="mt-auto pt-10 pb-2 text-center">
                  <p className="text-[10px] text-slate-400 dark:text-slate-600 uppercase tracking-widest font-bold">
                      Project By <span className="text-green-600 dark:text-green-400">Jesbin Shaju</span>
                  </p>
              </div>
            </div>
          )}

          {/* DRIVER INPUT SCREEN */}
          {view === 'driver' && !isTripCreated && (
            <div className="space-y-5">
              <h2 className="text-xl font-bold mb-4 border-b pb-2 border-slate-600">Trip Details</h2>
              <div className="grid grid-cols-3 gap-2">
                {['Petrol', 'Diesel', 'Electric'].map(t => (
                  <button key={t} onClick={() => {setFuelType(t); autoUpdatePrice(startCity);}} 
                    className={`py-2 text-xs font-bold rounded-lg border-2 ${fuelType === t ? 'border-green-500 bg-green-500/10' : 'border-slate-600 opacity-60 hover:opacity-100'}`}>
                    {t}
                  </button>
                ))}
              </div>
              <div className="space-y-3">
                  <input value={startCity} placeholder="Start City (e.g. Kochi)" onChange={e => setStartCity(e.target.value)} onBlur={() => autoUpdatePrice(startCity)}
                    className="w-full p-3 rounded-xl bg-slate-900/10 dark:bg-slate-900/50 border border-slate-400 dark:border-slate-700 focus:border-green-500 outline-none transition" />
                  <input value={endCity} placeholder="End City (e.g. Trivandrum)" onChange={e => setEndCity(e.target.value)}
                    className="w-full p-3 rounded-xl bg-slate-900/10 dark:bg-slate-900/50 border border-slate-400 dark:border-slate-700 focus:border-green-500 outline-none transition" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                  <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Mileage</label>
                      <input type="number" value={mileage} onChange={(e) => setMileage(e.target.value)} placeholder="e.g. 15"
                          className="w-full p-3 bg-slate-100 dark:bg-slate-700 rounded-lg font-bold focus:outline-green-500" />
                  </div>
                  <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Price (₹)</label>
                      <input type="number" value={fuelPrice} onChange={(e) => setFuelPrice(e.target.value)}
                          className="w-full p-3 bg-slate-100 dark:bg-slate-700 rounded-lg font-bold focus:outline-green-500" />
                  </div>
              </div>
              <button onClick={handleCreateTrip} disabled={loading}
                  className="w-full py-4 mt-4 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-lg transition-all flex justify-center items-center gap-2">
                  {loading ? "Calculating..." : "CREATE TRIP & GENERATE CODE"}
              </button>
              <button onClick={() => setView('home')} className="w-full text-slate-500 text-xs mt-2">Cancel</button>
            </div>
          )}

          {/* DRIVER DASHBOARD */}
          {view === 'driver' && isTripCreated && (
             <div className="space-y-6 text-center animate-fade-in">
                <div className="bg-green-500/10 border-2 border-green-500 p-6 rounded-2xl relative overflow-hidden">
                    <p className="text-xs uppercase tracking-widest text-green-600 font-bold mb-2">Share Room Code</p>
                    <div className="text-5xl font-black text-green-600 tracking-wider font-mono bg-white/50 dark:bg-black/20 p-2 rounded-lg inline-block">
                        {roomCode}
                    </div>
                    <button onClick={copyToClipboard} className="absolute top-2 right-2 p-2 hover:bg-green-200 rounded-full text-green-700"><Copy size={16}/></button>
                </div>

                <div className="mt-8 text-left">
                    <h3 className="text-sm font-bold text-slate-500 uppercase border-b border-slate-700 pb-2 mb-4">Current Passengers</h3>
                    {tripData?.passengers && tripData.passengers.length > 0 ? (
                        tripData.passengers.filter(p => !p.isDriver).map((p, i) => (
                           <div key={i} className="mb-2 p-3 bg-slate-700 rounded-lg flex justify-between items-center border-l-4 border-green-500">
                                <div>
                                    <span className="font-bold text-white flex items-center gap-2"><MapPin size={12} className="text-green-400"/> {p.name}</span>
                                    <span className="text-xs text-slate-400 block ml-5">Joining at {Number(p.startKm).toFixed(1)}km</span>
                                </div>
                                <span className="font-bold text-green-400">₹{Number(p.cost).toFixed(2)}</span>
                           </div>
                        ))
                    ) : (
                        <div className="text-center p-8 border-2 border-dashed border-slate-600 rounded-xl">
                            <p className="text-slate-500 text-sm">Waiting for passengers...</p>
                        </div>
                    )}
                </div>
                <button onClick={() => {socket.emit('end_trip', roomCode); setView('home')}} className="w-full bg-red-900/50 text-red-400 p-3 rounded-lg text-xs mt-10 hover:bg-red-900">End Trip for Everyone</button>
             </div>
          )}

          {/* RIDER FORM SCREEN */}
          {view === 'rider' && (
             <div className="space-y-4">
                <h2 className="text-xl font-bold mb-4">Join a Ride</h2>
                <div className="flex gap-2">
                    <input placeholder="Code" value={riderForm.roomCode} onChange={e => setRiderForm({...riderForm, roomCode: e.target.value})} className="w-1/3 p-3 bg-slate-900/10 dark:bg-slate-700 rounded-xl font-mono text-center uppercase" />
                    <button onClick={fetchRouteDetails} className="bg-slate-600 text-white px-3 rounded-xl text-xs">Load Route</button>
                </div>
                
                <input placeholder="Your Name" value={riderForm.name} onChange={e => setRiderForm({...riderForm, name: e.target.value})} className="w-full p-3 bg-slate-900/10 dark:bg-slate-700 rounded-xl" />
                
                {/* NEW LOCATION INPUTS */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3 relative">
                    {loading && <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-xl z-10"><span className="text-white text-xs font-bold">Validating...</span></div>}
                    <div className="flex items-center gap-2">
                        <MapPin size={16} className="text-green-500" />
                        <input placeholder="Pickup Location (City)" value={riderForm.pickupCity} onChange={e => setRiderForm({...riderForm, pickupCity: e.target.value})} className="w-full bg-transparent border-b border-slate-500 focus:border-green-500 outline-none text-sm p-1" />
                    </div>
                    <div className="flex items-center gap-2">
                        <MapPin size={16} className="text-red-500" />
                        <input placeholder="Dropoff Location (City)" value={riderForm.dropCity} onChange={e => setRiderForm({...riderForm, dropCity: e.target.value})} className="w-full bg-transparent border-b border-slate-500 focus:border-red-500 outline-none text-sm p-1" />
                    </div>
                    
                    {!riderRouteData.startKm ? (
                        <button onClick={validateRiderRoute} className="w-full bg-slate-600 hover:bg-slate-700 text-white py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2">
                            <Navigation size={14}/> Validate Location & Route
                        </button>
                    ) : (
                        <div className="bg-green-500/20 text-green-600 p-2 rounded text-center text-xs font-bold">
                            Route Validated! <br/> Cost will be calculated for {riderRouteData.startKm}km - {riderRouteData.endKm}km
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-3 p-3 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-600">
                    <input type="checkbox" id="maintFee" className="w-5 h-5 text-green-600 rounded focus:ring-green-500" checked={riderForm.isMaintenance} onChange={(e) => setRiderForm({...riderForm, isMaintenance: e.target.checked})}/>
                    <label htmlFor="maintFee" className="text-xs text-gray-600 dark:text-gray-300">
                        I agree to pay <span className="font-bold text-green-600">2% extra</span> as Maintenance Fee.
                    </label>
                </div>

                <button onClick={joinRide} disabled={!riderRouteData.startKm} className={`w-full p-4 rounded-xl font-bold text-white shadow-lg transition-all ${riderRouteData.startKm ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-600 opacity-50 cursor-not-allowed'}`}>
                    Join Room
                </button>
                <button onClick={() => setView('home')} className="w-full text-slate-500 text-xs text-center">Back</button>
             </div>
          )}

          {/* ACTIVE RIDER DASHBOARD */}
          {view === 'active_rider' && (
             <div className="space-y-4">
                 <h2 className="text-xl font-bold text-green-600 flex items-center gap-2">
                     <CheckCircle size={20}/> Trip Active
                 </h2>

                 {tripData ? (
                     <div className="animate-fade-in space-y-4">
                         {/* Status Bar */}
                         <div className="flex justify-between items-center bg-slate-100 dark:bg-slate-700 p-3 rounded-lg">
                             <span className="text-xs font-mono text-gray-500">Room: {riderForm.roomCode}</span>
                             <span className="text-xs bg-green-500 text-white px-2 py-1 rounded">Live</span>
                         </div>

                         {/* MY COST CARD */}
                         {tripData.passengers && tripData.passengers.filter(p => p.name === riderForm.name).map((myP, i) => (
                             <div key={i} className="text-center py-8 bg-white dark:bg-slate-800 rounded-xl shadow-lg border-t-4 border-green-500">
                                 <p className="text-xs text-gray-400 uppercase font-bold tracking-widest mb-2">Your Fair Share</p>
                                 <p className="text-5xl font-black text-slate-800 dark:text-white">
                                     ₹{Number(myP.cost).toFixed(2)}
                                 </p>
                                 {riderForm.isMaintenance && (
                                     <div className="mt-3 inline-block bg-green-100 text-green-800 text-[10px] px-2 py-1 rounded-full font-bold">Includes Maintenance Fee</div>
                                 )}
                             </div>
                         ))}

                         {/* PASSENGER LIST */}
                         <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl">
                             <h4 className="text-xs font-bold text-gray-400 uppercase mb-3">Trip Members</h4>
                             {tripData.passengers.map((p, idx) => (
                                <div key={idx} className="flex justify-between items-center py-2 border-b border-slate-200 dark:border-slate-700 last:border-0">
                                    <span className="text-sm font-medium flex items-center gap-2">
                                        {p.isDriver ? <Car size={14} className="text-blue-400"/> : <User size={14}/>} {p.name}
                                    </span>
                                    <span className="font-mono text-green-600 font-bold">₹{Number(p.cost).toFixed(2)}</span>
                                </div>
                             ))}
                         </div>
                     </div>
                 ) : (
                     <div className="p-10 text-center bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 rounded-xl border border-yellow-200 dark:border-yellow-700">
                        <div className="animate-spin w-8 h-8 border-4 border-yellow-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                        <p className="font-bold">Waiting for Trip Data...</p>
                     </div>
                 )}
                 
                 <button onClick={leaveRide} className="w-full bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all mt-6">
                    <LogOut size={16} /> Leave Trip
                 </button>
             </div>
          )}

        </div>
      </div>

      {/* MAP AREA */}
      <div className="flex-1 relative z-0">
        <MapContainer center={mapCenter} zoom={zoom} style={{ height: "100%", width: "100%" }}>
           <ChangeView center={mapCenter} zoom={zoom} />
           <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="EcoRide" />
           
           {/* Draw Driver's Route */}
           {routeCoords.length > 0 && <Polyline positions={routeCoords} pathOptions={{ color: '#22c55e', weight: 6, opacity: 0.8 }} />}
           
           {/* Start/End Markers for Driver */}
           {routeCoords.length > 0 && <Marker position={routeCoords[0]}><Popup>Trip Start</Popup></Marker>}
           {routeCoords.length > 0 && <Marker position={routeCoords[routeCoords.length - 1]}><Popup>Trip End</Popup></Marker>}

           {/* Rider Markers (Shows name on map) */}
           {riderMarkers.map((m, i) => (
               <Marker key={i} position={[m.lat, m.lon]}>
                   <Popup className="font-bold">{m.name} (Pickup)</Popup>
               </Marker>
           ))}

           {/* Current Rider Preview Markers (Before Join) */}
           {view === 'rider' && riderRouteData.pickupCoords && (
               <Marker position={[riderRouteData.pickupCoords.lat, riderRouteData.pickupCoords.lon]} opacity={0.6}>
                   <Popup>Your Pickup</Popup>
               </Marker>
           )}
        </MapContainer>
      </div>

    </div>
  );
}