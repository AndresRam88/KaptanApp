import React, { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Car, Trip } from './types';
import { 
  Car as CarIcon, 
  MapPin, 
  Navigation, 
  DollarSign, 
  Activity, 
  History,
  Plus,
  CheckCircle2,
  AlertCircle,
  Settings,
  Users,
  Trash2,
  ShieldCheck
} from 'lucide-react';
import { generateLogo } from './services/logoService';
import { motion, AnimatePresence } from 'motion/react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Fix Leaflet icon issue
import 'leaflet/dist/leaflet.css';
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

// Custom Car Icon
const carIcon = (status: string, isUser: boolean) => L.divIcon({
  className: 'custom-div-icon',
  html: `<div class="p-2 rounded-full shadow-lg transition-all ${status === 'idle' ? 'bg-emerald-500' : 'bg-amber-500'} ${isUser ? 'ring-4 ring-black ring-offset-2' : ''}">
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>
  </div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

function MapFocus({ carId, cars }: { carId: string | null, cars: Car[] }) {
  const map = useMap();
  useEffect(() => {
    if (carId) {
      const car = cars.find(c => c.id === carId);
      if (car) {
        map.setView([car.lat, car.lng], 15, { animate: true });
      }
    }
  }, [carId, cars, map]);
  return null;
}

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [user, setUser] = useState<{ id: number; username: string; car_id: string; role: string } | null>(null);
  const [loginData, setLoginData] = useState({ username: '', password: '' });
  const [cars, setCars] = useState<Car[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isAddingTrip, setIsAddingTrip] = useState(false);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [newUserData, setNewUserData] = useState({ username: '', password: '', car_id: '', role: 'driver' });
  const [selectedCarHistory, setSelectedCarHistory] = useState<Car | null>(null);
  const [newTrip, setNewTrip] = useState({ destination: '', price: '' });
  const [focusedCarId, setFocusedCarId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [appLogo, setAppLogo] = useState<string | null>(null);

  useEffect(() => {
    const loadLogo = async () => {
      try {
        const logo = await generateLogo();
        setAppLogo(logo);
      } catch (e) {
        console.error("Failed to generate logo", e);
      }
    };
    loadLogo();

    // Check if already logged in
    fetch('/api/me')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        setUser(data);
        setIsLoading(false);
        if (data?.role === 'admin') {
          fetchAdminUsers();
        }
      });

    const newSocket = io();
    setSocket(newSocket);

    // Initial data fetch
    fetch('/api/cars').then(res => res.json()).then(setCars);
    fetch('/api/trips').then(res => res.json()).then(setTrips);

    newSocket.on('car:update', (updatedCar: Car) => {
      setCars(prev => prev.map(c => c.id === updatedCar.id ? updatedCar : c));
    });

    newSocket.on('trip:new', (trip: Trip) => {
      setTrips(prev => [trip, ...prev]);
    });

    return () => {
      newSocket.close();
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(loginData),
    });
    if (res.ok) {
      const data = await res.json();
      setUser(data);
      if (data.role === 'admin') {
        fetchAdminUsers();
      }
    } else {
      alert('Invalid credentials. Please try again.');
    }
  };

  const fetchAdminUsers = async () => {
    const res = await fetch('/api/admin/users');
    if (res.ok) {
      const data = await res.json();
      setAdminUsers(data);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newUserData),
    });
    if (res.ok) {
      fetchAdminUsers();
      setNewUserData({ username: '', password: '', car_id: '', role: 'driver' });
    } else {
      const err = await res.json();
      alert(err.error);
    }
  };

  const handleDeleteUser = async (id: number) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    if (res.ok) {
      fetchAdminUsers();
    }
  };

  const handleLogout = async () => {
    await fetch('/api/logout', { method: 'POST' });
    setUser(null);
  };

  const handleAddTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newTrip.destination || !newTrip.price) return;

    try {
      const res = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          car_id: user.car_id,
          destination: newTrip.destination,
          price: parseFloat(newTrip.price)
        }),
      });
      if (res.ok) {
        setIsAddingTrip(false);
        setNewTrip({ destination: '', price: '' });
      }
    } catch (err) {
      console.error('Error adding trip:', err);
    }
  };

  const setCarIdle = async (carId: string) => {
    await fetch(`/api/cars/${carId}/idle`, { method: 'POST' });
  };

  const handleViewOnMap = (carId: string) => {
    setFocusedCarId(carId);
    // Clear focus after a few seconds to stop the highlight
    setTimeout(() => setFocusedCarId(null), 3000);
  };

  // Simulate movement for demo purposes (GPS Tracking)
  useEffect(() => {
    const interval = setInterval(() => {
      cars.forEach(car => {
        if (car.status === 'busy' && car.target_lat && car.target_lng) {
          // Move towards target
          const step = 0.002;
          const dLat = car.target_lat - car.lat;
          const dLng = car.target_lng - car.lng;
          const distance = Math.sqrt(dLat * dLat + dLng * dLng);

          if (distance < step) {
            // Arrived at destination
            setCarIdle(car.id);
          } else {
            const newLat = car.lat + (dLat / distance) * step;
            const newLng = car.lng + (dLng / distance) * step;
            fetch(`/api/cars/${car.id}/location`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ lat: newLat, lng: newLng }),
            });
          }
        }
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [cars]);

  const carSpecificTrips = selectedCarHistory 
    ? trips.filter(t => t.car_id === selectedCarHistory.id)
    : [];

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#F5F5F5]">
      <Activity className="animate-pulse text-black w-12 h-12" />
    </div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F5F5] p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-md border border-black/5"
        >
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center mx-auto mb-4 overflow-hidden">
              {appLogo ? (
                <img src={appLogo} alt="Kaptan Logo" className="w-full h-full object-cover" />
              ) : (
                <Activity className="text-white w-8 h-8" />
              )}
            </div>
            <h1 className="text-2xl font-bold">Kaptan APP</h1>
            <p className="text-sm text-black/40">Sign in to manage your fleet</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-black/40 ml-1">Username</label>
              <input 
                required
                type="text"
                placeholder="Username"
                value={loginData.username}
                onChange={e => setLoginData(prev => ({ ...prev, username: e.target.value }))}
                className="w-full bg-black/5 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-black transition-all outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-black/40 ml-1">Password</label>
              <input 
                required
                type="password"
                placeholder="••••••••"
                value={loginData.password}
                onChange={e => setLoginData(prev => ({ ...prev, password: e.target.value }))}
                className="w-full bg-black/5 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-black transition-all outline-none"
              />
            </div>
            <button 
              type="submit"
              className="w-full bg-black text-white py-3 rounded-xl font-bold hover:bg-black/80 transition-colors mt-4"
            >
              Sign In
            </button>
            <div className="mt-8 pt-6 border-t border-black/5 text-center">
              <p className="text-[11px] font-bold text-black/60 mb-2">Want to use it as an App?</p>
              <p className="text-[10px] text-black/40 leading-relaxed">
                On Android: Tap the three dots <span className="font-bold">⋮</span> and choose <span className="font-bold">"Install app"</span>.
                <br/>
                On iPhone: Tap the <span className="font-bold">Share</span> button and choose <span className="font-bold">"Add to Home Screen"</span>.
              </p>
            </div>
          </form>
        </motion.div>
      </div>
    );
  }

  const myCar = cars.find(c => c.id === user.car_id);

  return (
    <div className="min-h-screen bg-[#F5F5F5] text-[#1A1A1A] font-sans">
      {/* Header */}
      <header className="bg-white border-b border-black/5 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center overflow-hidden">
            {appLogo ? (
              <img src={appLogo} alt="Kaptan Logo" className="w-full h-full object-cover" />
            ) : (
              <Activity className="text-white w-6 h-6" />
            )}
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Kaptan APP</h1>
            <p className="text-xs text-black/40 uppercase tracking-widest font-semibold">Real-Time Fleet System</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-bold">{user.username}</p>
            <p className="text-[10px] text-black/40 font-mono uppercase">{myCar?.name || user.car_id}</p>
          </div>
          <button 
            onClick={handleLogout}
            className="text-xs font-bold text-red-500 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors"
          >
            Logout
          </button>
          {user.role === 'admin' && (
            <button 
              onClick={() => setIsAdminPanelOpen(true)}
              className="p-2 hover:bg-black/5 rounded-lg transition-colors"
              title="Admin Panel"
            >
              <Settings size={20} />
            </button>
          )}
          <button 
            onClick={() => setIsAddingTrip(true)}
            disabled={user.role !== 'admin' && myCar?.status === 'busy'}
            className={cn(
              "text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm font-medium",
              (user.role !== 'admin' && myCar?.status === 'busy') ? "bg-black/20 cursor-not-allowed" : "bg-black hover:bg-black/80"
            )}
          >
            <Plus size={18} />
            {(user.role !== 'admin' && myCar?.status === 'busy') ? 'In Transit' : 'New Trip'}
          </button>
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Car Status */}
        <div className="lg:col-span-4 space-y-6">
          <section className="bg-white rounded-2xl border border-black/5 overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-black/5 bg-black/[0.02] flex items-center justify-between">
              <h2 className="font-bold flex items-center gap-2">
                <CarIcon size={18} />
                Fleet Status
              </h2>
              <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full font-bold">
                {cars.filter(c => c.status === 'idle').length} Available
              </span>
            </div>
            <div className="divide-y divide-black/5">
              {cars.map(car => (
                <div key={car.id} className={cn(
                  "p-4 hover:bg-black/[0.01] transition-colors group",
                  focusedCarId === car.id && "bg-black/[0.03]",
                  car.id === user.car_id && "bg-emerald-50/30"
                )}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center",
                        car.status === 'idle' ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"
                      )}>
                        <CarIcon size={16} />
                      </div>
                      <div>
                        <p className="font-bold text-sm">
                          {car.name}
                          {car.id === user.car_id && <span className="ml-2 text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded uppercase">You</span>}
                        </p>
                        <p className="text-[10px] text-black/40 font-mono">ID: {car.id}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "text-[10px] font-bold uppercase px-2 py-0.5 rounded-full",
                        car.status === 'idle' ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                      )}>
                        {car.status === 'idle' ? 'Idle' : 'In Transit'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center gap-4 text-[11px] text-black/60 font-mono">
                      <span className="flex items-center gap-1">
                        <Navigation size={10} />
                        {car.lat.toFixed(4)}, {car.lng.toFixed(4)}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setSelectedCarHistory(car)}
                        className="text-[10px] font-bold uppercase bg-black/5 hover:bg-black/10 px-2 py-1 rounded transition-colors flex items-center gap-1"
                      >
                        <History size={10} />
                        History
                      </button>
                      <button 
                        onClick={() => handleViewOnMap(car.id)}
                        className="text-[10px] font-bold uppercase bg-black/5 hover:bg-black/10 px-2 py-1 rounded transition-colors flex items-center gap-1"
                      >
                        <MapPin size={10} />
                        View
                      </button>
                      {car.status === 'busy' && (
                        <button 
                          onClick={() => setCarIdle(car.id)}
                          className="p-1 hover:bg-black/5 rounded text-black/40 hover:text-black transition-colors"
                          title="Finish trip manually"
                        >
                          <CheckCircle2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right Column: Map & History */}
        <div className="lg:col-span-8 space-y-6">
          {/* Real Map Visualization */}
          <section className="bg-white rounded-2xl border border-black/5 p-6 shadow-sm relative overflow-hidden h-[450px]">
            <div className="relative z-10 h-full flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold flex items-center gap-2">
                  <MapPin size={18} />
                  GPS Tracking View
                </h2>
                <div className="flex gap-2">
                  <div className="flex items-center gap-1 text-[10px] font-bold uppercase">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" /> Idle
                  </div>
                  <div className="flex items-center gap-1 text-[10px] font-bold uppercase">
                    <div className="w-2 h-2 rounded-full bg-amber-500" /> In Transit
                  </div>
                </div>
              </div>
              
              <div className="flex-1 bg-black/[0.02] rounded-xl border border-black/5 relative overflow-hidden z-0">
                <MapContainer 
                  center={[cars[0]?.lat || 25.2048, cars[0]?.lng || 55.2708]} 
                  zoom={13} 
                  style={{ height: '100%', width: '100%' }}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <MapFocus carId={focusedCarId} cars={cars} />
                  {cars.map(car => (
                    <Marker 
                      key={car.id} 
                      position={[car.lat, car.lng]}
                      icon={carIcon(car.status, car.id === user.car_id)}
                    >
                      <Popup>
                        <div className="p-1">
                          <p className="font-bold text-sm">{car.name}</p>
                          <p className="text-xs text-black/60 uppercase">{car.status}</p>
                          {car.id === user.car_id && <p className="text-[10px] text-emerald-600 font-bold mt-1">THIS IS YOU</p>}
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              </div>
            </div>
          </section>

          {/* Trip History */}
          <section className="bg-white rounded-2xl border border-black/5 overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-black/5 bg-black/[0.02] flex items-center justify-between">
              <h2 className="font-bold flex items-center gap-2">
                <History size={18} />
                Global Trip History
              </h2>
              <div className="flex items-center gap-2 text-xs font-bold">
                <span className="text-black/40">Total Earned:</span>
                <span className="text-emerald-600">${trips.reduce((acc, t) => acc + t.price, 0).toFixed(2)}</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-black/5 text-[10px] uppercase tracking-widest text-black/40 font-bold">
                    <th className="px-6 py-3">Car</th>
                    <th className="px-6 py-3">Origin</th>
                    <th className="px-6 py-3">Destination</th>
                    <th className="px-6 py-3 text-right">Price</th>
                    <th className="px-6 py-3 text-right">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  <AnimatePresence initial={false}>
                    {trips.map(trip => (
                      <motion.tr 
                        key={trip.id}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={cn(
                          "hover:bg-black/[0.01] transition-colors group",
                          trip.car_id === user.car_id && "bg-emerald-50/20"
                        )}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-black/5 rounded flex items-center justify-center text-black/60">
                              <CarIcon size={12} />
                            </div>
                            <span className="text-sm font-medium">{cars.find(c => c.id === trip.car_id)?.name || trip.car_id}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-black/60">{trip.origin}</td>
                        <td className="px-6 py-4 text-sm text-black/60">{trip.destination}</td>
                        <td className="px-6 py-4 text-right">
                          <span className="text-sm font-bold text-emerald-600">${trip.price.toFixed(2)}</span>
                        </td>
                        <td className="px-6 py-4 text-right text-[10px] font-mono text-black/40">
                          {new Date(trip.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
              {trips.length === 0 && (
                <div className="p-12 text-center text-black/20">
                  <AlertCircle className="mx-auto mb-2" size={32} />
                  <p className="text-sm font-medium">No trips recorded yet</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      {/* New Trip Modal */}
      <AnimatePresence>
        {isAddingTrip && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddingTrip(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-black/5 bg-black/[0.02]">
                <h3 className="text-lg font-bold">New Trip Request</h3>
                <p className="text-xs text-black/40">
                  {user.role === 'admin' ? 'Assign a trip to any car' : `Starting trip for ${myCar?.name || user.car_id}`}
                </p>
              </div>
              <form onSubmit={handleAddTrip} className="p-6 space-y-4">
                {user.role === 'admin' ? (
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-black/40 ml-1">Select Car</label>
                    <select 
                      required
                      value={user.car_id}
                      onChange={e => setUser(prev => prev ? ({ ...prev, car_id: e.target.value }) : null)}
                      className="w-full bg-black/5 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-black transition-all outline-none"
                    >
                      <option value="">Select a car...</option>
                      {cars.filter(c => c.status === 'idle').map(car => (
                        <option key={car.id} value={car.id}>{car.name}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-black/40 ml-1">Assigned Car</label>
                    <div className="w-full bg-black/5 rounded-xl px-4 py-3 text-sm font-bold flex items-center gap-2">
                      <CarIcon size={16} />
                      {myCar?.name || user.car_id}
                    </div>
                  </div>
                )}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-black/40 ml-1">Where to?</label>
                  <input 
                    required
                    type="text"
                    placeholder="Enter destination address"
                    value={newTrip.destination}
                    onChange={e => setNewTrip(prev => ({ ...prev, destination: e.target.value }))}
                    className="w-full bg-black/5 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-black transition-all outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-black/40 ml-1">Estimated Price ($)</label>
                  <div className="relative">
                    <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-black/40" size={16} />
                    <input 
                      required
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={newTrip.price}
                      onChange={e => setNewTrip(prev => ({ ...prev, price: e.target.value }))}
                      className="w-full bg-black/5 border-none rounded-xl pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-black transition-all outline-none"
                    />
                  </div>
                </div>
                <div className="pt-4 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsAddingTrip(false)}
                    className="flex-1 px-4 py-3 rounded-xl border border-black/10 text-sm font-bold hover:bg-black/5 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 px-4 py-3 rounded-xl bg-black text-white text-sm font-bold hover:bg-black/80 transition-colors"
                  >
                    Start Trip
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Admin Panel Modal */}
      <AnimatePresence>
        {isAdminPanelOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAdminPanelOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-black/5 bg-black/[0.02] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center">
                    <ShieldCheck className="text-white w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">Admin Control Center</h3>
                    <p className="text-xs text-black/40">Manage drivers, accounts, and fleet assignments</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsAdminPanelOpen(false)}
                  className="p-2 hover:bg-black/5 rounded-full transition-colors"
                >
                  <Plus className="rotate-45" size={20} />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* User List */}
                <div className="md:col-span-2 space-y-4">
                  <h4 className="font-bold flex items-center gap-2 text-sm">
                    <Users size={16} />
                    Active Accounts
                  </h4>
                  <div className="bg-black/[0.02] rounded-2xl border border-black/5 overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-black/5 text-[10px] uppercase tracking-widest text-black/40 font-bold">
                          <th className="px-4 py-3">User</th>
                          <th className="px-4 py-3">Role</th>
                          <th className="px-4 py-3">Assigned Car</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/5">
                        {adminUsers.map(u => (
                          <tr key={u.id} className="hover:bg-black/[0.01] transition-colors">
                            <td className="px-4 py-3 text-sm font-medium">{u.username}</td>
                            <td className="px-4 py-3">
                              <span className={cn(
                                "text-[10px] font-bold uppercase px-2 py-0.5 rounded-full",
                                u.role === 'admin' ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                              )}>
                                {u.role}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-black/60">
                              {u.car_id ? cars.find(c => c.id === u.car_id)?.name || u.car_id : 'None'}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {u.username !== 'admin' && (
                                <button 
                                  onClick={() => handleDeleteUser(u.id)}
                                  className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Create User Form */}
                <div className="space-y-4">
                  <h4 className="font-bold flex items-center gap-2 text-sm">
                    <Plus size={16} />
                    Create New Account
                  </h4>
                  <form onSubmit={handleCreateUser} className="bg-white border border-black/5 p-4 rounded-2xl space-y-3 shadow-sm">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-black/40">Username</label>
                      <input 
                        required
                        type="text"
                        value={newUserData.username}
                        onChange={e => setNewUserData(prev => ({ ...prev, username: e.target.value }))}
                        className="w-full bg-black/5 border-none rounded-xl px-3 py-2 text-sm outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-black/40">Password</label>
                      <input 
                        required
                        type="password"
                        value={newUserData.password}
                        onChange={e => setNewUserData(prev => ({ ...prev, password: e.target.value }))}
                        className="w-full bg-black/5 border-none rounded-xl px-3 py-2 text-sm outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-black/40">Role</label>
                      <select 
                        value={newUserData.role}
                        onChange={e => setNewUserData(prev => ({ ...prev, role: e.target.value }))}
                        className="w-full bg-black/5 border-none rounded-xl px-3 py-2 text-sm outline-none"
                      >
                        <option value="driver">Driver</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                    {newUserData.role === 'driver' && (
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase text-black/40">Assign Car</label>
                        <select 
                          value={newUserData.car_id}
                          onChange={e => setNewUserData(prev => ({ ...prev, car_id: e.target.value }))}
                          className="w-full bg-black/5 border-none rounded-xl px-3 py-2 text-sm outline-none"
                        >
                          <option value="">No car assigned</option>
                          {cars.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <button 
                      type="submit"
                      className="w-full bg-black text-white py-2 rounded-xl text-sm font-bold hover:bg-black/80 transition-colors mt-2"
                    >
                      Create User
                    </button>
                  </form>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Car History Modal */}
      <AnimatePresence>
        {selectedCarHistory && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedCarHistory(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-black/5 bg-black/[0.02] flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold">{selectedCarHistory.name} History</h3>
                  <p className="text-xs text-black/40">Past trips and earnings for this vehicle</p>
                </div>
                <button 
                  onClick={() => setSelectedCarHistory(null)}
                  className="p-2 hover:bg-black/5 rounded-full transition-colors"
                >
                  <Plus className="rotate-45" size={20} />
                </button>
              </div>
              <div className="p-6 max-h-[60vh] overflow-y-auto">
                {carSpecificTrips.length > 0 ? (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-black/5 text-[10px] uppercase tracking-widest text-black/40 font-bold">
                        <th className="py-3">Origin</th>
                        <th className="py-3">Destination</th>
                        <th className="py-3 text-right">Price</th>
                        <th className="py-3 text-right">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5">
                      {carSpecificTrips.map(trip => (
                        <tr key={trip.id} className="group">
                          <td className="py-4 text-sm text-black/60">{trip.origin}</td>
                          <td className="py-4 text-sm text-black/60">{trip.destination}</td>
                          <td className="py-4 text-right">
                            <span className="text-sm font-bold text-emerald-600">${trip.price.toFixed(2)}</span>
                          </td>
                          <td className="py-4 text-right text-[10px] font-mono text-black/40">
                            {new Date(trip.timestamp).toLocaleDateString()} {new Date(trip.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="py-12 text-center text-black/20">
                    <AlertCircle className="mx-auto mb-2" size={32} />
                    <p className="text-sm font-medium">No trips recorded for this car</p>
                  </div>
                )}
              </div>
              <div className="p-6 border-t border-black/5 bg-black/[0.01] flex justify-between items-center">
                <span className="text-xs font-bold text-black/40 uppercase">Total Earnings</span>
                <span className="text-lg font-bold text-emerald-600">
                  ${carSpecificTrips.reduce((acc, t) => acc + t.price, 0).toFixed(2)}
                </span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
