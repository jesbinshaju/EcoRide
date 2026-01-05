import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import io from 'socket.io-client';
import axios from 'axios';
import L from 'leaflet';
import { 
    Car, User, Sun, Moon, Copy, CheckCircle, MapPin, LogOut, 
    Navigation, Leaf, Wallet, Quote, X, Play, StopCircle, 
    Banknote, QrCode, ChevronDown, Plus, Trash2, GripHorizontal 
} from 'lucide-react';
import "leaflet/dist/leaflet.css";
import logo from './assets/logo.png'; 
import API_CONFIG from './config.js';

// --- CSS & ICON FIX ---
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const socket = io.connect(API_CONFIG.SOCKET_URL);

const getDist = (lat1, lon1, lat2, lon2) => {
    const R = 6371; 
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

const CitySearch = ({ placeholder, value, onSelect, onClear }) => {
    const [suggestions, setSuggestions] = useState([]);
    const [query, setQuery] = useState(value || "");
    const [showList, setShowList] = useState(false);

    useEffect(() => { setQuery(value); }, [value]);

    const handleSearch = async (val) => {
        setQuery(val);
        if (val.length > 2) {
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${val}&countrycodes=in&limit=5`);
                const data = await res.json();
                setSuggestions(data);
                setShowList(true);
            } catch (e) { console.error(e); }
        } else {
            setShowList(false);
        }
    };

    const handleSelect = (item) => {
        const cityName = item.display_name.split(',')[0];
        setQuery(cityName);
        setSuggestions([]);
        setShowList(false);
        onSelect(cityName, { lat: parseFloat(item.lat), lon: parseFloat(item.lon) });
    };

    return (
        <div className="relative w-full">
            <div className="flex items-center bg-slate-900/10 dark:bg-slate-900/50 rounded-xl border border-slate-400 dark:border-slate-700 px-3">
                <input 
                    className="w-full p-3 bg-transparent outline-none"
                    placeholder={placeholder}
                    value={query}
                    onChange={(e) => handleSearch(e.target.value)}
                    onFocus={() => query.length > 2 && setShowList(true)}
                />
                {query && <button onClick={() => {setQuery(""); onClear();}}><X size={14} className="opacity-50"/></button>}
            </div>
            {showList && suggestions.length > 0 && (
                <ul className="absolute top-full left-0 w-full bg-white dark:bg-slate-800 shadow-xl rounded-xl z-50 mt-1 max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-700">
                    {suggestions.map((s, i) => (
                        <li key={i} onClick={() => handleSelect(s)} className="p-3 text-xs hover:bg-green-50 dark:hover:bg-slate-700 cursor-pointer border-b border-slate-100 dark:border-slate-700">
                            <span className="font-bold block text-sm text-slate-700 dark:text-slate-200">{s.display_name.split(',')[0]}</span>
                            <span className="text-slate-500 truncate block">{s.display_name}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default function App() {
  const [view, setView] = useState('home');
  const [viewHistory, setViewHistory] = useState(['home']); 
  const [historyIndex, setHistoryIndex] = useState(0);
  const [tripData, setTripData] = useState(null);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
  const [fuelType, setFuelType] = useState('Petrol');
  const [loading, setLoading] = useState(false);

  // Map State
  const [mapCenter, setMapCenter] = useState([10.0159, 76.3419]); 
  const [zoom, setZoom] = useState(13);
  const [routeCoords, setRouteCoords] = useState([]); 
  const [riderMarkers, setRiderMarkers] = useState([]);

  const [isTripCreated, setIsTripCreated] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  
  // Driver Inputs
  const [startCity, setStartCity] = useState("");
  const [endCity, setEndCity] = useState("");
  const [driverCoords, setDriverCoords] = useState({ start: null, end: null }); 

  const [mileage, setMileage] = useState("15"); 
  const [fuelPrice, setFuelPrice] = useState(105.50); 
  const [distance, setDistance] = useState(0);

  // Vehicle Management
  const [vehicles, setVehicles] = useState([]);
  const [showVehicleList, setShowVehicleList] = useState(false);
  const [newVehicle, setNewVehicle] = useState({ name: '', mileage: '' });

  // Rider Form
  const [riderForm, setRiderForm] = useState({ 
      roomCode: '', 
      name: '', 
      pickupCity: '',
      dropCity: '',
      isMaintenance: false
  });
  
  const [riderRouteData, setRiderRouteData] = useState({
      startKm: null,
      endKm: null,
      pickupCoords: null,
      dropCoords: null
  });

  const [quote, setQuote] = useState("");
  const [stats, setStats] = useState({ money: 0, co2: 0 });

  const [isTracking, setIsTracking] = useState(false);
  const [livePath, setLivePath] = useState([]);
  const [liveDistance, setLiveDistance] = useState(0);
  const watchId = useRef(null);
  const [showPayment, setShowPayment] = useState(false);

  // --- NEW PERSISTENCE & UI REFS ---
  const scrollRef = useRef(null);
  const [sidebarHeight, setSidebarHeight] = useState(55); // Mobile Height %
  const [isDragging, setIsDragging] = useState(false);

  // 1. Reset scroll whenever view changes
  useEffect(() => {
    if (scrollRef.current) {
        scrollRef.current.scrollTo(0, 0);
    }
  }, [view]);

  // 2. Mobile Drag Resize Logic
  const onTouchStart = () => setIsDragging(true);
  const onTouchMove = useCallback((e) => {
    if (!isDragging) return;
    const touchY = e.touches ? e.touches[0].clientY : e.clientY;
    const heightPercent = ((window.innerHeight - touchY) / window.innerHeight) * 100;
    if (heightPercent > 20 && heightPercent < 95) {
        setSidebarHeight(heightPercent);
    }
  }, [isDragging]);

  const onTouchEnd = () => setIsDragging(false);

  useEffect(() => {
    if (isDragging) {
        window.addEventListener('mousemove', onTouchMove);
        window.addEventListener('mouseup', onTouchEnd);
        window.addEventListener('touchmove', onTouchMove);
        window.addEventListener('touchend', onTouchEnd);
    }
    return () => {
        window.removeEventListener('mousemove', onTouchMove);
        window.removeEventListener('mouseup', onTouchEnd);
        window.removeEventListener('touchmove', onTouchMove);
        window.removeEventListener('touchend', onTouchEnd);
    };
  }, [isDragging, onTouchMove]);

  // --- PERSISTENT VEHICLE LOGIC ---
  useEffect(() => {
    fetchVehicles();
  }, []);

  const fetchVehicles = async () => {
    try {
        const res = await axios.get(`${API_CONFIG.BASE_URL}/api/vehicles`);
        setVehicles(res.data);
    } catch (e) { console.error("Error fetching vehicles", e); }
  };

  const addVehicle = async () => {
    if(!newVehicle.name || !newVehicle.mileage) return;
    try {
        const res = await axios.post(`${API_CONFIG.BASE_URL}/api/vehicles`, newVehicle);
        setVehicles([...vehicles, res.data]);
        setNewVehicle({ name: '', mileage: '' });
    } catch (e) { console.error(e); }
  };

  const deleteVehicle = async (id) => {
    try {
        await axios.delete(`${API_CONFIG.BASE_URL}/api/vehicles/${id}`);
        setVehicles(vehicles.filter(v => v._id !== id));
    } catch (e) { console.error(e); }
  };

  // --- FUEL PRICE LOGIC ---
  useEffect(() => {
    const prices = {
        'Petrol': 105.50,
        'Diesel': 94.20,
        'Electric': 12.50
    };
    setFuelPrice(prices[fuelType]);
  }, [fuelType]);

  useEffect(() => {
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Custom navigation function that manages history
  const navigateTo = (newView) => {
    setViewHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(newView);
      setHistoryIndex(newHistory.length - 1);
      return newHistory;
    });
    setView(newView);
  };

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = (event) => {
      if (event.state && event.state.view) {
        const newIndex = viewHistory.indexOf(event.state.view);
        if (newIndex !== -1) {
          setHistoryIndex(newIndex);
          setView(event.state.view);
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [viewHistory]);

  // Push state to browser history whenever view changes
  useEffect(() => {
    window.history.pushState({ view }, '', window.location.href);
  }, [view]);

  useEffect(() => {
      const ecoQuotes = [
          "Ride together, save together.",
          "Small wheels, big footprints.",
          "Every shared ride helps.",
          "Less traffic, more life."
      ];
      setQuote(ecoQuotes[Math.floor(Math.random() * ecoQuotes.length)]);

      // Initial stats fetch
      updateGlobalStats();
  }, []);

  const updateGlobalStats = () => {
    axios.get(`${API_CONFIG.BASE_URL}/api/stats`)
      .then(res => setStats(res.data))
      .catch(err => console.log("DB Stats Error", err));
  };

  useEffect(() => {
    // Listen for global stat updates from other users via socket
    socket.on('stats_updated', (newStats) => {
        setStats(newStats);
    });

    socket.on('trip_update', (data) => {
        setTripData(data);
        if(data.routeCoords && data.routeCoords.length > 0 && view !== 'solo') {
            setRouteCoords(data.routeCoords);
            if(view === 'home' || view === 'rider') setMapCenter(data.routeCoords[0]);
        }
        if(data.passengers) {
            const markers = data.passengers
                .filter(p => p.coords) 
                .map(p => ({ lat: p.coords.lat, lon: p.coords.lon, name: p.name, city: p.pickupCity }));
            setRiderMarkers(markers);
        }
    });
    return () => {
        socket.off('trip_update');
        socket.off('stats_updated');
    };
  }, [view]);

  const toggleLiveTracking = () => {
      if (isTracking) {
          navigator.geolocation.clearWatch(watchId.current);
          setIsTracking(false);
          const price = parseFloat(fuelPrice) || 105;
          const mil = parseFloat(mileage) || 15;
          const moneySpent = (liveDistance * price) / mil;
          
          // PERSISTENT UPDATE: Send to backend
          axios.post(`${API_CONFIG.BASE_URL}/api/stats/update`, { 
              money: moneySpent, 
              co2: liveDistance * 0.1 
          }).then(res => setStats(res.data)); 
      } else {
          if (!navigator.geolocation) return alert("Geolocation not supported");
          setLivePath([]);
          setLiveDistance(0);
          setIsTracking(true);
          watchId.current = navigator.geolocation.watchPosition((pos) => {
              const { latitude, longitude } = pos.coords;
              const newPoint = [latitude, longitude];
              setLivePath(prev => {
                  if (prev.length > 0) {
                      const last = prev[prev.length - 1];
                      const d = getDist(last[0], last[1], latitude, longitude);
                      if (d > 0.005) { 
                          setLiveDistance(old => old + d);
                          return [...prev, newPoint];
                      }
                      return prev;
                  }
                  return [newPoint];
              });
              setMapCenter(newPoint);
          }, (err) => console.error(err), { enableHighAccuracy: true });
      }
  };

  const generateUPI = (amount) => {
      return `upi://pay?pa=driver@upi&pn=EcoRideDriver&am=${amount}&cu=INR`;
  };

  const handleCreateTrip = async () => {
    if (!startCity || !endCity || !mileage || !fuelPrice) return alert("Please fill in all fields");
    if (!driverCoords.start || !driverCoords.end) return alert("Please select cities");

    setLoading(true);
    const start = driverCoords.start;
    const end = driverCoords.end;

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

        const code = Math.random().toString(36).substr(2, 6).toUpperCase();
        setRoomCode(code);

        await axios.post(`${API_CONFIG.BASE_URL}/api/create-trip`, {
          roomCode: code, 
          totalDist: distKm, 
          fuelPrice: parseFloat(fuelPrice), 
          mileage: parseFloat(mileage),
          routeCoords: path 
        });

        socket.emit('join_ride', { 
            roomCode: code, name: 'Driver', startKm: 0, endKm: distKm, isDriver: true, pickupCity: startCity
        });
        setIsTripCreated(true);
      }
    } catch (e) { alert("Error creating route"); }
    setLoading(false);
  };

  const isLocationOnRoute = (userLoc, routePath, thresholdKm = 15) => {
    let minDistance = Infinity;
    let closestIndex = -1;
    routePath.forEach((point, index) => {
        const d = getDist(userLoc.lat, userLoc.lon, point[0], point[1]);
        if (d < minDistance) { minDistance = d; closestIndex = index; }
    });
    return { isValid: minDistance <= thresholdKm, closestIndex, minDistance };
  };

  const calculateKmFromRoute = (routePath, targetIndex) => {
      let d = 0;
      for (let i = 0; i < targetIndex; i++) {
          d += getDist(routePath[i][0], routePath[i][1], routePath[i+1][0], routePath[i+1][1]);
      }
      return d;
  };

  const validateRiderRoute = async () => {
    if(!riderRouteData.pickupCoords || !riderRouteData.dropCoords) return alert("Please select valid locations");
    if(routeCoords.length === 0) return alert("Load Route first!");

    setLoading(true);
    const pickup = riderRouteData.pickupCoords;
    const dropoff = riderRouteData.dropCoords;

    const validStart = isLocationOnRoute(pickup, routeCoords);
    const validEnd = isLocationOnRoute(dropoff, routeCoords);

    if(!validStart.isValid || !validEnd.isValid) { setLoading(false); return alert(`Location too far from route!`); }

    const startKm = calculateKmFromRoute(routeCoords, validStart.closestIndex);
    const endKm = calculateKmFromRoute(routeCoords, validEnd.closestIndex);

    if(startKm >= endKm) { setLoading(false); return alert("Invalid Direction!"); }

    setRiderRouteData(prev => ({ ...prev, startKm: startKm.toFixed(1), endKm: endKm.toFixed(1) }));
    setMapCenter([pickup.lat, pickup.lon]);
    setZoom(10);
    setLoading(false);
  };

  const joinRide = () => {
    if (!riderForm.roomCode || !riderForm.name || !riderRouteData.startKm) return alert("Validate route first");
    socket.emit('join_ride', {
      roomCode: riderForm.roomCode, name: riderForm.name, 
      startKm: riderRouteData.startKm, endKm: riderRouteData.endKm,
      coords: riderRouteData.pickupCoords, pickupCity: riderForm.pickupCity, isMaintenance: riderForm.isMaintenance 
    });
    navigateTo('active_rider'); 
  };

  const endTrip = async () => {
      if(window.confirm("End Trip for everyone?")) {
        try {
            const finalDist = liveDistance > 0 ? liveDistance : distance;
            const price = parseFloat(fuelPrice) || 105;
            const mil = parseFloat(mileage) || 15;
            const moneySpent = (finalDist * price) / mil;

            // PERSISTENT GLOBAL UPDATE
            await axios.post(`${API_CONFIG.BASE_URL}/api/stats/update`, { 
                money: moneySpent, 
                co2: finalDist * 0.1 
            });
            updateGlobalStats();
        } catch(e) { console.error("Stats update failed", e); }
        
        socket.emit('end_trip', roomCode);
        setTripData(null); setRouteCoords([]); setRiderMarkers([]); setIsTripCreated(false); setLivePath([]); setIsTracking(false); navigateTo('home');
      }
  }

  const leaveRide = () => {
      if(window.confirm("Leave trip?")) {
          socket.emit('leave_trip', { roomCode: riderForm.roomCode, name: riderForm.name });
          setTripData(null); setRouteCoords([]); setRiderMarkers([]); 
          setRiderRouteData({ startKm: null, endKm: null, pickupCoords: null, dropCoords: null });
          navigateTo('home');
      }
  };

  const fetchRouteDetails = async () => {
      if(!riderForm.roomCode) return alert("Enter Code");
      setLoading(true);
      try {
          const res = await axios.get(`${API_CONFIG.BASE_URL}/api/trip/${riderForm.roomCode}`);
          if(res.data) {
              setTripData(res.data);
              if(res.data.routeCoords) { setRouteCoords(res.data.routeCoords); setMapCenter(res.data.routeCoords[0]); }
              if(res.data.passengers) { setRiderMarkers(res.data.passengers.filter(p => p.coords).map(p => ({ lat: p.coords.lat, lon: p.coords.lon, name: p.name, city: p.pickupCity }))); }
              socket.emit('join_ride', { roomCode: riderForm.roomCode, name: 'Watcher', isWatcher: true });
          }
      } catch (err) { alert("Code not found."); }
      setLoading(false);
  };

  const copyToClipboard = () => {
      navigator.clipboard.writeText(roomCode);
      alert("Copied!");
  }

  return (
    <div className={`flex h-screen w-full flex-col-reverse md:flex-row overflow-hidden ${theme === 'dark' ? 'bg-slate-900 text-white' : 'bg-[#FCF9EA] text-slate-900'}`}>      
      
      {/* --- SIDEBAR --- */}
      <div 
        style={{ height: window.innerWidth < 768 ? `${sidebarHeight}%` : '100%' }}
        className={`w-full md:w-1/3 md:min-w-[380px] p-6 border-t md:border-t-0 md:border-r flex flex-col transition-[height] duration-75 ease-out z-10 relative ${theme === 'dark' ? 'bg-slate-800 border-slate-700 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]' : 'bg-[#FCF9EA] border-amber-200 shadow-inner'}`}>
        
        {/* Mobile Drag Handle */}
        <div 
            onMouseDown={onTouchStart}
            onTouchStart={onTouchStart}
            className="md:hidden absolute top-0 left-0 w-full h-8 flex items-center justify-center cursor-grab active:cursor-grabbing"
        >
            <div className="w-12 h-1.5 bg-slate-400/30 rounded-full"></div>
        </div>

        <div className="flex justify-between items-center mb-6 mt-2 md:mt-0">
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tighter text-green-500 flex items-center gap-2" style={{fontFamily: 'Inter, sans-serif'}}>
                <Car strokeWidth={2.5} /> EcoRide
            </h1>
            <div className="flex items-center gap-2">
                <button 
                    onClick={() => window.history.back()} 
                    className={`p-2 rounded-full transition-all ${theme === 'dark' ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' : 'bg-slate-200 hover:bg-slate-300 text-slate-600'}`}
                    title="Back"
                >
                    ←
                </button>
                <button 
                    onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} 
                    className={`p-2 rounded-full transition-all ${theme === 'dark' ? 'bg-slate-700 text-yellow-400' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
                >
                    {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
                </button>
            </div>
        </div>

        {/* This is the container we reset the scroll for */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto flex flex-col no-scrollbar pb-20 md:pb-0">
          
          {/* --- HOME DASHBOARD --- */}
          {view === 'home' && (
            <div className="space-y-6 mt-2 animate-fade-in flex flex-col h-full">
              <div className="grid grid-cols-2 gap-4">
                  <div className="aspect-square bg-gradient-to-br from-emerald-600 to-lime-500 rounded-xl border-2 border-emerald-300 shadow-lg flex flex-col justify-center items-center text-center p-4 hover:scale-[1.02] transition-transform relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-[150%] h-full bg-white/10 -skew-x-12 translate-x-1/2"></div>
                      <Leaf className="mb-2 text-white drop-shadow-md relative z-10" size={36} strokeWidth={2.5} />
                      <h3 className="text-2xl md:text-3xl font-black text-white drop-shadow-md tracking-tight relative z-10">{stats.co2 ? stats.co2.toFixed(1) : '0.0'}</h3>
                      <p className="text-[9px] md:text-[10px] font-bold text-emerald-50 uppercase tracking-widest mt-1 relative z-10">CO₂ Saved (kg)</p>
                  </div>

                  <div className="aspect-square bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl border-2 border-amber-300 shadow-lg flex flex-col justify-center items-center text-center p-4 hover:scale-[1.02] transition-transform relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-[150%] h-full bg-white/10 -skew-x-12 translate-x-1/2"></div>
                      <Banknote className="mb-2 text-white drop-shadow-md relative z-10" size={36} strokeWidth={2.5} />
                      <h3 className="text-2xl md:text-3xl font-black text-white drop-shadow-md tracking-tight relative z-10">₹{stats.money ? stats.money.toFixed(0) : '0'}</h3>
                      <p className="text-[9px] md:text-[10px] font-bold text-amber-50 uppercase tracking-widest mt-1 relative z-10">Total Fuel Cost</p>
                  </div>
              </div>

              <div className="bg-amber-100 dark:bg-slate-700/50 border-l-4 border-amber-400 p-4 rounded-r-xl italic text-xs md:text-sm text-slate-600 dark:text-slate-300 relative">
                  <Quote size={16} className="text-amber-400 absolute top-2 right-2 opacity-50"/>
                  "{quote}"
              </div>

              <div className="space-y-3 pt-2">
                <button onClick={() => navigateTo('driver')} className="w-full bg-slate-900 dark:bg-green-600 p-4 rounded-xl font-bold text-white text-md md:text-lg hover:opacity-90 shadow-xl flex items-center justify-center gap-3 transition-transform hover:scale-[1.02]">
                   <Car /> Create Trip (Driver)
                </button>
                <button onClick={() => navigateTo('rider')} className="w-full bg-blue-600 p-4 rounded-xl font-bold text-white text-md md:text-lg hover:bg-blue-700 shadow-xl flex items-center justify-center gap-3 transition-transform hover:scale-[1.02]">
                   <User /> Join Trip (Rider)
                </button>
                <button onClick={() => navigateTo('solo')} className="w-full bg-amber-500 p-4 rounded-xl font-bold text-white text-md md:text-lg hover:bg-amber-600 shadow-xl flex items-center justify-center gap-3 transition-transform hover:scale-[1.02]">
                   <Navigation /> Live Ride (Solo)
                </button>
              </div>
            </div>
          )}

          {/* --- SOLO VIEW --- */}
          {view === 'solo' && (
              <div className="space-y-6 animate-fade-in">
                  <h2 className="text-xl font-bold border-b pb-2 border-slate-600 flex items-center gap-2">
                      <Navigation size={20} className="text-amber-500"/> Live Tracker
                  </h2>
                  <div className="bg-slate-100 dark:bg-slate-800 p-6 rounded-2xl text-center border-2 border-amber-500/20">
                      <p className="text-xs uppercase font-bold text-slate-500 mb-2">Distance Travelled</p>
                      <h3 className="text-5xl font-black text-amber-500 font-mono mb-4">{liveDistance.toFixed(2)} <span className="text-sm text-slate-400">km</span></h3>
                      <div className="bg-white dark:bg-slate-900 p-3 rounded-lg mb-4">
                          <p className="text-xs text-slate-400">Estimated Fuel Cost</p>
                          <p className="text-xl font-bold text-green-500">₹{((liveDistance * parseFloat(fuelPrice)) / parseFloat(mileage)).toFixed(1)}</p>
                      </div>
                      <button 
                        onClick={toggleLiveTracking}
                        className={`w-full py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 shadow-lg ${isTracking ? 'bg-red-500 hover:bg-red-600' : 'bg-green-600 hover:bg-green-700'}`}
                      >
                          {isTracking ? <><StopCircle /> Stop Tracking</> : <><Play /> Start Tracking</>}
                      </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                          <label className="text-[10px] uppercase font-bold text-slate-400">Mileage</label>
                          <input type="number" value={mileage} onChange={e=>setMileage(e.target.value)} className="w-full bg-transparent font-bold outline-none"/>
                      </div>
                      <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                          <label className="text-[10px] uppercase font-bold text-slate-400">Fuel Price</label>
                          <input type="number" value={fuelPrice} onChange={e=>setFuelPrice(e.target.value)} className="w-full bg-transparent font-bold outline-none"/>
                      </div>
                  </div>
                  <button onClick={() => { setIsTracking(false); setLivePath([]); navigateTo('home'); }} className="w-full text-slate-500 text-sm mt-4">Exit Solo Mode</button>
              </div>
          )}

          {/* DRIVER INPUT SCREEN */}
          {view === 'driver' && !isTripCreated && (
            <div className="space-y-5">
              <h2 className="text-xl font-bold mb-4 border-b pb-2 border-slate-600">Trip Details</h2>
              <div className="grid grid-cols-3 gap-2">
                {['Petrol', 'Diesel', 'Electric'].map(t => (
                  <button key={t} onClick={() => setFuelType(t)} 
                    className={`py-2 text-xs font-bold rounded-lg border-2 transition-all ${fuelType === t ? 'border-green-500 bg-green-500/10 scale-105' : 'border-slate-600 opacity-60 hover:opacity-100'}`}>
                    {t}
                  </button>
                ))}
              </div>
              
              <div className="space-y-3">
                  <CitySearch placeholder="Start City" value={startCity} 
                      onSelect={(name, coords) => { setStartCity(name); setDriverCoords(prev => ({...prev, start: coords})); }} 
                      onClear={() => { setStartCity(""); setDriverCoords(prev => ({...prev, start: null})); }} />
                  <CitySearch placeholder="End City" value={endCity} 
                      onSelect={(name, coords) => { setEndCity(name); setDriverCoords(prev => ({...prev, end: coords})); }} 
                      onClear={() => { setEndCity(""); setDriverCoords(prev => ({...prev, end: null})); }} />
              </div>

              <div className="relative">
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Select Vehicle & Mileage</label>
                  <button 
                    onClick={() => setShowVehicleList(!showVehicleList)}
                    className="w-full flex items-center justify-between p-3 bg-slate-100 dark:bg-slate-700 rounded-xl border border-slate-300 dark:border-slate-600 font-bold"
                  >
                      <span className="flex items-center gap-2"><Car size={16} className="text-green-500"/> {mileage} km/l (Manual/Selected)</span>
                      <ChevronDown size={16} className={`transition-transform ${showVehicleList ? 'rotate-180' : ''}`} />
                  </button>

                  {showVehicleList && (
                    <div className="absolute top-full left-0 w-full mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                        <div className="max-h-60 overflow-y-auto">
                            {vehicles.map((v, i) => (
                                <div key={i} className="flex items-center justify-between p-3 hover:bg-slate-50 dark:hover:bg-slate-700 border-b border-slate-100 dark:border-slate-700">
                                    <div className="flex-1 cursor-pointer" onClick={() => { setMileage(v.mileage); setShowVehicleList(false); }}>
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 bg-slate-200 dark:bg-slate-600 rounded flex items-center justify-center">
                                                <Car size={14}/>
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold">{v.name}</p>
                                                <p className="text-[10px] text-slate-500">{v.mileage} km/l</p>
                                            </div>
                                        </div>
                                    </div>
                                    <button onClick={() => deleteVehicle(v._id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={14}/></button>
                                </div>
                            ))}
                        </div>
                        <div className="p-3 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700">
                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Add New Vehicle</p>
                            <div className="flex gap-2">
                                <input placeholder="Name" value={newVehicle.name} onChange={e=>setNewVehicle({...newVehicle, name: e.target.value})} className="flex-1 text-xs p-2 rounded border bg-transparent outline-none border-slate-300 dark:border-slate-600" />
                                <input type="number" placeholder="Km/l" value={newVehicle.mileage} onChange={e=>setNewVehicle({...newVehicle, mileage: e.target.value})} className="w-16 text-xs p-2 rounded border bg-transparent outline-none border-slate-300 dark:border-slate-600" />
                                <button onClick={addVehicle} className="bg-green-600 text-white p-2 rounded"><Plus size={16}/></button>
                            </div>
                        </div>
                    </div>
                  )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                  <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Manual Mileage</label>
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
              <button onClick={() => navigateTo('home')} className="w-full text-slate-500 text-xs mt-2">Cancel</button>
            </div>
          )}

          {/* DRIVER DASHBOARD */}
          {view === 'driver' && isTripCreated && (
             <div className="space-y-6 text-center animate-fade-in h-full flex flex-col">
                <div className="bg-green-500/10 border-2 border-green-500 p-6 rounded-2xl relative overflow-hidden">
                    <p className="text-xs uppercase tracking-widest text-green-600 font-bold mb-2">Share Room Code</p>
                    <div className="text-5xl font-black text-green-600 tracking-wider font-mono bg-white/50 dark:bg-black/20 p-2 rounded-lg inline-block">
                        {roomCode}
                    </div>
                    <button onClick={copyToClipboard} className="absolute top-2 right-2 p-2 hover:bg-green-200 rounded-full text-green-700"><Copy size={16}/></button>
                </div>

                <div className="mt-4 text-left flex-1">
                    <h3 className="text-sm font-bold text-slate-500 uppercase border-b border-slate-700 pb-2 mb-4">Trip Details & Passengers</h3>
                    
                    <div className="mb-4 p-4 bg-slate-900/5 dark:bg-slate-700/50 rounded-xl border border-dashed border-slate-400">
                        <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-slate-500 uppercase">Total Estimated Fuel Cost</span>
                            <span className="text-xl font-black text-green-600">₹{((distance * fuelPrice)/mileage).toFixed(2)}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1 italic">Calculated for {distance.toFixed(1)} km</p>
                    </div>

                    {tripData?.passengers && tripData.passengers.length > 0 ? (
                        tripData.passengers.map((p, i) => (
                           <div key={i} className={`mb-2 p-3 rounded-lg flex justify-between items-center border-l-4 ${p.isDriver ? 'bg-blue-500/10 border-blue-500' : 'bg-slate-700 border-green-500'}`}>
                                <div>
                                    <span className="font-bold text-white flex items-center gap-2">
                                        {p.isDriver ? <Car size={12} className="text-blue-400"/> : <MapPin size={12} className="text-green-400"/>} 
                                        {p.name} {p.isDriver && "(You)"}
                                    </span>
                                    <span className="text-[10px] text-slate-400 block ml-5">
                                        Joining from <span className="text-slate-200">{p.pickupCity || `${Number(p.startKm).toFixed(1)}km`}</span>
                                    </span>
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
                
                <button onClick={endTrip} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold p-4 rounded-xl shadow-lg mt-auto">
                    End Trip for Everyone
                </button>
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
                
                <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3 relative">
                    {loading && <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-xl z-10"><span className="text-white text-xs font-bold">Validating...</span></div>}
                    <div className="flex items-center gap-2">
                        <MapPin size={16} className="text-green-500 min-w-[16px]" />
                        <CitySearch placeholder="Pickup City" value={riderForm.pickupCity} 
                            onSelect={(name, coords) => { setRiderForm(prev => ({...prev, pickupCity: name})); setRiderRouteData(prev => ({...prev, pickupCoords: coords})); }} 
                            onClear={() => setRiderForm(prev => ({...prev, pickupCity: ''}))}/>
                    </div>
                    <div className="flex items-center gap-2">
                        <MapPin size={16} className="text-red-500 min-w-[16px]" />
                        <CitySearch placeholder="Dropoff City" value={riderForm.dropCity} 
                            onSelect={(name, coords) => { setRiderForm(prev => ({...prev, dropCity: name})); setRiderRouteData(prev => ({...prev, dropCoords: coords})); }} 
                            onClear={() => setRiderForm(prev => ({...prev, dropCity: ''}))}/>
                    </div>
                    {!riderRouteData.startKm ? (
                        <button onClick={validateRiderRoute} className="w-full bg-slate-600 hover:bg-slate-700 text-white py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2">
                            <Navigation size={14}/> Validate Location & Route
                        </button>
                    ) : (
                        <div className="bg-green-500/20 text-green-600 p-2 rounded text-center text-xs font-bold">
                            Route Validated! <br/> Cost calculated for {riderRouteData.startKm}km - {riderRouteData.endKm}km
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
                <button onClick={() => navigateTo('home')} className="w-full text-slate-500 text-xs text-center">Back</button>
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
                         <div className="flex justify-between items-center bg-slate-100 dark:bg-slate-700 p-3 rounded-lg">
                             <span className="text-xs font-mono text-gray-500">Room: {riderForm.roomCode}</span>
                             <span className="text-xs bg-green-500 text-white px-2 py-1 rounded">Live</span>
                         </div>
                         {tripData.passengers && tripData.passengers.filter(p => p.name === riderForm.name).map((myP, i) => (
                             <div key={i} className="text-center py-8 bg-white dark:bg-slate-800 rounded-xl shadow-lg border-t-4 border-green-500">
                                 <p className="text-xs text-gray-400 uppercase font-bold tracking-widest mb-2">Your Fair Share</p>
                                 <p className="text-5xl font-black text-slate-800 dark:text-white">
                                     ₹{Number(myP.cost).toFixed(2)}
                                 </p>
                                 <button onClick={() => setShowPayment(true)} className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-full font-bold text-xs flex items-center gap-2 mx-auto shadow-lg hover:scale-105 transition-transform">
                                    <Banknote size={14}/> Pay Now
                                 </button>
                             </div>
                         ))}
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

          <div className="mt-auto pt-10 pb-2 text-center">
              <p className="text-[10px] text-slate-400 dark:text-slate-600 uppercase tracking-widest font-bold">
                  Project By <span className="text-green-600 dark:text-green-400">Jesbin Shaju</span>
              </p>
          </div>
        </div>
      </div>

      {/* --- MAP AREA --- */}
      <div className="flex-1 relative z-0">
        <MapContainer center={mapCenter} zoom={zoom} style={{ height: "100%", width: "100%" }}>
           <ChangeView center={mapCenter} zoom={zoom} />
           <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="EcoRide" />
           {routeCoords.length > 0 && view !== 'solo' && <Polyline positions={routeCoords} pathOptions={{ color: '#22c55e', weight: 6, opacity: 0.8 }} />}
           {view === 'solo' && livePath.length > 0 && <Polyline positions={livePath} pathOptions={{ color: '#f59e0b', weight: 6 }} />}
           {routeCoords.length > 0 && view !== 'solo' && <Marker position={routeCoords[0]}><Popup>Trip Start</Popup></Marker>}
           {routeCoords.length > 0 && view !== 'solo' && <Marker position={routeCoords[routeCoords.length - 1]}><Popup>Trip End</Popup></Marker>}
           {riderMarkers.map((m, i) => (
               <Marker key={i} position={[m.lat, m.lon]}>
                   <Popup className="font-bold">{m.name}<br/><span className="text-xs text-slate-500">{m.city}</span></Popup>
               </Marker>
           ))}
           {view === 'rider' && riderRouteData.pickupCoords && (
               <Marker position={[riderRouteData.pickupCoords.lat, riderRouteData.pickupCoords.lon]} opacity={0.6}>
                   <Popup>Your Pickup</Popup>
               </Marker>
           )}
        </MapContainer>

        {showPayment && (
            <div className="absolute inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-2xl max-w-sm w-full text-center animate-fade-in border border-slate-700">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-lg text-slate-800 dark:text-white">Pay Driver</h3>
                        <button onClick={() => setShowPayment(false)} className="text-slate-500 hover:text-red-500"><X size={24}/></button>
                    </div>
                    {tripData?.passengers?.filter(p => p.name === riderForm.name).map((p, i) => (
                        <div key={i}>
                            <div className="bg-slate-100 dark:bg-slate-700 p-4 rounded-xl mb-4">
                                <QrCode size={120} className="mx-auto mb-2 text-slate-800 dark:text-white opacity-80"/>
                                <p className="text-xs text-slate-500 dark:text-slate-300">Scan via GPay / PhonePe</p>
                            </div>
                            <p className="font-black text-3xl mb-4 text-green-600">₹{Number(p.cost).toFixed(0)}</p>
                            <a href={generateUPI(p.cost.toFixed(0))} className="block w-full bg-green-600 text-white font-bold py-3 rounded-xl mb-2 hover:bg-green-700 transition-colors">
                                Open UPI App
                            </a>
                            <p className="text-[10px] text-slate-400">Secure payment directly to driver's UPI</p>
                        </div>
                    ))}
                </div>
            </div>
        )}
      </div>
    </div>
  );
}