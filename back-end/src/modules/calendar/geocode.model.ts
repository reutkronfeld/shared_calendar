import { Schema, model } from 'mongoose';

export interface Geocode {
  key: string;
  query: string;
  lat: number | null;
  lng: number | null;
  resolved: boolean;
  updatedAt: Date;
}

const GeocodeSchema = new Schema<Geocode>(
  {
    key: { type: String, required: true, unique: true, index: true },
    query: { type: String, required: true },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    resolved: { type: Boolean, required: true, default: false },
  },
  { timestamps: { createdAt: false, updatedAt: true } },
);

export const GeocodeModel = model<Geocode>('Geocode', GeocodeSchema);
