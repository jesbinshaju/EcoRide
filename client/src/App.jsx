import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import io from 'socket.io-client';
import axios from 'axios';
import L from 'leaflet';
import { Car, Search, MapPin, Sun, Moon, User } from 'lucide-react';

// --- Leaflet Icon Fix ---
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({
    iconUrl: icon, shadowUrl: iconShadow,
    iconSize: [25, 41], iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

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

  const [mapCenter, setMapCenter] = useState([10.0159, 76.3419]); // Default to Kochi/India
  const [zoom, setZoom] = useState(13);
  const [routeCoords, setRouteCoords] = useState([]); 

  const [form, setForm] = useState({
    origin: '', dest: '', mileage: 0, fuel: 105.50,
    roomCode: '', name: '', startKm: 0, endKm: 0
  });

  useEffect(() => {
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    socket.on('trip_update', (data) => setTripData(data));
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

  const autoUpdatePrice = async (city, type) => {
    if (!city) return;
    try {
      const res = await axios.get(`http://localhost:5000/api/fuel-price?city=${city}&type=${type}`);
      if (res.data && res.data.price) {
        setForm(prev => ({ ...prev, fuel: res.data.price }));
      }
    } catch (err) {
      console.log("Using default price - backend route not found yet");
    }
  };

  const calculateAndCreate = async () => {
    if (!form.origin || !form.dest) { alert("Enter route info"); return; }
    setLoading(true);
    const start = await getCoords(form.origin);
    const end = await getCoords(form.dest);
    
    if (!start || !end) { alert("City not found"); setLoading(false); return; }

    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${start.lon},${start.lat};${end.lon},${end.lat}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      const data = await res.json();
      
      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const distKm = route.distance / 1000;
        const path = route.geometry.coordinates.map(c => [c[1], c[0]]);
        
        setRouteCoords(path);
        setMapCenter([start.lat, start.lon]);
        setZoom(8);

        const code = Math.random().toString(36).substr(2, 5).toUpperCase();
        await axios.post('http://localhost:5000/api/create-trip', {
          roomCode: code, totalDist: distKm, fuelPrice: form.fuel, mileage: form.mileage
        });

        socket.emit('join_ride', { roomCode: code, name: 'Driver', startKm: 0, endKm: distKm });
        setForm(prev => ({ ...prev, roomCode: code }));
        setView('active');
      }
    } catch (e) { alert("Connection Error"); }
    setLoading(false);
  };

  const joinRide = () => {
    if (!form.roomCode || !form.name) return;
    socket.emit('join_ride', {
      roomCode: form.roomCode, name: form.name, startKm: form.startKm, endKm: form.endKm
    });
    setView('active');
  };

  return (
      <div className={`flex h-screen ${theme === 'dark' ? 'bg-slate-900 text-white' : 'bg-[#FCF9EA] text-slate-900'}`}>      
      {/* SIDEBAR CONTAINER */}
{/* SIDEBAR CONTAINER */}
{/* SIDEBAR CONTAINER */}
      <div className={`w-1/3 p-6 border-r flex flex-col transition-all duration-500 ${theme === 'dark' ? 'bg-slate-800 border-slate-700 shadow-xl' : 'bg-[#FCF9EA] border-amber-200 shadow-inner'}`}>
        
        <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold text-green-500 flex items-center gap-2"><Car /> EcoRide</h1>
            <button 
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} 
                className={`p-2 rounded-full transition-all ${theme === 'dark' ? 'bg-slate-700 text-yellow-400' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
            >
                {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
            </button>
        </div>

        {/* --- VIEW SWITCHER --- */}
        <div className="flex-1">
          {view === 'home' && (
            <div className="space-y-4">
              <button onClick={() => setView('driver')} className="w-full bg-green-600 p-4 rounded-xl font-bold text-white hover:bg-green-700">Create Trip (Driver)</button>
              <button onClick={() => setView('rider')} className="w-full bg-blue-600 p-4 rounded-xl font-bold text-white hover:bg-blue-700">Join Trip (Rider)</button>
            </div>
          )}

          {view === 'driver' && (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-2">
                {['Petrol', 'Diesel', 'Electric'].map(t => (
                  <button key={t} onClick={() => {setFuelType(t); autoUpdatePrice(form.origin, t);}} 
                    className={`py-2 text-[10px] font-bold rounded-lg border-2 ${fuelType === t ? 'border-green-500 bg-green-500/10' : 'border-slate-700'}`}>{t}</button>
                ))}
              </div>
              <input placeholder="Start City" onBlur={e => {setForm({...form, origin: e.target.value}); autoUpdatePrice(e.target.value, fuelType);}} className="w-full p-3 rounded-xl bg-slate-900/50 border border-slate-700" />
              <input placeholder="End City" onBlur={e => setForm({...form, dest: e.target.value})} className="w-full p-3 rounded-xl bg-slate-900/50 border border-slate-700" />
              <div className="flex gap-2">
                <input type="number" placeholder="Mileage" value={form.mileage} onChange={e => setForm({...form, mileage: e.target.value})} className="w-1/2 p-3 bg-slate-900/20 rounded-xl" />
                <div className="w-1/2 p-3 bg-slate-900/50 rounded-xl text-green-400 font-bold">₹{form.fuel}</div>
              </div>
              <button onClick={calculateAndCreate} className="w-full bg-green-500 p-4 rounded-xl font-bold text-white uppercase">{loading ? "Calculating..." : "Create Smart Trip"}</button>
              <button onClick={() => setView('home')} className="w-full text-slate-500 text-xs">Back</button>
            </div>
          )}

          {view === 'rider' && (
            <div className="space-y-4">
               <input placeholder="Room Code" onChange={e => setForm({...form, roomCode: e.target.value})} className="w-full p-3 bg-slate-700 rounded-xl" />
               <input placeholder="Name" onChange={e => setForm({...form, name: e.target.value})} className="w-full p-3 bg-slate-700 rounded-xl" />
               <div className="flex gap-2">
                  <input type="number" placeholder="Start KM" onChange={e => setForm({...form, startKm: e.target.value})} className="w-1/2 p-3 bg-slate-900 rounded-xl" />
                  <input type="number" placeholder="End KM" onChange={e => setForm({...form, endKm: e.target.value})} className="w-1/2 p-3 bg-slate-900 rounded-xl" />
               </div>
               <button onClick={joinRide} className="w-full bg-blue-500 p-4 rounded-xl font-bold text-white">Join Room</button>
               <button onClick={() => setView('home')} className="w-full text-slate-500 text-xs text-center">Back</button>
            </div>
          )}

{tripData?.passengers ? tripData.passengers.map((p, i) => (
   /* REPLACE THIS DIV BELOW */
   <div key={i} className={`p-4 rounded-2xl flex justify-between items-center border-l-4 border-green-500 transition-all ${
       theme === 'dark' 
       ? 'bg-slate-700/50 hover:bg-slate-700 border-slate-600' 
       : 'bg-[#FFF8DC] shadow-sm shadow-amber-100 border border-amber-200 hover:shadow-md'
   }`}>
      <div>
         <div className={`font-bold ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>{p.name}</div>
         <div className="text-[10px] text-slate-400 font-medium">{Number(p.startKm).toFixed(1)}km - {Number(p.endKm).toFixed(1)}km</div>
      </div>
      <div className="text-2xl font-black text-green-500">₹{Number(p.cost).toFixed(2)}</div>
   </div>
   /* END OF REPLACEMENT */
)) : (
  <p className="text-center text-slate-500 italic">No passengers yet...</p>
)}
        </div>
      </div>

      {/* MAP AREA */}
      <div className="flex-1 relative">
        <MapContainer center={mapCenter} zoom={zoom} style={{ height: "100%", width: "100%" }}>
           <ChangeView center={mapCenter} zoom={zoom} />
           <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="OSM" />
           {routeCoords.length > 0 && <Polyline positions={routeCoords} color="blue" weight={4} />}
           {routeCoords.length > 0 && <Marker position={routeCoords[0]}><Popup>Start</Popup></Marker>}
           {routeCoords.length > 0 && <Marker position={routeCoords[routeCoords.length - 1]}><Popup>End</Popup></Marker>}
        </MapContainer>
      </div>

    </div>
  );
}