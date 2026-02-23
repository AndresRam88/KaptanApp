import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import session from "express-session";

import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use a path that works with Railway Volumes
const dbPath = process.env.DATABASE_URL || path.join(__dirname, "kaptan_v1.db");
const db = new Database(dbPath);

// Logo generation helper
async function generateLogo() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: 'A professional, minimalist vector logo for a transport app called "Kaptan APP". Fusing Pakistan crescent and Dubai Burj Khalifa. Deep green and gold.' }],
      },
    });

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
  } catch (e) {
    console.error("Logo generation failed:", e);
  }
  return null;
}

// Initialize DB
db.exec(`
  CREATE TABLE IF NOT EXISTS cars (
    id TEXT PRIMARY KEY,
    name TEXT,
    lat REAL,
    lng REAL,
    status TEXT DEFAULT 'idle',
    target_lat REAL,
    target_lng REAL
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    car_id TEXT,
    role TEXT DEFAULT 'driver',
    FOREIGN KEY(car_id) REFERENCES cars(id)
  );

  CREATE TABLE IF NOT EXISTS trips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    car_id TEXT,
    origin TEXT,
    destination TEXT,
    price REAL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Seed initial cars and users if empty
const carCount = db.prepare("SELECT COUNT(*) as count FROM cars").get() as { count: number };
const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };

if (carCount.count === 0) {
  const initialNames = ['Umar', 'Usman', 'Buta'];
  const insertCar = db.prepare("INSERT INTO cars (id, name, lat, lng, status) VALUES (?, ?, ?, ?, ?)");
  for (let i = 0; i < initialNames.length; i++) {
    const carId = `car-${i + 1}`;
    insertCar.run(carId, initialNames[i], 19.4326 + (Math.random() - 0.5) * 0.01, -99.1332 + (Math.random() - 0.5) * 0.01, 'idle');
  }
}

if (userCount.count === 0) {
  const initialNames = ['Umar', 'Usman', 'Buta'];
  const insertUser = db.prepare("INSERT INTO users (username, password, car_id, role) VALUES (?, ?, ?, ?)");
  // Seed Admin
  insertUser.run('admin', 'admin123', null, 'admin');
  // Seed Drivers
  for (let i = 0; i < initialNames.length; i++) {
    const username = initialNames[i].toLowerCase().replace(' ', '');
    insertUser.run(username, `pass${i + 1}`, `car-${i + 1}`, 'driver');
  }
}

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  const PORT = 3000;

  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(session({
    secret: 'kaptan-app-secret',
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      secure: true,
      sameSite: 'none',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  }));

  // API Routes
  app.get("/api/logo", async (req, res) => {
    const logo = await generateLogo();
    res.json({ logo });
  });

  app.post("/api/login", (req, res) => {
    const { username, password } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE username = ? AND password = ?").get(username, password) as any;
    
    if (user) {
      (req.session as any).userId = user.id;
      (req.session as any).carId = user.car_id;
      (req.session as any).role = user.role;
      req.session.save((err) => {
        if (err) return res.status(500).json({ error: "Session save failed" });
        res.json({ id: user.id, username: user.username, car_id: user.car_id, role: user.role });
      });
    } else {
      res.status(401).json({ error: "Invalid credentials" });
    }
  });

  app.get("/api/me", (req, res) => {
    const userId = (req.session as any).userId;
    if (userId) {
      const user = db.prepare("SELECT id, username, car_id, role FROM users WHERE id = ?").get(userId) as any;
      res.json(user);
    } else {
      res.status(401).json({ error: "Not authenticated" });
    }
  });

  // Admin Routes
  app.get("/api/admin/users", (req, res) => {
    if ((req.session as any).role !== 'admin') return res.status(403).json({ error: "Forbidden" });
    const users = db.prepare("SELECT id, username, car_id, role FROM users").all();
    res.json(users);
  });

  app.post("/api/admin/users", (req, res) => {
    if ((req.session as any).role !== 'admin') return res.status(403).json({ error: "Forbidden" });
    const { username, password, car_id, role } = req.body;
    try {
      const info = db.prepare("INSERT INTO users (username, password, car_id, role) VALUES (?, ?, ?, ?)").run(username, password, car_id, role);
      res.json({ id: info.lastInsertRowid, username, car_id, role });
    } catch (e) {
      res.status(400).json({ error: "Username already exists" });
    }
  });

  app.delete("/api/admin/users/:id", (req, res) => {
    if ((req.session as any).role !== 'admin') return res.status(403).json({ error: "Forbidden" });
    db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.post("/api/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });

  app.get("/api/cars", (req, res) => {
    const cars = db.prepare("SELECT * FROM cars").all();
    res.json(cars);
  });

  app.get("/api/trips", (req, res) => {
    const trips = db.prepare("SELECT * FROM trips ORDER BY timestamp DESC LIMIT 50").all();
    res.json(trips);
  });

  app.post("/api/trips", (req, res) => {
    const { car_id, destination, price } = req.body;
    
    // Get current car location as origin
    const car = db.prepare("SELECT * FROM cars WHERE id = ?").get(car_id) as any;
    const origin = "Current Location";
    
    // Generate a random target location near the city center for simulation
    const target_lat = 19.4326 + (Math.random() - 0.5) * 0.05;
    const target_lng = -99.1332 + (Math.random() - 0.5) * 0.05;

    const info = db.prepare("INSERT INTO trips (car_id, origin, destination, price) VALUES (?, ?, ?, ?)").run(car_id, origin, destination, price);
    db.prepare("UPDATE cars SET status = 'busy', target_lat = ?, target_lng = ? WHERE id = ?").run(target_lat, target_lng, car_id);
    
    const newTrip = { id: info.lastInsertRowid, car_id, origin, destination, price, timestamp: new Date().toISOString() };
    io.emit("trip:new", newTrip);
    io.emit("car:update", db.prepare("SELECT * FROM cars WHERE id = ?").get(car_id));
    
    res.json(newTrip);
  });

  app.post("/api/cars/:id/location", (req, res) => {
    const { id } = req.params;
    const { lat, lng } = req.body;
    db.prepare("UPDATE cars SET lat = ?, lng = ? WHERE id = ?").run(lat, lng, id);
    const updatedCar = db.prepare("SELECT * FROM cars WHERE id = ?").get(id);
    io.emit("car:update", updatedCar);
    res.json(updatedCar);
  });

  app.post("/api/cars/:id/idle", (req, res) => {
    const { id } = req.params;
    db.prepare("UPDATE cars SET status = 'idle', target_lat = NULL, target_lng = NULL WHERE id = ?").run(id);
    const updatedCar = db.prepare("SELECT * FROM cars WHERE id = ?").get(id);
    io.emit("car:update", updatedCar);
    res.json(updatedCar);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);
    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
