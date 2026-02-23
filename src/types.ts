export interface Car {
  id: string;
  name: string;
  lat: number;
  lng: number;
  status: 'idle' | 'busy';
  target_lat?: number;
  target_lng?: number;
}

export interface Trip {
  id: number;
  car_id: string;
  origin: string;
  destination: string;
  price: number;
  timestamp: string;
}
