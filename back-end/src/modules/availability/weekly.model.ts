import { Schema, model, Types, type HydratedDocument } from 'mongoose';

export interface TimeRange {
  startMinute: number;
  endMinute: number;
}

export interface DayAvailability {
  day: number;
  enabled: boolean;
  timeRanges: TimeRange[];
}

export interface WeeklyAvailability {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  daysAvailability: DayAvailability[];
  createdAt: Date;
  updatedAt: Date;
}

const TimeRangeSchema = new Schema<TimeRange>(
  {
    startMinute: { type: Number, required: true, min: 0, max: 1439 },
    endMinute: { type: Number, required: true, min: 1, max: 1440 },
  },
  { _id: false },
);

const DayAvailabilitySchema = new Schema<DayAvailability>(
  {
    day: { type: Number, required: true, min: 0, max: 6 },
    enabled: { type: Boolean, required: true, default: false },
    timeRanges: { type: [TimeRangeSchema], default: () => [] },
  },
  { _id: false },
);

const WeeklyAvailabilitySchema = new Schema<WeeklyAvailability>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    daysAvailability: { type: [DayAvailabilitySchema], default: () => [] },
  },
  { timestamps: true },
);

export type WeeklyAvailabilityDoc = HydratedDocument<WeeklyAvailability>;

export const WeeklyAvailabilityModel = model<WeeklyAvailability>(
  'WeeklyAvailability',
  WeeklyAvailabilitySchema,
);

export const DEFAULT_DAYS: DayAvailability[] = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
  day: d,
  enabled: false,
  timeRanges: [],
}));
