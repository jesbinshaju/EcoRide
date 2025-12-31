import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import io from 'socket.io-client';
import axios from 'axios';
import L from 'leaflet';
import { Car, User, Sun, Moon, Copy, CheckCircle } from 'lucide-react';

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

  const [mapCenter, setMapCenter] = useState([10.0159, 76.3419]); 
  const [zoom, setZoom] = useState(13);
  const [routeCoords, setRouteCoords] = useState([]); 

  const [isTripCreated, setIsTripCreated] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  
  // Driver Inputs
  const [startCity, setStartCity] = useState("");
  const [endCity, setEndCity] = useState("");
  const [mileage, setMileage] = useState(""); 
  const [fuelPrice, setFuelPrice] = useState(105.50); 
  const [tripCost, setTripCost] = useState(0); 
  const [distance, setDistance] = useState(0);

  // Rider Form (Added maintenance fee flag)
  const [riderForm, setRiderForm] = useState({ 
      roomCode: '', 
      name: '', 
      startKm: 0, 
      endKm: 0,
      isMaintenance: false // NEW CHECKBOX STATE
  });

  useEffect(() => {
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  // LISTEN FOR UPDATES
  useEffect(() => {
    socket.on('trip_update', (data) => {
        console.log("Trip Update Received:", data); // Debugging
        setTripData(data);
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
      const url = `https://router.project-osrm.org/route/v1/driving/${start.lon},${start.lat};${end.lon},${end.lat}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      const data = await res.json();
      
      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const distKm = route.distance / 1000;
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

        await axios.post('http://localhost:5000/api/create-trip', {
          roomCode: code, totalDist: distKm, fuelPrice: priceVal, mileage: mileVal
        });

        socket.emit('join_ride', { roomCode: code, name: 'Driver', startKm: 0, endKm: distKm });
        setIsTripCreated(true);
      }
    } catch (e) { alert("Error creating route"); }
    setLoading(false);
  };

  const joinRide = () => {
    if (!riderForm.roomCode || !riderForm.name) return;
    
    // SENDING THE EXTRA FEE DATA (server needs to handle this later)
    socket.emit('join_ride', {
      roomCode: riderForm.roomCode, 
      name: riderForm.name, 
      startKm: riderForm.startKm, 
      endKm: riderForm.endKm,
      // We pass the flag here so backend can calculate extra charge
      isMaintenance: riderForm.isMaintenance 
    });
    
    setView('active_rider'); 
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
          
          {view === 'home' && (
            <div className="space-y-4 mt-10">
              <button onClick={() => setView('driver')} className="w-full bg-green-600 p-6 rounded-xl font-bold text-white text-xl hover:bg-green-700 shadow-lg flex items-center justify-center gap-3">
                 <Car /> Create Trip (Driver)
              </button>
              <button onClick={() => setView('rider')} className="w-full bg-blue-600 p-6 rounded-xl font-bold text-white text-xl hover:bg-blue-700 shadow-lg flex items-center justify-center gap-3">
                 <User /> Join Trip (Rider)
              </button>
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
                  <input value={startCity} placeholder="Start City (e.g. Kochi)" 
                    onChange={e => setStartCity(e.target.value)} onBlur={() => autoUpdatePrice(startCity)}
                    className="w-full p-3 rounded-xl bg-slate-900/10 dark:bg-slate-900/50 border border-slate-400 dark:border-slate-700 focus:border-green-500 outline-none transition" />
                  
                  <input value={endCity} placeholder="End City (e.g. Trivandrum)" 
                    onChange={e => setEndCity(e.target.value)}
                    className="w-full p-3 rounded-xl bg-slate-900/10 dark:bg-slate-900/50 border border-slate-400 dark:border-slate-700 focus:border-green-500 outline-none transition" />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                  <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Mileage (km/l)</label>
                      <input type="number" value={mileage} onChange={(e) => setMileage(e.target.value)} placeholder="e.g. 15"
                          className="w-full p-3 bg-slate-100 dark:bg-slate-700 rounded-lg font-bold focus:outline-green-500" />
                  </div>
                  <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Fuel Price (₹)</label>
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
                    <p className="text-xs uppercase tracking-widest text-green-600 font-bold mb-2">Share this Room Code</p>
                    <div className="text-5xl font-black text-green-600 tracking-wider font-mono bg-white/50 dark:bg-black/20 p-2 rounded-lg inline-block">
                        {roomCode}
                    </div>
                    <button onClick={copyToClipboard} className="absolute top-2 right-2 p-2 hover:bg-green-200 rounded-full text-green-700"><Copy size={16}/></button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-blue-500/10 p-4 rounded-xl border border-blue-500/30">
                        <p className="text-xs text-blue-400 uppercase">Total Distance</p>
                        <p className="text-2xl font-bold text-blue-600">{distance.toFixed(1)} km</p>
                    </div>
                    <div className="bg-orange-500/10 p-4 rounded-xl border border-orange-500/30">
                        <p className="text-xs text-orange-400 uppercase">Total Fuel Cost</p>
                        <p className="text-2xl font-bold text-orange-600">₹{tripCost}</p>
                    </div>
                </div>

                <div className="mt-8 text-left">
                    <h3 className="text-sm font-bold text-slate-500 uppercase border-b border-slate-700 pb-2 mb-4">Current Passengers</h3>
                    {tripData?.passengers && tripData.passengers.length > 0 ? (
                        tripData.passengers.map((p, i) => (
                           <div key={i} className="mb-2 p-3 bg-slate-700 rounded-lg flex justify-between items-center border-l-4 border-green-500">
                                <div>
                                    <span className="font-bold text-white">{p.name}</span>
                                    <span className="text-xs text-slate-400 block">Joining at {p.startKm}km</span>
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
             </div>
          )}

          {/* RIDER FORM SCREEN */}
          {view === 'rider' && (
             <div className="space-y-4">
                <h2 className="text-xl font-bold mb-4">Join a Ride</h2>
                <input placeholder="Enter Room Code" onChange={e => setRiderForm({...riderForm, roomCode: e.target.value})} className="w-full p-4 bg-slate-900/10 dark:bg-slate-700 rounded-xl font-mono text-center text-lg tracking-widest uppercase" />
                <input placeholder="Your Name" onChange={e => setRiderForm({...riderForm, name: e.target.value})} className="w-full p-3 bg-slate-900/10 dark:bg-slate-700 rounded-xl" />
                
                {/* KM Inputs */}
                <div className="flex gap-2">
                    <input type="number" placeholder="Start KM" onChange={e => setRiderForm({...riderForm, startKm: e.target.value})} className="w-1/2 p-3 bg-slate-900/10 dark:bg-slate-700 rounded-xl" />
                    <input type="number" placeholder="End KM" onChange={e => setRiderForm({...riderForm, endKm: e.target.value})} className="w-1/2 p-3 bg-slate-900/10 dark:bg-slate-700 rounded-xl" />
                </div>

                {/* NEW: MAINTENANCE FEE CHECKBOX */}
                <div className="flex items-center gap-3 p-3 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-600">
                    <input 
                        type="checkbox" 
                        id="maintFee"
                        className="w-5 h-5 text-green-600 rounded focus:ring-green-500"
                        checked={riderForm.isMaintenance}
                        onChange={(e) => setRiderForm({...riderForm, isMaintenance: e.target.checked})}
                    />
                    <label htmlFor="maintFee" className="text-xs text-gray-600 dark:text-gray-300">
                        I agree to pay <span className="font-bold text-green-600">2% extra</span> as Maintenance Contribution for the driver.
                    </label>
                </div>

                <button onClick={joinRide} className="w-full bg-blue-600 hover:bg-blue-700 p-4 rounded-xl font-bold text-white shadow-lg">Join Room</button>
                <button onClick={() => setView('home')} className="w-full text-slate-500 text-xs text-center">Back</button>
             </div>
          )}

          {/* ACTIVE RIDER DASHBOARD - FIXED */}
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
                                 {/* Shows if they selected the checkbox */}
                                 {riderForm.isMaintenance && (
                                     <div className="mt-3 inline-block bg-green-100 text-green-800 text-[10px] px-2 py-1 rounded-full font-bold">
                                         Includes 2% Maintenance Fee
                                     </div>
                                 )}
                             </div>
                         ))}

                         {/* PASSENGER LIST */}
                         <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl">
                             <h4 className="text-xs font-bold text-gray-400 uppercase mb-3">All Passengers</h4>
                             {tripData.passengers.map((p, idx) => (
                                <div key={idx} className="flex justify-between items-center py-2 border-b border-slate-200 dark:border-slate-700 last:border-0">
                                    <span className="text-sm font-medium">{p.name}</span>
                                    <span className="font-mono text-green-600 font-bold">₹{Number(p.cost).toFixed(2)}</span>
                                </div>
                             ))}
                         </div>
                     </div>
                 ) : (
                     // LOADER if data is null
                     <div className="p-10 text-center bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 rounded-xl border border-yellow-200 dark:border-yellow-700">
                        <div className="animate-spin w-8 h-8 border-4 border-yellow-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                        <p className="font-bold">Connecting to Driver...</p>
                        <p className="text-xs mt-2 opacity-75">Waiting for the next route update.</p>
                     </div>
                 )}
                 
                 <button onClick={() => setView('home')} className="w-full text-slate-400 text-xs mt-4">Leave Trip</button>
             </div>
          )}

        </div>
      </div>

      {/* MAP AREA */}
      <div className="flex-1 relative z-0">
        <MapContainer center={mapCenter} zoom={zoom} style={{ height: "100%", width: "100%" }}>
           <ChangeView center={mapCenter} zoom={zoom} />
           <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="EcoRide" />
           {routeCoords.length > 0 && <Polyline positions={routeCoords} pathOptions={{ color: '#22c55e', weight: 6 }} />}
           {routeCoords.length > 0 && <Marker position={routeCoords[0]}><Popup>Start</Popup></Marker>}
           {routeCoords.length > 0 && <Marker position={routeCoords[routeCoords.length - 1]}><Popup>End</Popup></Marker>}
        </MapContainer>
      </div>

    </div>
  );
}